# Despliegue en Producción — Expense Control Assistant

Servidor: `192.168.1.212` (Ubuntu) | Usuario SSH: `deploy`
Última actualización: 2026-04-07

---

## Changelog de arquitectura

| Fecha | Cambio |
|---|---|
| 2026-04-07 | Nginx unificado: server block único escucha en `:80` y `:3000` (antes dos bloques separados) |
| 2026-04-07 | `expense_network` agregada como red externa al `docker-compose.yml` de 10x-builders |
| 2026-04-07 | `context/nginx.conf` centraliza todas las rutas (10x-builders + expense-control) |
| 2026-04-07 | `GET /health` agregado al NestJS API para Docker healthcheck |
| 2026-04-07 | `BrowserRouter` con `basename` en React app para soporte de sub-ruta `/expense/` |
| 2026-04-07 | `Cache-Control: no-cache` en `/expense/` + `immutable` en `/expense/assets/` |
| 2026-04-07 | `VITE_API_URL` cambiado a relativa (`/expense-api`) para compatibilidad LAN + ngrok |

---

## Features implementadas (2026-04-07)

### 1. Endpoint `GET /health` en NestJS API
- **Archivo:** `api/src/app.controller.ts`
- **Motivo:** Docker healthcheck requería un endpoint que retorne 200. Sin esto, el contenedor quedaba en estado `unhealthy`.
- **Respuesta:** `{ "status": "ok" }`

### 2. React Router `basename` para sub-ruta `/expense/`
- **Archivos:** `app/src/App.tsx`, `app/src/lib/apiClient.ts`
- **Motivo:** La SPA se sirve bajo `/expense/`, no en raíz. Sin `basename`, React Router no matcheaba ninguna ruta y la pantalla quedaba en blanco.
- **Detalle:** Se usa `import.meta.env.BASE_URL.replace(/\/$/, '') || '/'` para remover el trailing slash que requiere React Router v6.

### 3. Cache-busting automático del frontend
- **Archivo:** `context/nginx.conf` — `location /expense/`
- **Motivo:** Tras deploys, el browser cacheaba `index.html` viejo que apuntaba a assets con hashes obsoletos, causando pantalla en blanco sin hard-refresh.
- **Solución:** `index.html` → `Cache-Control: no-cache` / Assets → `Cache-Control: immutable`

### 4. Nginx unificado (context/nginx.conf)
- **Motivo:** Antes existían dos server blocks separados en distintos archivos. El nginx de 10x-builders no enrutaba a expense-control.
- **Resultado:** Un solo server block con `listen 80; listen 3000;` maneja todas las rutas.

---

## Arquitectura en producción

```
Internet (HTTPS)
    │
    ▼
10x-builders-ngrok          ← túnel ngrok/ngrok:latest → nginx:80 (interno Docker)
    │
    ▼
10x-builders-nginx          ← nginx:1.27-alpine
  listen 80   (ngrok inbound)
  listen 3000 (LAN directo, mapeado al host)
    │
    ├── /expense/           → expense-app:80      (React SPA, nginx:alpine)
    ├── /expense-api/auth/  → expense-api:3000    (NestJS, rate limit auth)
    ├── /expense-api/       → expense-api:3000    (NestJS REST)
    ├── /agent              → web:3000            (Next.js / LLM agent)
    ├── /api/auth/          → web:3000            (10x-builders auth)
    ├── /api/               → web:3000            (10x-builders API)
    └── /                   → redirect /expense/

expense-api → expense_control_db:5432  (PostgreSQL 17)
```

**Redes Docker:**
- `10x-builders_internal`: nginx ↔ web (10x-builders-web) ↔ ngrok
- `expense_network`: nginx ↔ expense-app ↔ expense-api ↔ db

`10x-builders-nginx` está en **ambas redes**, permitiéndole enrutar a todos los servicios.

**Acceso:**
- LAN: `http://192.168.1.212:3000`
- Internet (ngrok): URL generada por ngrok (ver `http://192.168.1.212:4040`)

---

## Rutas y servicios

| Path | Servicio | Contenedor |
|---|---|---|
| `/expense/` | React SPA | `expense_control_app` |
| `/expense-api/` | NestJS REST API | `expense_control_api` |
| `/expense-api/auth/` | NestJS auth (rate limit estricto) | `expense_control_api` |
| `/agent` | Next.js + LLM agent | `10x-builders-web` |
| `/api/` | 10x-builders API | `10x-builders-web` |
| `http://192.168.1.212:3002` | open-webui | `open-webui` |
| `http://192.168.1.212:4040` | ngrok dashboard | `10x-builders-ngrok` |
| `http://192.168.1.212:5432` | PostgreSQL 17 | `expense_control_db` |

---

## Pre-requisitos en el servidor

> Ejecutar **directamente en el servidor** tras `ssh deploy@192.168.1.212`.

### 1. Docker Engine

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl

sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
```

### 2. docker-compose v1 (el proyecto usa `docker-compose`, no `docker compose`)

```bash
sudo apt-get install -y docker-compose
```

### 3. Agregar usuario al grupo docker

```bash
sudo usermod -aG docker $(whoami)
# Cerrar sesión y reconectar para que surta efecto
```

### 4. rsync

```bash
sudo apt-get install -y rsync
```

### 5. Puertos en firewall

```bash
sudo ufw allow 3000/tcp comment 'expense-control + 10x-builders'
sudo ufw allow 3002/tcp comment 'open-webui'
sudo ufw allow 4040/tcp comment 'ngrok dashboard'
sudo ufw reload
```

---

## Estructura de directorios en el servidor

```
/opt/
├── expense-control/          ← proyecto expense-control-assistant
│   ├── api/
│   ├── app/
│   ├── db/
│   ├── context/
│   ├── docker-compose.yml
│   ├── docker-compose.app.yml
│   └── .env.production       ← secretos reales (NO en git, NO en rsync)
│
└── 10x-builders/             ← proyecto 10x-builders (nginx + agente)
    ├── nginx/
    │   └── nginx.conf        ← bind mount en el contenedor (este repo: context/nginx.conf)
    ├── docker-compose.yml
    └── .env
```

---

## Instalación inicial (primera vez)

### Paso 1 — Crear directorios en el servidor

```bash
ssh deploy@192.168.1.212 'mkdir -p /opt/expense-control'
```

### Paso 2 — Sincronizar el proyecto (desde tu Mac)

```bash
# Desde el root del repo local:
rsync -avz --progress \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='dist' \
  --exclude='coverage' \
  --exclude='.env' \
  --exclude='api/.env' \
  --exclude='app/.env' \
  --exclude='.env.production' \
  --exclude='.env.production.local' \
  ./ deploy@192.168.1.212:/opt/expense-control/

echo "✓ rsync completado"
```

> **Nota:** `.env.production` se excluye del rsync para no sobreescribir secretos reales.
> Se gestiona por separado (ver Paso 3).

### Paso 3 — Crear `.env.production` en el servidor

```bash
# Copiar el template (si no existe aún)
scp .env.production deploy@192.168.1.212:/opt/expense-control/.env.production

# Editar en el servidor con valores reales
ssh deploy@192.168.1.212 "nano /opt/expense-control/.env.production"
```

**Variables obligatorias:**

| Variable | Valor recomendado |
|---|---|
| `POSTGRES_PASSWORD` | Cadena aleatoria ≥ 20 caracteres |
| `DATABASE_URL` | `postgresql://postgres:<PASSWORD>@expense-db:5432/expense_control` |
| `JWT_SECRET` | `openssl rand -hex 64` |
| `FRONTEND_URL` | `http://192.168.1.212:3000` |
| `VITE_API_URL` | `/expense-api` ← **relativa**, funciona desde LAN y ngrok |
| `VITE_BASE` | `/expense/` |
| `PORT` | `3000` |
| `NODE_ENV` | `production` |

> `VITE_API_URL` **debe ser relativa** (`/expense-api`) para que el frontend funcione
> tanto desde LAN (`http://192.168.1.212:3000`) como desde internet (ngrok HTTPS).

Generar JWT secret:

```bash
ssh deploy@192.168.1.212 "openssl rand -hex 64"
```

### Paso 4 — Crear red Docker `expense_network`

```bash
ssh deploy@192.168.1.212 "docker network create expense_network 2>/dev/null || echo 'ya existe'"
```

### Paso 5 — Copiar nginx.conf al proyecto 10x-builders

El nginx unificado (`context/nginx.conf`) combina las rutas de 10x-builders y expense-control
en un único server block. Se copia al servidor donde nginx lo lee desde el bind mount.

```bash
scp context/nginx.conf deploy@192.168.1.212:/opt/10x-builders/nginx/nginx.conf
echo "✓ nginx.conf copiado"
```

### Paso 6 — Agregar `expense_network` al docker-compose de 10x-builders

```bash
ssh deploy@192.168.1.212 python3 << 'PYEOF'
import yaml

path = '/opt/10x-builders/docker-compose.yml'
with open(path) as f:
    cfg = yaml.safe_load(f)

nginx_nets = cfg['services']['nginx']['networks']
if 'expense_network' not in nginx_nets:
    nginx_nets.append('expense_network')

cfg.setdefault('networks', {})['expense_network'] = {
    'external': True,
    'name': 'expense_network'
}

with open(path, 'w') as f:
    yaml.dump(cfg, f, default_flow_style=False, allow_unicode=True)

print("✓ docker-compose.yml actualizado")
PYEOF
```

### Paso 7 — Levantar nginx (10x-builders)

```bash
ssh deploy@192.168.1.212 bash << 'EOF'
cd /opt/10x-builders
docker-compose up -d nginx
sleep 2

docker exec 10x-builders-nginx nginx -t && echo "✓ nginx config OK"

echo "redes de nginx:"
docker inspect 10x-builders-nginx \
  --format '{{range $k,$v := .NetworkSettings.Networks}}  {{$k}}{{"\n"}}{{end}}'
EOF
```

> Debe mostrar `10x-builders_internal` y `expense_network`.

### Paso 8 — Levantar expense-control (BD + API + App)

```bash
ssh deploy@192.168.1.212 bash << 'EOF'
cd /opt/expense-control
docker-compose up -d --build
echo "✓ expense-control levantado"
docker ps | grep expense
EOF
```

### Paso 9 — Verificación completa

```bash
ssh deploy@192.168.1.212 bash << 'EOF'
echo "=== CONTENEDORES ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "=== TEST RUTAS (puerto 3000) ==="
sleep 8
echo -n "/expense/           → " && curl -so /dev/null -w "%{http_code}\n" http://localhost:3000/expense/
echo -n "/expense-api/health → " && curl -s http://localhost:3000/expense-api/health
echo ""
echo -n "/agent              → " && curl -so /dev/null -w "%{http_code}\n" http://localhost:3000/agent

echo ""
echo "=== NGROK URL ==="
curl -s http://localhost:4040/api/tunnels | \
  python3 -c "import json,sys; t=json.load(sys.stdin)['tunnels']; print(t[0]['public_url'] if t else 'sin túnel')"
EOF
```

**Resultado esperado:**
```
/expense/           → 200
/expense-api/health → {"status":"ok"}
/agent              → 200 o 307 (redirect Next.js — normal)
```

---

## Actualizar el despliegue (flujo normal)

### Actualización de código (sin cambios de BD)

```bash
# 1. Sincronizar archivos modificados
rsync -avz --progress \
  --exclude='node_modules' --exclude='.git' --exclude='dist' \
  --exclude='coverage' --exclude='.env' --exclude='api/.env' \
  --exclude='app/.env' --exclude='.env.production' \
  --exclude='.env.production.local' \
  ./ deploy@192.168.1.212:/opt/expense-control/

# 2. Rebuild y restart en el servidor
ssh deploy@192.168.1.212 bash << 'EOF'
cd /opt/expense-control
docker-compose up -d --build expense-api expense-app
EOF
```

### Actualizar solo el nginx (cambios en context/nginx.conf)

```bash
scp context/nginx.conf deploy@192.168.1.212:/opt/10x-builders/nginx/nginx.conf

ssh deploy@192.168.1.212 bash << 'EOF'
docker exec 10x-builders-nginx nginx -t && \
  docker exec 10x-builders-nginx nginx -s reload && \
  echo "✓ nginx recargado"
EOF
```

> **Nota sobre inodes:** `scp` crea un nuevo inode. Si nginx no ve los cambios tras reload,
> usar `docker restart 10x-builders-nginx` para forzar la re-lectura del bind mount.

---

## Comandos útiles post-despliegue

```bash
# Ver todos los contenedores
ssh deploy@192.168.1.212 "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

# Logs del API
ssh deploy@192.168.1.212 "docker logs expense_control_api -f --tail 50"

# Logs del nginx
ssh deploy@192.168.1.212 "docker logs 10x-builders-nginx -f --tail 50"

# Reiniciar solo el API (sin rebuild)
ssh deploy@192.168.1.212 "docker restart expense_control_api"

# Acceder a la BD
ssh deploy@192.168.1.212 "docker exec -it expense_control_db psql -U postgres -d expense_control"

# Reset completo de la BD (⚠️ borra todos los datos)
ssh deploy@192.168.1.212 bash << 'EOF'
cd /opt/expense-control
docker-compose -f db/docker-compose.yml down -v
docker-compose -f db/docker-compose.yml up -d
EOF

# Limpiar contenedores e imágenes sin usar
ssh deploy@192.168.1.212 "docker system prune -f"

# Ver URL ngrok activa
ssh deploy@192.168.1.212 "curl -s http://localhost:4040/api/tunnels | python3 -c \"import json,sys; t=json.load(sys.stdin)['tunnels']; print(t[0]['public_url'] if t else 'sin túnel')\""
```

---

## Troubleshooting

### nginx no enruta a expense (502 Bad Gateway)

```bash
# Verificar que nginx está en expense_network
ssh deploy@192.168.1.212 "docker inspect 10x-builders-nginx \
  --format '{{range \$k,\$v := .NetworkSettings.Networks}}{{\$k}} {{end}}'"
# Debe mostrar: 10x-builders_internal expense_network

# Si falta expense_network, conectar manualmente:
ssh deploy@192.168.1.212 "docker network connect expense_network 10x-builders-nginx && \
  docker exec 10x-builders-nginx nginx -s reload"
```

### API unhealthy

```bash
ssh deploy@192.168.1.212 bash << 'EOF'
docker logs expense_control_api --tail 30
# Probar healthcheck manualmente:
docker exec expense_control_api wget -qO- http://localhost:3000/health
EOF
```

### Frontend no puede conectar al API (desde ngrok)

Verificar que `VITE_API_URL` es relativa en `.env.production`:
```bash
ssh deploy@192.168.1.212 "grep VITE_API_URL /opt/expense-control/.env.production"
# Debe mostrar: VITE_API_URL=/expense-api
```
Si no, corregir y rebuild:
```bash
ssh deploy@192.168.1.212 "sed -i 's|VITE_API_URL=.*|VITE_API_URL=/expense-api|' \
  /opt/expense-control/.env.production"
ssh deploy@192.168.1.212 "cd /opt/expense-control && docker-compose up -d --build expense-app"
```

### nginx no ve el nginx.conf actualizado tras scp

```bash
# scp crea un nuevo inode; forzar re-lectura reiniciando el contenedor:
ssh deploy@192.168.1.212 "docker restart 10x-builders-nginx"
```

### ngrok no expone las rutas de expense

Verificar que ngrok está configurado con `nginx:80`:
```bash
ssh deploy@192.168.1.212 "docker inspect 10x-builders-ngrok --format '{{json .Config.Cmd}}'"
# Debe mostrar: ["http","nginx:80","--log=stdout"]
```

---

## Archivos clave del proyecto

```
expense-control-assistant/
├── api/
│   ├── Dockerfile              ← multi-stage NestJS build (node:22-alpine)
│   └── src/app.controller.ts   ← GET /health incluido
├── app/
│   ├── Dockerfile              ← multi-stage React + nginx:alpine
│   ├── nginx-static.conf       ← serve SPA con try_files
│   └── src/lib/apiClient.ts    ← usa VITE_API_URL (debe ser relativa en PRD)
├── db/
│   ├── docker-compose.yml      ← PostgreSQL standalone
│   └── init.sql                ← schema inicial
├── context/
│   └── nginx.conf              ← nginx unificado (10x-builders + expense)
│                                  → se copia a /opt/10x-builders/nginx/nginx.conf
├── nginx/
│   └── expense-control.conf    ← referencia histórica (ya no se usa como include)
├── docker-compose.yml          ← stack completo: DB + API + App
├── docker-compose.app.yml      ← solo API + App (BD externa)
├── .env.production             ← template sin secretos (commiteable)
└── despliegue-prd.md           ← este documento
```

---

## Notas de arquitectura

### Por qué un nginx unificado

El archivo `context/nginx.conf` reemplaza al patrón anterior de dos server blocks separados
(`:80` para 10x-builders y `:3000` para expense). El server block unificado escucha en
`listen 80; listen 3000;`, lo que permite:

- **ngrok → nginx:80**: todas las rutas expuestas por el mismo túnel
- **LAN → nginx:3000**: acceso directo desde la red local (host port mapping)
- Un único lugar para mantener rate limits, CSP y timeouts

### Por qué VITE_API_URL debe ser relativa

`VITE_API_URL` se hornea en el bundle de React en tiempo de build. Si es una URL absoluta
(`http://192.168.1.212:3000/expense-api`), el browser la usa incluso cuando accede via
ngrok HTTPS, causando errores de contenido mixto (HTTP desde página HTTPS) e inaccesibilidad
desde fuera de la LAN.

Con `VITE_API_URL=/expense-api` (relativa), el browser construye la URL usando el origen
actual: LAN usa `http://192.168.1.212:3000/expense-api`, ngrok usa la URL del túnel.

### Estrategia de caché para el frontend SPA

```
/expense/           → Cache-Control: no-cache          ← index.html, siempre fresco
/expense/assets/*   → Cache-Control: immutable (1 año) ← JS/CSS con hash en nombre
```

Vite genera hashes en los nombres de archivo de assets (`index-BTXclito.js`). Cuando hay un
deploy nuevo, los hashes cambian y el nuevo `index.html` (nunca cacheado) referencia los
nuevos archivos. El browser descarga automáticamente el nuevo código sin intervención del usuario.

---

## Lecciones aprendidas

### L1: `scp` crea nuevos inodes — nginx no ve el archivo nuevo
`scp` sobre un archivo existente en el servidor crea un nuevo inode, rompiendo el bind mount
de Docker que apunta al inode original.

**Síntoma:** nginx.conf copiado pero nginx sigue sirviendo la config vieja.
**Fix:** `docker restart 10x-builders-nginx` en lugar de `nginx -s reload`.

### L2: `docker-compose` v1 lee `.env`, no `.env.production`
El comando `docker-compose up` solo carga automáticamente el archivo `.env` del directorio.
Para usar `.env.production` con Vite build args, hay que pasarlos explícitamente.

**Fix:**
```bash
VITE_API_URL=/expense-api docker-compose up -d --build expense-app
```

### L3: React Router v6 — `basename` sin trailing slash
`BrowserRouter` con `basename="/expense/"` falla en React Router v6: no matchea ninguna ruta.

**Fix:**
```typescript
basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}
```

### L4: ngrok debe apuntar a `nginx:80`, no a `3000`
Si ngrok apunta al puerto `3000` del host, el tráfico llega directamente a nginx (correcto).
Pero si está configurado como `nginx:80` (nombre de contenedor Docker), ngrok resuelve el
nombre dentro de la red Docker interna — esto es lo correcto porque ngrok está en la misma
red (`10x-builders_internal`) que nginx.

**Verificar:**
```bash
docker inspect 10x-builders-ngrok --format '{{json .Config.Cmd}}'
# Esperado: ["http","nginx:80","--log=stdout"]
```

### L5: `expense_network` debe estar en el compose de 10x-builders
El nginx de 10x-builders necesita alcanzar `expense-app` y `expense-api` que están en
`expense_network`. Sin agregar esa red al servicio nginx de 10x-builders, todos los proxies
a expense devuelven 502.

**Fix en `/opt/10x-builders/docker-compose.yml`:**
- Agregar `expense_network` a `services.nginx.networks`
- Declarar `expense_network` como red externa en `networks:`

### L6: VITE_API_URL absoluta rompe ngrok (mixed content)
Una URL absoluta con `http://` se hornea en el bundle. Cuando el usuario accede por ngrok
(HTTPS), el browser bloquea la petición HTTP al API por política de mixed content.

**Fix:** `VITE_API_URL=/expense-api` (relativa — funciona desde cualquier origen).

### L7: Cache del browser — pantalla en blanco tras deploy
El browser cacheaba el `index.html` viejo que referenciaba assets con hashes obsoletos.
Los nuevos assets (con nuevo hash) no existían en caché → pantalla en blanco.

**Fix preventivo:** `Cache-Control: no-cache` en el location de nginx que sirve `index.html`.
**Fix temporal para el usuario:** hard refresh (`Cmd+Shift+R`).

---

## Referencias rápidas

- Diagnóstico completo: ver `quickly-commands.md`
- Nginx unificado: `context/nginx.conf` → se copia a `/opt/10x-builders/nginx/nginx.conf`
- Variables de entorno: `/opt/expense-control/.env.production` (NO en git)
