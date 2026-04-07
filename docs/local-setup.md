# Setup y pruebas en local

> **Stack:** ReactJS (Vite) · NestJS · PostgreSQL 17 (Docker) · JWT Auth  
> **Prerequisitos:** Node.js ≥ 20, npm, Docker Desktop corriendo

---

## 1. Instalar dependencias

```bash
npm install
```

---

## 2. Verificar variables de entorno

Los archivos `.env` ya están creados. Confirma que tienen el contenido correcto:

**`api/.env`**
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/expense_control
JWT_SECRET=change-me-in-production
FRONTEND_URL=http://localhost:5173
PORT=3000
```

**`app/.env`**
```
VITE_API_URL=http://localhost:3000
```

---

## 3. Levantar la base de datos

```bash
npm run db:start
```

Docker descarga `postgres:17` la primera vez y aplica `db/init.sql` automáticamente (tablas, enums, índices y seed de categorías).

Espera ~10 segundos y verifica que el contenedor esté sano:

```bash
docker ps
```

El estado debe ser `healthy`. Para confirmar que el esquema se aplicó:

```bash
# Listar tablas
docker exec -it expense_control_db psql -U postgres -d expense_control -c "\dt public.*"

# Verificar seed de categorías
docker exec -it expense_control_db psql -U postgres -d expense_control \
  -c "SELECT slug, name FROM public.categories ORDER BY sort_order;"
```

Debes ver 6 tablas (`budgets`, `categories`, `conversation_messages`, `profiles`, `transactions`, `users`) y 12 categorías del sistema.

---

## 4. Levantar en modo desarrollo

```bash
npm run dev
```

Levanta ambos servidores en paralelo:

| Servicio | URL |
|----------|-----|
| API (NestJS) | `http://localhost:3000` |
| App (Vite React) | `http://localhost:5173` |

---

## 5. Probar el API con curl

> Necesitas `jq` para formatear el JSON. Si no lo tienes: `brew install jq`

### Registro

```bash
curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' | jq
```

Respuesta esperada:
```json
{ "accessToken": "eyJ..." }
```

### Login y guardar token en variable

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' | jq -r '.accessToken')

echo "Token obtenido: ${TOKEN:0:30}..."
```

### Obtener perfil

```bash
curl -s http://localhost:3000/profile \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Listar categorías del sistema

```bash
curl -s http://localhost:3000/categories \
  -H "Authorization: Bearer $TOKEN" | jq '.[].name'
```

### Crear transacción (gasto)

```bash
curl -s -X POST http://localhost:3000/transactions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "expense",
    "amount": 200,
    "currency": "MXN",
    "description": "Comida en el mercado"
  }' | jq
```

### Crear transacción (ingreso)

```bash
curl -s -X POST http://localhost:3000/transactions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "income",
    "amount": 15000,
    "currency": "MXN",
    "description": "Salario quincenal"
  }' | jq
```

### Listar transacciones

```bash
curl -s "http://localhost:3000/transactions?page=0&pageSize=10" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Actualizar perfil

```bash
curl -s -X PUT http://localhost:3000/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Usuario Test",
    "defaultCurrency": "MXN",
    "timezone": "America/Mexico_City"
  }' | jq
```

### Crear presupuesto mensual global

```bash
curl -s -X POST http://localhost:3000/budgets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "month": "2026-04-01",
    "amountLimit": 10000,
    "currency": "MXN"
  }' | jq
```

### Listar presupuestos

```bash
curl -s "http://localhost:3000/budgets?month=2026-04-01" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Verificar seguridad (sin token debe dar 401)

```bash
curl -s http://localhost:3000/transactions | jq
```

Respuesta esperada:
```json
{ "message": "Unauthorized", "statusCode": 401 }
```

---

## 6. Probar el dashboard web

1. Abre `http://localhost:5173`
2. Haz clic en **"¿No tienes cuenta? Regístrate"**
3. Ingresa email y contraseña (mínimo 6 caracteres) → **Crear cuenta**
4. Serás redirigido al dashboard con KPIs en `$0.00`
5. Usa los curl de la sección anterior para crear movimientos y recarga el dashboard
6. Navega por las secciones:

| Sección | URL | Qué probar |
|---------|-----|-----------|
| Dashboard | `/` | KPIs del mes, últimos 10 movimientos |
| Movimientos | `/transactions` | Listado paginado, filtro por tipo, editar, eliminar |
| Presupuestos | `/budgets` | Crear presupuesto, barra de progreso, eliminar |
| Ajustes | `/settings` | Editar nombre, moneda, timezone — guardar |

---

## 7. Correr los tests

```bash
npm run test
```

Resultado esperado:
```
Test Suites: 3 passed, 3 total   ← api
Tests:       12 passed, 12 total
```

Para correr solo un workspace:

```bash
npm run test -w api   # Jest (NestJS)
npm run test -w app   # Vitest (React)
```

---

## 8. Comandos de referencia

### Base de datos

| Objetivo | Comando |
|----------|---------|
| Iniciar contenedor | `npm run db:start` |
| Detener contenedor | `npm run db:stop` |
| Borrar datos y reiniciar | `npm run db:reset` |
| Ver logs de PostgreSQL | `docker logs expense_control_db --tail=50` |
| Abrir psql interactivo | `docker exec -it expense_control_db psql -U postgres -d expense_control` |

### Desarrollo

| Objetivo | Comando |
|----------|---------|
| App + API en paralelo | `npm run dev` |
| Solo API | `npm run dev:api` |
| Solo app | `npm run dev:app` |
| Build completo | `npm run build` |
| Lint | `npm run lint` |

---

## 9. Solución de problemas frecuentes

### Puerto 5432 ocupado

```bash
# Ver qué proceso usa el puerto
lsof -i :5432

# Si es otro PostgreSQL local, detenerlo
brew services stop postgresql
# o
pg_ctl stop
```

### Puerto 3000 ocupado

Cambia el puerto en `api/.env`:
```
PORT=3001
```

Y actualiza `app/.env`:
```
VITE_API_URL=http://localhost:3001
```

### Contenedor no arranca

```bash
docker logs expense_control_db
```

Si hay errores de permisos de volumen:

```bash
npm run db:reset
```

### "Invalid token" o 401 inesperado

El token JWT dura 7 días. Si expira, haz login de nuevo:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' | jq -r '.accessToken')
```

### La app muestra pantalla en blanco

Verifica que el API esté corriendo (`http://localhost:3000`) y que `app/.env` tenga `VITE_API_URL` correcto. Reinicia el servidor Vite con `npm run dev:app`.
