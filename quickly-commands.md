# Comandos de Diagnóstico Rápido — Expense Control

> Para despliegue completo usar: `./scripts/setup-server.sh`
> Ver opciones con: `./scripts/setup-server.sh --help`



Referencia de comandos para diagnosticar el estado del sistema en producción.
Servidor: `deploy@192.168.1.212`

---

## 1. Estado general del sistema

```bash
# Vista completa: contenedores, estado y puertos
ssh deploy@192.168.1.212 "docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
```

**Salida esperada:**
```
expense_control_api   Up X minutes (healthy)    3000/tcp
expense_control_app   Up X minutes              80/tcp
expense_control_db    Up X minutes (healthy)    0.0.0.0:5432->5432/tcp
10x-builders-nginx    Up X minutes              80/tcp, 0.0.0.0:3000->3000/tcp
10x-builders-web      Up X minutes              3000/tcp
10x-builders-ngrok    Up X minutes              0.0.0.0:4040->4040/tcp
open-webui            Up X minutes (healthy)    0.0.0.0:3002->8080/tcp
```

---

## 2. Redes Docker

```bash
# Ver todas las redes
ssh deploy@192.168.1.212 "docker network ls"

# Verificar que nginx está en AMBAS redes (crítico para el enrutamiento)
ssh deploy@192.168.1.212 "docker inspect 10x-builders-nginx \
  --format '{{range \$k,\$v := .NetworkSettings.Networks}}{{\$k}} {{end}}'"
# Debe mostrar: 10x-builders_internal expense_network

# Ver contenedores de una red específica
ssh deploy@192.168.1.212 "docker network inspect expense_network \
  --format '{{range .Containers}}{{.Name}} {{end}}'"
# Debe mostrar: expense_control_app expense_control_api expense_control_db 10x-builders-nginx
```

---

## 3. Rutas HTTP (desde el servidor)

```bash
ssh deploy@192.168.1.212 bash << 'EOF'
echo "=== TEST RUTAS INTERNAS (puerto 3000) ==="
echo -n "/expense/           → " && curl -so /dev/null -w "%{http_code}\n" http://localhost:3000/expense/
echo -n "/expense-api/health → " && curl -s http://localhost:3000/expense-api/health && echo ""
echo -n "/agent              → " && curl -so /dev/null -w "%{http_code}\n" http://localhost:3000/agent
echo ""
echo "=== TEST UPSTREAM DIRECTO ==="
echo -n "expense-app (80)    → " && curl -so /dev/null -w "%{http_code}\n" http://localhost:80/ 2>/dev/null || echo "no expuesto en host"
docker exec 10x-builders-nginx curl -so /dev/null -w "nginx→expense-app: %{http_code}\n" http://expense-app/
docker exec 10x-builders-nginx curl -s http://expense-api:3000/health | python3 -c "import sys,json; print('nginx→expense-api:', json.load(sys.stdin))"
EOF
```

---

## 4. Healthchecks de contenedores

```bash
# Estado de salud de cada contenedor
ssh deploy@192.168.1.212 bash << 'EOF'
for c in expense_control_api expense_control_db open-webui; do
  status=$(docker inspect $c --format '{{.State.Health.Status}}' 2>/dev/null || echo "sin healthcheck")
  echo "$c → $status"
done

# Último output del healthcheck de la API
docker inspect expense_control_api \
  --format '{{range .State.Health.Log}}{{.Output}}{{end}}' | tail -3
EOF

# Probar healthcheck manualmente
ssh deploy@192.168.1.212 "docker exec expense_control_api wget -qO- http://localhost:3000/health"
```

---

## 5. Nginx

```bash
# Validar configuración antes de recargar
ssh deploy@192.168.1.212 "docker exec 10x-builders-nginx nginx -t"

# Ver configuración activa dentro del contenedor
ssh deploy@192.168.1.212 "docker exec 10x-builders-nginx cat /etc/nginx/nginx.conf | head -100"

# Ver headers de respuesta (caché, seguridad)
ssh deploy@192.168.1.212 bash << 'EOF'
echo "=== Headers /expense/ (debe incluir no-cache) ==="
curl -sI http://localhost:3000/expense/ | grep -E "Cache-Control|Content-Type|X-Frame"
echo ""
echo "=== Headers /expense/assets/ (debe incluir immutable) ==="
# Buscar un archivo JS del contenedor
JS=$(docker exec expense_control_app ls /usr/share/nginx/html/assets/ | grep '\.js$' | head -1)
curl -sI "http://localhost:3000/expense/assets/$JS" | grep -E "Cache-Control|Content-Type"
EOF
```

---

## 6. Logs en tiempo real

```bash
# API NestJS
ssh deploy@192.168.1.212 "docker logs expense_control_api -f --tail 50"

# Nginx (acceso + errores)
ssh deploy@192.168.1.212 "docker logs 10x-builders-nginx -f --tail 50"

# App frontend (nginx estático)
ssh deploy@192.168.1.212 "docker logs expense_control_app -f --tail 30"

# Base de datos
ssh deploy@192.168.1.212 "docker logs expense_control_db -f --tail 30"

# Todos los errores de nginx (ruta de log en volumen)
ssh deploy@192.168.1.212 "tail -f /opt/10x-builders/logs/nginx/error.log"
```

---

## 7. Build del frontend — verificar qué versión está corriendo

```bash
ssh deploy@192.168.1.212 bash << 'EOF'
echo "=== Fecha de inicio del contenedor ==="
docker inspect expense_control_app --format '{{.State.StartedAt}}'

echo ""
echo "=== index.html (verifica hashes de assets) ==="
docker exec expense_control_app cat /usr/share/nginx/html/index.html

echo ""
echo "=== Variables VITE en el build ==="
docker exec expense_control_app sh -c 'grep -o "VITE_[A-Z_]*=[^\"]*" /usr/share/nginx/html/assets/*.js 2>/dev/null | head -5 || echo "(no encontrado — normal en build optimizado)"'
EOF
```

---

## 8. Base de datos

```bash
# Conectar a PostgreSQL
ssh deploy@192.168.1.212 "docker exec -it expense_control_db psql -U postgres -d expense_control"

# Listar tablas
ssh deploy@192.168.1.212 "docker exec expense_control_db psql -U postgres -d expense_control -c '\dt'"

# Contar registros por tabla
ssh deploy@192.168.1.212 "docker exec expense_control_db psql -U postgres -d expense_control -c \
  \"SELECT schemaname, tablename, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;\""

# Verificar conexión desde la API
ssh deploy@192.168.1.212 "docker exec expense_control_api wget -qO- http://localhost:3000/health"
```

---

## 9. ngrok

```bash
# Ver URL pública activa
ssh deploy@192.168.1.212 "curl -s http://localhost:4040/api/tunnels | \
  python3 -c \"import json,sys; t=json.load(sys.stdin)['tunnels']; \
  [print(x['public_url'], '->', x['config']['addr']) for x in t] if t else print('sin túnel')\""

# Ver a qué apunta el túnel (debe ser nginx:80)
ssh deploy@192.168.1.212 "docker inspect 10x-builders-ngrok --format '{{json .Config.Cmd}}'"
# Esperado: ["http","nginx:80","--log=stdout"]

# Dashboard ngrok en el navegador
open http://192.168.1.212:4040
```

---

## 10. Diagnóstico completo (one-liner para copiar/pegar)

```bash
ssh deploy@192.168.1.212 bash << 'EOF'
echo "━━━ CONTENEDORES ━━━"
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "━━━ REDES DE NGINX ━━━"
docker inspect 10x-builders-nginx --format '{{range $k,$v := .NetworkSettings.Networks}}  {{$k}}{{"\n"}}{{end}}' 2>/dev/null || echo "nginx no está corriendo"

echo ""
echo "━━━ RUTAS HTTP ━━━"
echo -n "/expense/           → " && curl -so /dev/null -w "%{http_code}\n" http://localhost:3000/expense/
echo -n "/expense-api/health → " && curl -s http://localhost:3000/expense-api/health && echo ""
echo -n "/agent              → " && curl -so /dev/null -w "%{http_code}\n" http://localhost:3000/agent

echo ""
echo "━━━ NGROK URL ━━━"
curl -s http://localhost:4040/api/tunnels | \
  python3 -c "import json,sys; t=json.load(sys.stdin)['tunnels']; print(t[0]['public_url'] if t else 'sin túnel')" 2>/dev/null || echo "ngrok no responde"

echo ""
echo "━━━ INDEX.HTML (hash del bundle) ━━━"
docker exec expense_control_app grep -o 'index-[^"]*\.js' /usr/share/nginx/html/index.html 2>/dev/null || echo "contenedor no corre"
EOF
```

---

## 11. Acciones de recuperación rápida

```bash
# Reiniciar solo nginx (tras cambiar nginx.conf)
ssh deploy@192.168.1.212 "docker restart 10x-builders-nginx && echo '✓ nginx reiniciado'"

# Reconectar nginx a expense_network (si se perdió)
ssh deploy@192.168.1.212 "docker network connect expense_network 10x-builders-nginx 2>/dev/null || echo 'ya conectado'"

# Rebuild del frontend (pasar VITE_API_URL explícitamente)
ssh deploy@192.168.1.212 bash << 'EOF'
cd /opt/expense-control
docker-compose stop expense-app && docker-compose rm -f expense-app
VITE_API_URL=/expense-api docker-compose up -d --build expense-app
sleep 8
docker exec expense_control_app grep -o 'index-[^"]*\.js' /usr/share/nginx/html/index.html
EOF

# Restart completo de expense-control (sin rebuild)
ssh deploy@192.168.1.212 "cd /opt/expense-control && docker-compose restart"

# Limpiar imágenes huérfanas (liberar espacio)
ssh deploy@192.168.1.212 "docker system prune -f && docker image prune -f"
```
