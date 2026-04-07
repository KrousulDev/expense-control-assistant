# MVP — Control de Gastos — Dashboard Web + API REST

> **Versión:** 2.0.0-mvp  
> **Fecha:** Abril 2026  
> **Stack:** ReactJS · NestJS · PostgreSQL 17 (Docker) · JWT Auth

---

## Resumen ejecutivo

Dashboard financiero personal que permite registrar gastos e ingresos manualmente desde el navegador y visualizar el estado financiero mensual. El backend expone una API REST con autenticación JWT, diseñada también para ser consumida por un agente de AI externo (ver `ai/legacy-ai.md`).

---

## Arquitectura

```
app/ (React + Vite)
  └─ app/src/services/    → HTTP requests con JWT
  └─ app/src/lib/apiClient.ts → fetch wrapper con auth header

api/ (NestJS)
  ├─ auth/               → POST /auth/register, POST /auth/login
  ├─ profile/            → GET/PUT /profile
  ├─ transactions/       → GET/POST/PUT/DELETE /transactions
  ├─ categories/         → GET /categories
  └─ budgets/            → GET/POST/DELETE /budgets
  └─ database/           → pg.Pool → PostgreSQL Docker

db/init.sql → docker-compose.yml → expense_control_db (postgres:17)
```

---

## Features principales

### F-01 · Autenticación con JWT

**Descripción**  
Registro e inicio de sesión con email y contraseña. El backend genera un JWT con 7 días de expiración. El frontend lo almacena en `localStorage` y lo incluye en cada request.

**Especificaciones**

- Registro: `POST /auth/register` — hash bcrypt (12 rounds), crea `users` + `profiles`
- Login: `POST /auth/login` — valida credenciales, retorna `{ accessToken }`
- Token: JWT firmado con `JWT_SECRET`, payload: `{ sub: userId, email }`
- Rutas protegidas redirigen a `/login` si no hay token válido
- Logout: elimina el token de `localStorage`

**Flujo de datos**

```
Usuario → LoginPage → useAuth.signIn() → authService.login()
       → POST /auth/login → JwtService.sign() → { accessToken }
       → localStorage.setItem() → setUser(parseUserFromToken())
       → ProtectedRoute libera acceso al dashboard
```

**Componentes involucrados**
- `app/src/pages/LoginPage.tsx`
- `app/src/contexts/AuthContext.tsx`
- `app/src/services/authService.ts`
- `app/src/lib/apiClient.ts`
- `api/src/auth/`

---

### F-02 · Dashboard financiero mensual

**Descripción**  
Vista principal con tres KPIs del mes en curso (gastos, ingresos, balance) y tabla de movimientos recientes.

**Especificaciones**

- KPIs calculados en el frontend a partir de los datos del API
- Filtra transacciones por rango del mes actual (`from`, `to`)
- Últimas 10 transacciones con categoría asociada

**API usada**

```
GET /transactions?from=2026-04-01T00:00:00&to=2026-05-01T00:00:00&pageSize=100
GET /categories
```

**Componentes involucrados**
- `app/src/pages/DashboardPage.tsx`
- `app/src/services/transactionsService.ts`
- `app/src/services/categoriesService.ts`

---

### F-03 · Registro y gestión de movimientos

**Descripción**  
Listado paginado de transacciones con filtro por tipo. Permite editar y eliminar cada movimiento.

**Especificaciones**

- Paginación: 20 registros por página, query params `page` y `pageSize`
- Filtro por `type`: `expense` | `income`
- Edición en modal: tipo, monto, descripción, categoría, fecha
- Eliminación con diálogo de confirmación

**API usada**

```
GET  /transactions?page=0&pageSize=20&type=expense
PUT  /transactions/:id
DELETE /transactions/:id
```

**Componentes involucrados**
- `app/src/pages/TransactionsPage.tsx`
- `app/src/components/TransactionModal.tsx`
- `app/src/components/DeleteConfirmDialog.tsx`
- `app/src/services/transactionsService.ts`

---

### F-04 · Presupuestos mensuales

**Descripción**  
Gestión de presupuestos por mes con seguimiento de progreso (global o por categoría).

**Especificaciones**

- Selector de mes/año para ver presupuestos históricos
- Crear presupuesto: categoría (opcional = global), límite, moneda
- Barra de progreso: verde < 80%, amarillo 80-99%, rojo ≥ 100%
- Eliminar presupuesto con confirmación

**API usada**

```
GET    /budgets?month=2026-04-01
POST   /budgets
DELETE /budgets/:id
```

**Componentes involucrados**
- `app/src/pages/BudgetsPage.tsx`
- `app/src/services/budgetsService.ts`

---

### F-05 · Configuración de perfil

**Descripción**  
Página de ajustes donde el usuario personaliza su perfil.

**Especificaciones**

- Campos: `display_name`, `whatsapp_phone_e164` (E.164), `default_currency`, `timezone`
- Validación de formato E.164 en el frontend antes de enviar
- Error de conflicto si el teléfono ya existe en otra cuenta (HTTP 409)

**API usada**

```
GET /profile
PUT /profile
```

**Componentes involucrados**
- `app/src/pages/SettingsPage.tsx`
- `app/src/services/profileService.ts`

---

## Esquema de base de datos

### Tablas

| Tabla | Propósito |
|-------|-----------|
| `users` | Credenciales de autenticación: email + password_hash |
| `profiles` | Perfil del usuario: nombre, teléfono, moneda, timezone |
| `categories` | Catálogo de categorías (12 del sistema + personalizadas) |
| `transactions` | Gastos e ingresos con categoría, canal y metadatos |
| `budgets` | Presupuestos mensuales globales o por categoría |
| `conversation_messages` | Historial para el agente AI externo (auditoría) |

### Enums

| Enum | Valores |
|------|---------|
| `transaction_type` | `expense`, `income` |
| `source_channel` | `whatsapp`, `web`, `api` |
| `message_direction` | `inbound`, `outbound` |

### Categorías del sistema (seed)

| Slug | Nombre | Orden |
|------|--------|-------|
| `comida` | Comida | 10 |
| `transporte` | Transporte | 20 |
| `vivienda` | Vivienda | 30 |
| `salud` | Salud | 40 |
| `entretenimiento` | Entretenimiento | 50 |
| `educacion` | Educacion | 60 |
| `servicios` | Servicios | 70 |
| `compras` | Compras | 80 |
| `deuda` | Deuda | 90 |
| `salario` | Salario | 100 |
| `otros_ingresos` | Otros_ingresos | 110 |
| `otros_gastos` | Otros_gastos | 120 |

---

## Seguridad

- **Auth:** JWT Bearer en todos los endpoints de datos
- **Password:** bcrypt con 12 rounds
- **Ownership:** cada servicio valida `user_id` del JWT vs dato solicitado
- **CORS:** configurado en `main.ts` para `FRONTEND_URL`
- **No RLS:** la autorización es responsabilidad exclusiva del API (no de la BD)

---

## Setup y comandos

```bash
# Instalar dependencias
npm install

# Iniciar base de datos (Docker)
npm run db:start

# Desarrollo (app + api en paralelo)
npm run dev

# Reset de BD (borra datos)
npm run db:reset

# Tests
npm run test

# Lint
npm run lint
```

---

## Variables de entorno requeridas

| Variable | Scope | Descripción |
|----------|-------|-------------|
| `DATABASE_URL` | API | Connection string PostgreSQL |
| `JWT_SECRET` | API | Secreto para firmar tokens JWT |
| `FRONTEND_URL` | API | Origen permitido para CORS |
| `PORT` | API | Puerto del servidor (default: 3000) |
| `VITE_API_URL` | Frontend | URL base del API |

Ver `.env.example` en la raíz para el template.

---

## Endpoints del API (resumen para agente externo)

El API está diseñado para también ser consumido por el agente de AI externo. Ver `ai/legacy-ai.md` para el contrato completo.

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| POST | `/auth/register` | No | Crear cuenta |
| POST | `/auth/login` | No | Iniciar sesión, obtener JWT |
| GET | `/profile` | JWT | Obtener perfil (moneda, timezone) |
| PUT | `/profile` | JWT | Actualizar perfil |
| GET | `/categories` | JWT | Listar categorías del sistema |
| GET | `/transactions` | JWT | Listar transacciones (page, type, from, to) |
| POST | `/transactions` | JWT | Crear transacción |
| PUT | `/transactions/:id` | JWT | Actualizar transacción |
| DELETE | `/transactions/:id` | JWT | Eliminar transacción |
| GET | `/budgets` | JWT | Listar presupuestos (month) |
| POST | `/budgets` | JWT | Crear presupuesto |
| DELETE | `/budgets/:id` | JWT | Eliminar presupuesto |

---

## Lo que se eliminó en v2.0 (historial)

| Componente | Motivo |
|------------|--------|
| Twilio / WhatsApp webhook | Canal conversacional retirado; la entrada es solo desde el dashboard web |
| Supabase (BaaS) | Reemplazado por PostgreSQL directo en Docker + auth JWT propia |
| Paquete `ai/` (interpret) | Capacidades delegadas a agente externo; ver `ai/legacy-ai.md` |
| RLS (Row Level Security) | Ya no se usa acceso directo a la BD desde el frontend |
| `db/generated/database.types.ts` | Tipos ahora se mantienen manualmente en `app/src/types/index.ts` |
