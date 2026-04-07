# Despliegue en Producción — Expense Control Assistant

Servidor: `192.168.1.212` | Perfil SSH: `deploy`

---

## Arquitectura final en el servidor

```
Puerto 80  → nginx (10x-builders-nginx) → 10x-builders-web (existente, sin cambios)
Puerto 3000 → nginx (10x-builders-nginx) → /expense/      → expense-app  (React, nginx:alpine)
                                          → /expense-api/ → expense-api  (NestJS)
Puerto 3002 → open-webui (movido de 3000)
```

Todos los contenedores de Expense Control corren en la red Docker `expense_network`.
El contenedor `10x-builders-nginx` se conecta a esa red para alcanzar `expense-app` y `expense-api` por hostname.

---

## Pre-requisitos

En el servidor deben estar instalados:
- Docker Engine >= 24
- Docker Compose v2 (`docker compose` sin guion)
- Git
- Acceso SSH configurado como perfil `deploy` en `~/.ssh/config`:

```
Host deploy
    HostName 192.168.1.212
    User <tu-usuario>
    IdentityFile ~/.ssh/id_ed25519
```

Verifica acceso:
```bash
ssh deploy "docker --version && docker compose version"
```

---

## Paso 1 — Clonar el repositorio en el servidor

```bash
ssh deploy
mkdir -p ~/expense-control
cd ~/expense-control
git clone https://github.com/<tu-usuario>/expense-control-assistant.git .
# o si ya existe:
git pull origin trunk
```

---

## Paso 2 — Crear el archivo `.env.production` en el servidor

```bash
# En tu máquina local, copia el template
scp .env.production deploy:~/expense-control/.env.production

# En el servidor, edita los valores CHANGE_ME
ssh deploy "nano ~/expense-control/.env.production"
```

Valores mínimos a cambiar:

| Variable | Valor recomendado |
|---|---|
| `POSTGRES_PASSWORD` | Cadena aleatoria >= 20 caracteres |
| `DATABASE_URL` | Misma contraseña que `POSTGRES_PASSWORD` |
| `JWT_SECRET` | `openssl rand -hex 64` |
| `FRONTEND_URL` | `http://192.168.1.212:3000` |
| `VITE_API_URL` | `http://192.168.1.212:3000/expense-api` |

Genera el JWT secret:
```bash
openssl rand -hex 64
```

---

## Paso 3 — Crear la red Docker `expense_network`

```bash
ssh deploy "docker network create expense_network 2>/dev/null || echo 'Red ya existe'"
```

---

## Paso 4 — Mover open-webui del puerto 3000 al 3002

> open-webui actualmente ocupa el puerto 3000, que necesitamos para el nginx de expense-control.

```bash
ssh deploy bash << 'EOF'
# Obtener el comando original con el que se creó open-webui
docker inspect open-webui --format '{{.HostConfig.PortBindings}}'

# Detener y eliminar el contenedor (datos persisten en su volumen)
docker stop open-webui && docker rm open-webui

# Recrear en puerto 3002
docker run -d \
  --name open-webui \
  --restart unless-stopped \
  -p 3002:8080 \
  -v open-webui:/app/backend/data \
  ghcr.io/open-webui/open-webui:latest

echo "open-webui corriendo en :3002"
docker ps | grep open-webui
EOF
```

> Si open-webui tiene variables de entorno adicionales (OPENAI_API_KEY, etc.) agrégalas al comando `docker run` con `-e VAR=valor`.

---

## Paso 5 — Agregar el puerto 3000 al contenedor nginx existente

El contenedor `10x-builders-nginx` actualmente solo expone el puerto 80. Necesitamos añadirle el 3000.

> No es posible agregar puertos a un contenedor en ejecución sin recrearlo.
> Necesitas conocer cómo se levanta el contenedor `10x-builders-nginx` (compose file o comando run).

### Opción A — Si el nginx corre con docker-compose del proyecto 10x-builders:

```bash
# En el proyecto 10x-builders, edita el docker-compose.yml del nginx:
# Agrega:  - "3000:3000"  en la sección ports

ssh deploy "cd ~/10x-builders && nano docker-compose.yml"

# Recrear solo el contenedor nginx (sin detener los demás)
ssh deploy "cd ~/10x-builders && docker compose up -d --no-deps nginx"
```

### Opción B — Si el nginx corre con `docker run`:

```bash
ssh deploy bash << 'EOF'
# Detener nginx actual
docker stop 10x-builders-nginx && docker rm 10x-builders-nginx

# Recrear con puerto adicional 3000
docker run -d \
  --name 10x-builders-nginx \
  --restart unless-stopped \
  -p 80:80 \
  -p 3000:3000 \
  -v /ruta/a/nginx.conf:/etc/nginx/nginx.conf:ro \
  -v /ruta/a/conf.d:/etc/nginx/conf.d:ro \
  nginx:1.27-alpine

echo "nginx expone :80 y :3000"
docker ps | grep nginx
EOF
```

---

## Paso 6 — Conectar nginx y 10x-builders-web a expense_network

```bash
ssh deploy bash << 'EOF'
docker network connect expense_network 10x-builders-nginx
docker network connect expense_network 10x-builders-web
echo "Contenedores conectados a expense_network:"
docker network inspect expense_network --format '{{range .Containers}}  {{.Name}}{{"\n"}}{{end}}'
EOF
```

---

## Paso 7 — Copiar la configuración nginx de expense-control al servidor

```bash
# Desde tu máquina local
scp nginx/expense-control.conf deploy:/tmp/expense-control.conf

# En el servidor: copiar el .conf al directorio que nginx puede incluir
ssh deploy bash << 'EOF'
# Crear el directorio conf.d dentro del contenedor (si no existe)
docker exec 10x-builders-nginx mkdir -p /etc/nginx/conf.d

# Copiar el archivo de configuración al contenedor
docker cp /tmp/expense-control.conf 10x-builders-nginx:/etc/nginx/conf.d/expense-control.conf

echo "Contenido de /etc/nginx/conf.d:"
docker exec 10x-builders-nginx ls -la /etc/nginx/conf.d/
EOF
```

---

## Paso 8 — Agregar `include` al nginx.conf del servidor (una sola línea)

Este es el ÚNICO cambio al `nginx.conf` existente. Se agrega una línea `include` al final del bloque `http {}`, antes del cierre `}`.

```bash
ssh deploy bash << 'EOF'
# Verificar que la línea include no existe ya
docker exec 10x-builders-nginx grep -q "conf.d/\*.conf" /etc/nginx/nginx.conf \
  && echo "include ya existe, no se hace nada" \
  || {
    # Agregar include antes del último } del archivo (cierre de http {})
    docker exec 10x-builders-nginx sh -c \
      "sed -i 's|}$|    include /etc/nginx/conf.d/*.conf;\n}|' /etc/nginx/nginx.conf"
    echo "Línea include agregada correctamente"
  }

# Verificar la sintaxis del nginx.conf completo
docker exec 10x-builders-nginx nginx -t
EOF
```

> Si el `nginx -t` falla, revisa el archivo con:
> ```bash
> docker exec 10x-builders-nginx cat /etc/nginx/nginx.conf
> ```

---

## Paso 9 — Levantar los servicios de Expense Control

### Opción A — Stack completo (BD + API + App) — primera vez o si no tienes BD previa:

```bash
ssh deploy bash << 'EOF'
cd ~/expense-control
VITE_API_URL=http://192.168.1.212:3000/expense-api \
  docker compose up -d --build
echo "Servicios levantados:"
docker ps | grep expense
EOF
```

### Opción B — Solo API + App (BD ya está corriendo):

```bash
ssh deploy bash << 'EOF'
cd ~/expense-control

# Asegurarse de que la BD ya está en expense_network
docker network connect expense_network expense_control_db 2>/dev/null || true

VITE_API_URL=http://192.168.1.212:3000/expense-api \
  docker compose -f docker-compose.app.yml up -d --build
echo "API y App levantadas:"
docker ps | grep expense
EOF
```

### Opción C — Solo BD:

```bash
ssh deploy bash << 'EOF'
cd ~/expense-control
docker compose -f db/docker-compose.yml up -d
docker ps | grep expense_control_db
EOF
```

---

## Paso 10 — Recargar nginx

```bash
ssh deploy bash << 'EOF'
# Test sintaxis antes de recargar
docker exec 10x-builders-nginx nginx -t && \
  docker exec 10x-builders-nginx nginx -s reload && \
  echo "nginx recargado correctamente"
EOF
```

---

## Paso 11 — Verificación

```bash
ssh deploy bash << 'EOF'
echo "=== Contenedores corriendo ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "=== Redes ==="
docker network inspect expense_network --format '{{range .Containers}}  {{.Name}}{{"\n"}}{{end}}'

echo ""
echo "=== Test endpoints ==="
# Frontend React
curl -sI http://localhost:3000/expense/ | head -5

# API (debe responder aunque sea 401/404 — prueba que NestJS responde)
curl -sI http://localhost:3000/expense-api/ | head -5

echo ""
echo "=== Logs API (últimas 20 líneas) ==="
docker logs expense_control_api --tail 20
EOF
```

Desde tu máquina local:
```bash
# Frontend
curl -sI http://192.168.1.212:3000/expense/

# API
curl -sI http://192.168.1.212:3000/expense-api/

# open-webui (nueva ubicación)
curl -sI http://192.168.1.212:3002/
```

---

## Comandos útiles post-despliegue

```bash
# Ver logs de todos los servicios
ssh deploy "cd ~/expense-control && docker compose logs -f"

# Ver logs solo del API
ssh deploy "docker logs expense_control_api -f"

# Reiniciar solo el API (sin rebuild)
ssh deploy "docker restart expense_control_api"

# Actualizar y redesplegar (rebuild completo)
ssh deploy bash << 'EOF'
cd ~/expense-control
git pull origin trunk
VITE_API_URL=http://192.168.1.212:3000/expense-api \
  docker compose up -d --build
EOF

# Reset completo de la BD (¡BORRA TODOS LOS DATOS!)
ssh deploy bash << 'EOF'
cd ~/expense-control
docker compose -f db/docker-compose.yml down -v
docker compose -f db/docker-compose.yml up -d
EOF

# Acceder a la BD directamente
ssh deploy "docker exec -it expense_control_db psql -U postgres -d expense_control"
```

---

## Estructura de archivos del proyecto (referencia)

```
expense-control-assistant/
├── api/
│   ├── Dockerfile              ← Multi-stage NestJS build
│   └── src/
├── app/
│   ├── Dockerfile              ← Multi-stage React + nginx:alpine
│   ├── nginx-static.conf       ← Config nginx para servir la SPA
│   └── vite.config.ts          ← base: '/expense/' en producción
├── db/
│   ├── docker-compose.yml      ← Solo PostgreSQL (standalone)
│   └── init.sql
├── nginx/
│   └── expense-control.conf    ← Include nginx: upstreams + server :3000
├── docker-compose.yml          ← Stack completo (DB + API + App)
├── docker-compose.app.yml      ← Solo API + App (BD externa)
├── .env.production             ← Template de variables (no commitear con secretos)
└── despliegue-prd.md           ← Este documento
```

---

## Mejores prácticas de modularización recomendadas

### A — Include pattern nginx (ya implementado)
Cada servicio aporta su propio `.conf` en `/etc/nginx/conf.d/`. El `nginx.conf` global solo tiene `include /etc/nginx/conf.d/*.conf;`. Para agregar un nuevo servicio: copiar un archivo `.conf`, hacer `nginx -s reload`.

### B — Docker Compose profiles
Permite levantar subconjuntos del stack con un flag:
```bash
docker compose --profile db up -d      # Solo BD
docker compose --profile app up -d     # Solo App + API
docker compose up -d                   # Todo
```

### C — Makefile de despliegue
Un `Makefile` en el repo para estandarizar los comandos frecuentes:
```makefile
deploy:
	ssh deploy "cd ~/expense-control && git pull && docker compose up -d --build"

restart-api:
	ssh deploy "docker restart expense_control_api"

logs:
	ssh deploy "docker compose -f ~/expense-control/docker-compose.yml logs -f"

db-reset:
	ssh deploy "cd ~/expense-control && docker compose -f db/docker-compose.yml down -v && docker compose -f db/docker-compose.yml up -d"
```

### D — Imagen pre-buildeada con tag de commit
Buildear localmente y pushear antes de hacer SSH (evita instalar build tools en el servidor):
```bash
# Local: buildear y taggear con el commit
API_TAG=$(git rev-parse --short HEAD)
docker build -t expense-control/api:$API_TAG ./api
docker build --build-arg VITE_API_URL=http://192.168.1.212:3000/expense-api \
             --build-arg VITE_BASE=/expense/ \
             -t expense-control/app:$API_TAG ./app

# Pushear a registry (ejemplo: ghcr.io)
docker push ghcr.io/<usuario>/expense-control-api:$API_TAG
docker push ghcr.io/<usuario>/expense-control-app:$API_TAG

# En el servidor, solo hacer pull y restart
ssh deploy "docker pull ghcr.io/<usuario>/expense-control-api:$API_TAG && docker restart expense_control_api"
```
