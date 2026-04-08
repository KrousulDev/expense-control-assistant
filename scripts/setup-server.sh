#!/usr/bin/env bash
# =============================================================================
# setup-server.sh — Despliegue de Expense Control en producción
#
# Servicios que levanta:
#   expense-control/app:latest  (React SPA  → expense_control_app)
#   expense-control/api:latest  (NestJS API → expense_control_api)
#   postgres:17                 (BD         → expense_control_db)
#
# Modos de uso:
#   Desde Mac (remoto):
#     ./scripts/setup-server.sh              # sync + build + deploy
#     ./scripts/setup-server.sh --no-build   # solo restart
#     ./scripts/setup-server.sh --only-nginx # solo recarga nginx
#
#   Desde el servidor (local) — invocado por agent.sh / deploy.sh:
#     ./scripts/setup-server.sh --local
#     ./scripts/setup-server.sh --local --no-build
# =============================================================================
set -euo pipefail

# ── Configuración ─────────────────────────────────────────────────────────────
SERVER="deploy@192.168.1.212"
REMOTE_PATH="/opt/expense-control"
NGINX_REMOTE="/opt/10x-builders/nginx/nginx.conf"
NGINX_LOCAL="context/nginx.conf"

VITE_API_URL="${VITE_API_URL:-/expense-api}"
VITE_BASE="${VITE_BASE:-/expense/}"

BUILD=true
ONLY_NGINX=false
LOCAL=false       # --local: ejecuta en el servidor actual, sin SSH

# ── Colores ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

step()  { echo -e "\n${BLUE}${BOLD}▶ $*${RESET}"; }
ok()    { echo -e "${GREEN}✓ $*${RESET}"; }
warn()  { echo -e "${YELLOW}⚠ $*${RESET}"; }
error() { echo -e "${RED}✗ $*${RESET}" >&2; }
info()  { echo -e "${CYAN}  $*${RESET}"; }

# ── Argumentos ────────────────────────────────────────────────────────────────
for arg in "$@"; do
  case $arg in
    --no-build)   BUILD=false ;;
    --only-nginx) ONLY_NGINX=true ;;
    --local)      LOCAL=true ;;
    --help|-h)
      echo "Uso: $0 [--local] [--no-build] [--only-nginx]"
      echo ""
      echo "  (sin flags)    Desde Mac: sync + build + deploy via SSH"
      echo "  --local        Desde el servidor: ejecuta comandos directamente (sin SSH)"
      echo "  --no-build     Solo reinicia contenedores, sin reconstruir imágenes"
      echo "  --only-nginx   Solo recarga nginx (requiere que context/nginx.conf exista)"
      exit 0
      ;;
    *) error "Argumento desconocido: $arg"; exit 1 ;;
  esac
done

# ── Ejecutor remoto/local ─────────────────────────────────────────────────────
# rexec: recibe un bloque de bash por stdin y lo ejecuta en el destino correcto.
#   Modo remoto: ssh "$SERVER" bash
#   Modo local:  bash directamente (sin SSH, para cuando ya estamos en el servidor)
rexec() {
  if $LOCAL; then
    bash
  else
    ssh "$SERVER" bash
  fi
}

# ── Verificaciones previas ─────────────────────────────────────────────────────
preflight() {
  step "Verificaciones previas"

  if $LOCAL; then
    # Corriendo en el servidor: verificar docker y directorio
    if ! command -v docker &>/dev/null; then
      error "docker no está instalado en este servidor"
      exit 1
    fi
    ok "docker disponible"

    if [[ ! -f "${REMOTE_PATH}/docker-compose.yml" ]]; then
      error "No se encontró docker-compose.yml en ${REMOTE_PATH}"
      info  "Sincroniza el proyecto primero desde tu Mac:"
      info  "  rsync -avz ./ ${SERVER}:${REMOTE_PATH}/"
      exit 1
    fi
    ok "Proyecto en ${REMOTE_PATH}"

    if [[ ! -f "${REMOTE_PATH}/.env.production" ]]; then
      warn ".env.production no encontrado en ${REMOTE_PATH}/"
      warn "El API puede fallar sin las variables de entorno"
    else
      ok ".env.production presente"
    fi

  else
    # Corriendo desde Mac: verificar SSH y rsync
    if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$SERVER" "echo ok" &>/dev/null; then
      error "No se puede conectar a $SERVER"
      info  "Verifica que tienes acceso SSH configurado (clave pública o agente SSH)"
      exit 1
    fi
    ok "SSH a $SERVER"

    if ! command -v rsync &>/dev/null; then
      error "rsync no está instalado"
      exit 1
    fi
    ok "rsync disponible"

    if [[ ! -f "docker-compose.yml" ]]; then
      error "Ejecuta este script desde el root del proyecto"
      info  "cd /path/to/expense-control-assistant && ./scripts/setup-server.sh"
      exit 1
    fi
    ok "Directorio correcto"

    if ! ssh "$SERVER" "test -f ${REMOTE_PATH}/.env.production" 2>/dev/null; then
      warn ".env.production no encontrado en ${REMOTE_PATH}/"
      info "  scp .env.production ${SERVER}:${REMOTE_PATH}/.env.production"
      read -rp "  ¿Continuar de todas formas? [y/N] " confirm
      [[ "${confirm,,}" == "y" ]] || exit 1
    else
      ok ".env.production presente en el servidor"
    fi
  fi
}

# ── Sincronizar archivos (solo modo remoto) ────────────────────────────────────
sync_files() {
  $LOCAL && return 0   # en modo local ya estamos en el servidor

  step "Sincronizando archivos → ${SERVER}:${REMOTE_PATH}"

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
    --exclude='scripts/' \
    ./ "${SERVER}:${REMOTE_PATH}/"

  ok "Sincronización completada"
}

# ── Actualizar nginx ───────────────────────────────────────────────────────────
deploy_nginx() {
  step "Actualizando nginx.conf"

  if $LOCAL; then
    # En el servidor: el nginx.conf ya debe estar en su lugar
    # Solo validamos y recargamos
    rexec << 'SCRIPT'
      set -e
      if docker exec 10x-builders-nginx nginx -t 2>/dev/null; then
        docker restart 10x-builders-nginx
        echo "✓ nginx reiniciado"
      else
        echo "✗ nginx.conf inválido — configuración anterior sigue activa"
        exit 1
      fi
SCRIPT
  else
    # Desde Mac: copiamos el archivo y luego recargamos
    if [[ ! -f "$NGINX_LOCAL" ]]; then
      error "No se encontró $NGINX_LOCAL"
      exit 1
    fi
   
    scp "$NGINX_LOCAL" "${SERVER}:${NGINX_REMOTE}"
    ok "nginx.conf copiado"

    rexec << 'SCRIPT'
      set -e
      if docker exec 10x-builders-nginx nginx -t 2>/dev/null; then
        docker restart 10x-builders-nginx
        echo "✓ nginx reiniciado"
      else
        echo "✗ nginx.conf inválido — configuración anterior sigue activa"
        exit 1
      fi
SCRIPT
  fi
}

# ── Crear red Docker ──────────────────────────────────────────────────────────
ensure_network() {
  step "Verificando red Docker: expense_network"

  rexec << 'SCRIPT'
    if docker network inspect expense_network &>/dev/null; then
      echo "✓ expense_network ya existe"
    else
      docker network create expense_network
      echo "✓ expense_network creada"
    fi
SCRIPT
}

# ── Levantar los tres servicios ───────────────────────────────────────────────
start_services() {
  step "Levantando servicios"
  info "BUILD=${BUILD} | VITE_API_URL=${VITE_API_URL}"

  rexec << SCRIPT
    set -e
    cd "${REMOTE_PATH}"

    echo "→ Iniciando PostgreSQL (postgres:17)..."
    docker-compose up -d expense-db

    echo "  Esperando que la BD esté healthy..."
    for i in \$(seq 1 30); do
      STATUS=\$(docker inspect --format='{{.State.Health.Status}}' expense_control_db 2>/dev/null || echo "starting")
      if [ "\$STATUS" = "healthy" ]; then
        echo "✓ expense_control_db healthy"
        break
      fi
      [ "\$i" -eq 30 ] && echo "✗ BD no respondió a tiempo" && exit 1
      sleep 2
    done

    echo "→ Iniciando API NestJS (expense-control/api:latest)..."
    if [ "${BUILD}" = "true" ]; then
      docker-compose up -d --build expense-api
    else
      docker-compose up -d expense-api
    fi

    echo "→ Iniciando App React (expense-control/app:latest)..."
    if [ "${BUILD}" = "true" ]; then
      docker-compose stop expense-app 2>/dev/null || true
      docker-compose rm -f expense-app 2>/dev/null || true
      VITE_API_URL="${VITE_API_URL}" docker-compose up -d --build expense-app
    else
      docker-compose up -d expense-app
    fi

    echo "✓ Servicios iniciados"
SCRIPT
}

# ── Esperar healthchecks ──────────────────────────────────────────────────────
wait_healthy() {
  step "Esperando healthchecks"

  rexec << 'SCRIPT'
    TIMEOUT=90
    for container in expense_control_db expense_control_api; do
      echo -n "  $container → "
      elapsed=0
      while true; do
        STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "no-healthcheck")
        case "$STATUS" in
          healthy)         echo "healthy ✓"; break ;;
          no-healthcheck)  echo "sin healthcheck (ok)"; break ;;
        esac
        if [ "$elapsed" -ge "$TIMEOUT" ]; then
          echo "TIMEOUT ✗"
          docker logs "$container" --tail 20
          break
        fi
        sleep 3
        elapsed=$((elapsed + 3))
      done
    done
SCRIPT
}

# ── Verificar rutas ───────────────────────────────────────────────────────────
verify_routes() {
  step "Verificando rutas HTTP"

  rexec << 'SCRIPT'
    echo -n "  /expense/           → "
    curl -so /dev/null -w "%{http_code}\n" http://localhost:3000/expense/ 2>/dev/null || echo "ERROR"

    echo -n "  /expense-api/health → "
    curl -s http://localhost:3000/expense-api/health 2>/dev/null && echo "" || echo "ERROR"

    echo -n "  /agent              → "
    curl -so /dev/null -w "%{http_code}\n" http://localhost:3000/agent 2>/dev/null || echo "ERROR"

    echo ""
    echo -n "  Bundle JS hash      → "
    docker exec expense_control_app \
      grep -o 'index-[^"]*\.js' /usr/share/nginx/html/index.html 2>/dev/null \
      || echo "(contenedor no encontrado)"

    echo -n "  URL ngrok           → "
    curl -s http://localhost:4040/api/tunnels 2>/dev/null | \
      python3 -c "import json,sys; t=json.load(sys.stdin)['tunnels']; \
      print(t[0]['public_url']) if t else print('(sin túnel ngrok)')" 2>/dev/null \
      || echo "(ngrok no responde)"
SCRIPT
}

# ── Resumen final ─────────────────────────────────────────────────────────────
summary() {
  echo ""
  echo -e "${GREEN}${BOLD}════════════════════════════════════════${RESET}"
  echo -e "${GREEN}${BOLD}  Despliegue completado                  ${RESET}"
  echo -e "${GREEN}${BOLD}════════════════════════════════════════${RESET}"
  echo ""
  echo -e "  LAN:    ${CYAN}http://192.168.1.212:3000/expense/${RESET}"
  echo -e "  ngrok:  ver ${CYAN}http://192.168.1.212:4040${RESET}"
  echo -e "  DB:     ${CYAN}192.168.1.212:5432${RESET}"
  echo ""
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  echo ""
  echo -e "${BOLD}Expense Control — Setup de Producción${RESET}"
  if $LOCAL; then
    echo -e "Modo: ${CYAN}local (ejecutando en el servidor)${RESET}"
  else
    echo -e "Servidor: ${CYAN}${SERVER}${RESET}"
  fi
  echo ""

  preflight

  if $ONLY_NGINX; then
    deploy_nginx
    ok "Solo nginx actualizado."
    exit 0
  fi

  sync_files       # no-op en modo --local
  ensure_network
  deploy_nginx
  start_services
  wait_healthy
  verify_routes
  summary
}

main
