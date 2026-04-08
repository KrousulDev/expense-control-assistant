#!/usr/bin/env bash
# =============================================================================
# deploy-expenses-control.sh
#
# Despliega el ecosistema completo de Expense Control en el servidor.
# Diseñado para ejecutarse DIRECTAMENTE en el servidor (sin SSH).
# Llamado desde: /opt/10x-builders/scripts/deploy.sh
#
# Uso:
#   bash /opt/expense-control/scripts/deploy-expenses-control.sh
#   bash /opt/expense-control/scripts/deploy-expenses-control.sh --no-build
#   bash /opt/expense-control/scripts/deploy-expenses-control.sh --only-restart
#   bash /opt/expense-control/scripts/deploy-expenses-control.sh --skip-nginx
# =============================================================================
set -euo pipefail

# ── Configuración ─────────────────────────────────────────────────────────────
EXPENSES_DIR="/opt/expense-control"
NGINX_CONTAINER="10x-builders-nginx"
NGINX_CONF_SRC="${EXPENSES_DIR}/context/nginx.conf"
NGINX_CONF_DST="/opt/10x-builders/nginx/nginx.conf"
VITE_API_URL="${VITE_API_URL:-/expense-api}"

BUILD=true
SKIP_NGINX=false
ONLY_RESTART=false   # --only-restart: solo inicia/reinicia contenedores, sin build ni rm
TIMEOUT_DB=60       # segundos máximos esperando que la BD esté healthy
TIMEOUT_API=90      # segundos máximos esperando que la API esté healthy

# ── Colores ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

step()  { echo -e "\n${BLUE}${BOLD}══ $* ${RESET}"; }
ok()    { echo -e "  ${GREEN}✓${RESET} $*"; }
warn()  { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
error() { echo -e "  ${RED}✗${RESET}  $*" >&2; }
info()  { echo -e "  ${CYAN}→${RESET} $*"; }
fail()  { error "$*"; exit 1; }

# ── Argumentos ────────────────────────────────────────────────────────────────
for arg in "$@"; do
  case $arg in
    --no-build)      BUILD=false ;;
    --skip-nginx)    SKIP_NGINX=true ;;
    --only-restart)  ONLY_RESTART=true; BUILD=false ;;
    --help|-h)
      echo "Uso: $0 [--only-restart] [--no-build] [--skip-nginx]"
      echo ""
      echo "  (sin flags)      Build completo + levantar los 3 servicios + reload nginx"
      echo "  --only-restart   Solo inicia o reinicia contenedores (sin build, sin rm)"
      echo "  --no-build       Levanta contenedores con imágenes existentes (sin rebuild)"
      echo "  --skip-nginx     No toca la configuración ni el contenedor de nginx"
      exit 0
      ;;
    *) fail "Argumento desconocido: $arg" ;;
  esac
done

# ── Helper: restart si está corriendo, up -d si está detenido/no existe ───────
# Uso: restart_or_start <container_name> <compose_service_name>
restart_or_start() {
  local container="$1"
  local service="$2"
  local current
  current=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "missing")
  if [[ "$current" == "running" ]]; then
    info "Reiniciando ${container}..."
    docker restart "$container"
  else
    info "Iniciando ${container} (estaba: ${current})..."
    cd "${EXPENSES_DIR}" && ${COMPOSE} up -d "$service"
  fi
}

# ── Detectar docker-compose ───────────────────────────────────────────────────
if docker compose version &>/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose &>/dev/null; then
  COMPOSE="docker-compose"
else
  fail "docker-compose no encontrado. Instala Docker Compose primero."
fi

# =============================================================================
# 1. PRE-FLIGHT — verificaciones antes de tocar nada
# =============================================================================
preflight() {
  step "Pre-flight checks"

  # Docker disponible
  docker info &>/dev/null || fail "Docker no está corriendo"
  ok "Docker disponible"

  # Directorio del proyecto
  [[ -f "${EXPENSES_DIR}/docker-compose.yml" ]] \
    || fail "docker-compose.yml no encontrado en ${EXPENSES_DIR}"
  ok "Proyecto en ${EXPENSES_DIR}"

  # .env.production (contiene JWT_SECRET, POSTGRES_PASSWORD, etc.)
  if [[ ! -f "${EXPENSES_DIR}/.env.production" ]]; then
    fail ".env.production no encontrado en ${EXPENSES_DIR}/\n  Crea el archivo con las variables reales antes de desplegar."
  fi
  ok ".env.production presente"

  # Verificar que VITE_API_URL sea relativa (no absoluta con http)
  if grep -q "VITE_API_URL=http" "${EXPENSES_DIR}/.env.production" 2>/dev/null; then
    warn "VITE_API_URL parece ser una URL absoluta en .env.production"
    warn "Debe ser relativa: VITE_API_URL=/expense-api"
    warn "URLs absolutas rompen el acceso via ngrok (mixed content)"
  fi

  # nginx.conf fuente existe
  if ! $SKIP_NGINX && [[ ! -f "${NGINX_CONF_SRC}" ]]; then
    warn "nginx.conf no encontrado en ${NGINX_CONF_SRC} — se omitirá actualización de nginx"
    SKIP_NGINX=true
  fi
}

# =============================================================================
# 2. REDES DOCKER — garantizar que expense_network existe y nginx está conectado
# =============================================================================
check_networks() {
  step "Verificando redes Docker"

  # Crear expense_network si no existe
  if docker network inspect expense_network &>/dev/null; then
    ok "expense_network existe"
  else
    info "Creando expense_network..."
    docker network create expense_network
    ok "expense_network creada"
  fi

  # Verificar que nginx está conectado a expense_network
  if docker inspect "${NGINX_CONTAINER}" &>/dev/null; then
    NGINX_NETS=$(docker inspect "${NGINX_CONTAINER}" \
      --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null || echo "")

    if echo "$NGINX_NETS" | grep -q "expense_network"; then
      ok "${NGINX_CONTAINER} está en expense_network"
    else
      info "${NGINX_CONTAINER} no está en expense_network — conectando..."
      docker network connect expense_network "${NGINX_CONTAINER}"
      ok "${NGINX_CONTAINER} conectado a expense_network"
    fi
  else
    warn "${NGINX_CONTAINER} no está corriendo — las rutas /expense/* no funcionarán hasta que se levante"
  fi
}

# =============================================================================
# 3. BASE DE DATOS — postgres:17
# =============================================================================
start_db() {
  step "Base de datos — expense_control_db (postgres:17)"
  cd "${EXPENSES_DIR}"

  if $ONLY_RESTART; then
    restart_or_start expense_control_db expense-db
  else
    info "Levantando expense-db..."
    ${COMPOSE} up -d expense-db
  fi

  info "Esperando healthcheck de PostgreSQL (timeout: ${TIMEOUT_DB}s)..."
  elapsed=0
  while true; do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' expense_control_db 2>/dev/null || echo "missing")
    case "$STATUS" in
      healthy)
        ok "expense_control_db — healthy"
        break
        ;;
      missing)
        fail "El contenedor expense_control_db no existe"
        ;;
      unhealthy)
        error "expense_control_db — unhealthy"
        docker logs expense_control_db --tail 20
        fail "La BD quedó en estado unhealthy"
        ;;
    esac
    if [[ $elapsed -ge $TIMEOUT_DB ]]; then
      error "Timeout esperando la BD (${TIMEOUT_DB}s)"
      docker logs expense_control_db --tail 20
      fail "La BD no respondió a tiempo"
    fi
    sleep 3
    elapsed=$((elapsed + 3))
    echo -n "."
  done
}

# =============================================================================
# 4. API — expense-control/api:latest
# =============================================================================
start_api() {
  step "API NestJS — expense_control_api (expense-control/api:latest)"
  cd "${EXPENSES_DIR}"

  if $ONLY_RESTART; then
    restart_or_start expense_control_api expense-api
  else
    if $BUILD; then
      info "Build de imagen expense-control/api:latest..."
      ${COMPOSE} build expense-api
    fi
    info "Levantando expense-api..."
    ${COMPOSE} up -d expense-api
  fi

  info "Esperando healthcheck de la API (timeout: ${TIMEOUT_API}s)..."
  elapsed=0
  while true; do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' expense_control_api 2>/dev/null || echo "missing")
    case "$STATUS" in
      healthy)
        ok "expense_control_api — healthy"
        break
        ;;
      missing)
        fail "El contenedor expense_control_api no existe"
        ;;
      unhealthy)
        error "expense_control_api — unhealthy"
        docker logs expense_control_api --tail 30
        fail "La API quedó en estado unhealthy"
        ;;
    esac
    if [[ $elapsed -ge $TIMEOUT_API ]]; then
      warn "Timeout esperando la API (${TIMEOUT_API}s) — puede que aún esté iniciando"
      docker logs expense_control_api --tail 20
      break
    fi
    sleep 3
    elapsed=$((elapsed + 3))
    echo -n "."
  done
}

# =============================================================================
# 5. APP — expense-control/app:latest (React SPA)
# =============================================================================
start_app() {
  step "Frontend React — expense_control_app (expense-control/app:latest)"
  cd "${EXPENSES_DIR}"

  if $ONLY_RESTART; then
    restart_or_start expense_control_app expense-app
  else
    if $BUILD; then
      info "Limpiando contenedor anterior..."
      ${COMPOSE} stop expense-app 2>/dev/null || true
      ${COMPOSE} rm -f expense-app 2>/dev/null || true

      info "Build de imagen expense-control/app:latest (VITE_API_URL=${VITE_API_URL})..."
      VITE_API_URL="${VITE_API_URL}" ${COMPOSE} build expense-app
    fi

    info "Levantando expense-app..."
    VITE_API_URL="${VITE_API_URL}" ${COMPOSE} up -d expense-app
  fi

  sleep 3
  STATUS=$(docker inspect --format='{{.State.Status}}' expense_control_app 2>/dev/null || echo "missing")
  if [[ "$STATUS" == "running" ]]; then
    ok "expense_control_app — running"
    JS_HASH=$(docker exec expense_control_app \
      grep -o 'index-[^"]*\.js' /usr/share/nginx/html/index.html 2>/dev/null || echo "(no disponible)")
    info "Bundle JS: ${JS_HASH}"
  else
    error "expense_control_app — estado: ${STATUS}"
    docker logs expense_control_app --tail 20
  fi
}

# =============================================================================
# 6. NGINX — actualizar nginx.conf y recargar
# =============================================================================
reload_nginx() {
  $SKIP_NGINX && return 0

  step "Nginx — actualizar configuración y recargar"

  # Copiar nginx.conf al destino del bind mount
  if [[ -f "${NGINX_CONF_SRC}" ]]; then
    # dd preserva el inode (a diferencia de cp/scp que crea uno nuevo)
    dd if="${NGINX_CONF_SRC}" of="${NGINX_CONF_DST}" status=none
    ok "nginx.conf actualizado (inode preservado)"
  else
    warn "nginx.conf no encontrado en ${NGINX_CONF_SRC} — se omite actualización"
  fi

  # Verificar si el contenedor nginx está corriendo
  if ! docker inspect "${NGINX_CONTAINER}" &>/dev/null; then
    warn "${NGINX_CONTAINER} no está corriendo — no se puede recargar"
    return 0
  fi

  NGINX_STATUS=$(docker inspect --format='{{.State.Status}}' "${NGINX_CONTAINER}" 2>/dev/null)
  if [[ "$NGINX_STATUS" != "running" ]]; then
    warn "${NGINX_CONTAINER} está en estado '${NGINX_STATUS}' — intentando levantar..."
    cd /opt/10x-builders && ${COMPOSE} up -d nginx
  fi

  # Validar config y recargar (restart forzado para garantizar lectura del nuevo inode)
  if docker exec "${NGINX_CONTAINER}" nginx -t 2>/dev/null; then
    docker restart "${NGINX_CONTAINER}"
    ok "${NGINX_CONTAINER} — configuración válida, contenedor reiniciado"
  else
    error "nginx.conf inválido — configuración anterior sigue activa"
    docker exec "${NGINX_CONTAINER}" nginx -t
  fi
}

# =============================================================================
# 7. VERIFICACIÓN POST-DEPLOY
# =============================================================================
verify() {
  step "Verificación post-deploy"

  # Estado de contenedores
  echo ""
  echo -e "  ${BOLD}Contenedores:${RESET}"
  for c in expense_control_db expense_control_api expense_control_app; do
    STATUS=$(docker inspect --format='{{.State.Status}}' "$c" 2>/dev/null || echo "no existe")
    HEALTH=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}—{{end}}' "$c" 2>/dev/null || echo "—")
    if [[ "$STATUS" == "running" ]]; then
      echo -e "    ${GREEN}✓${RESET} ${c}  [${STATUS}] health: ${HEALTH}"
    else
      echo -e "    ${RED}✗${RESET} ${c}  [${STATUS}]"
    fi
  done

  # Rutas HTTP (requiere que nginx esté corriendo)
  echo ""
  echo -e "  ${BOLD}Rutas HTTP (via nginx:3000):${RESET}"

  HTTP_EXPENSE=$(curl -so /dev/null -w "%{http_code}" http://localhost:3000/expense/ 2>/dev/null || echo "ERR")
  [[ "$HTTP_EXPENSE" == "200" ]] \
    && echo -e "    ${GREEN}✓${RESET} /expense/           → ${HTTP_EXPENSE}" \
    || echo -e "    ${RED}✗${RESET} /expense/           → ${HTTP_EXPENSE}"

  API_HEALTH=$(curl -s http://localhost:3000/expense-api/health 2>/dev/null || echo "ERROR")
  [[ "$API_HEALTH" == *"ok"* ]] \
    && echo -e "    ${GREEN}✓${RESET} /expense-api/health → ${API_HEALTH}" \
    || echo -e "    ${RED}✗${RESET} /expense-api/health → ${API_HEALTH}"

  HTTP_AGENT=$(curl -so /dev/null -w "%{http_code}" http://localhost:3000/agent 2>/dev/null || echo "ERR")
  [[ "$HTTP_AGENT" =~ ^(200|307|308)$ ]] \
    && echo -e "    ${GREEN}✓${RESET} /agent              → ${HTTP_AGENT}" \
    || echo -e "    ${RED}✗${RESET} /agent              → ${HTTP_AGENT}"

  # Headers de caché del frontend
  echo ""
  echo -e "  ${BOLD}Cache-Control headers:${RESET}"
  CACHE_HDR=$(curl -sI http://localhost:3000/expense/ 2>/dev/null | grep -i "cache-control" || echo "  (no encontrado)")
  echo "    index.html → ${CACHE_HDR}"

  # URL ngrok activa
  echo ""
  NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | \
    python3 -c "import json,sys; t=json.load(sys.stdin)['tunnels']; \
    print(t[0]['public_url']) if t else print('(sin túnel)')" 2>/dev/null || echo "(ngrok no responde)")
  echo -e "  ${BOLD}ngrok:${RESET} ${CYAN}${NGROK_URL}${RESET}"
}

# =============================================================================
# 8. RESUMEN
# =============================================================================
summary() {
  echo ""
  echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════╗${RESET}"
  echo -e "${GREEN}${BOLD}║   Expense Control — deploy completado    ║${RESET}"
  echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════╝${RESET}"
  echo ""
  echo -e "  LAN    → ${CYAN}http://192.168.1.212:3000/expense/${RESET}"
  echo -e "  API    → ${CYAN}http://192.168.1.212:3000/expense-api/health${RESET}"
  echo -e "  ngrok  → ${CYAN}http://192.168.1.212:4040${RESET} (ver URL pública)"
  echo ""
}

# =============================================================================
# MAIN
# =============================================================================
main() {
  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}║   Expense Control — Deploy               ║${RESET}"
  echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}"
  echo -e "  Dir:   ${CYAN}${EXPENSES_DIR}${RESET}"
  if $ONLY_RESTART; then
    echo -e "  Modo:  ${YELLOW}--only-restart${RESET} (sin build, solo inicia/reinicia contenedores)"
  else
    echo -e "  Build: ${CYAN}${BUILD}${RESET} | VITE_API_URL: ${CYAN}${VITE_API_URL}${RESET}"
  fi
  echo ""

  preflight
  check_networks
  start_db
  start_api
  start_app
  reload_nginx
  verify
  summary
}

main
