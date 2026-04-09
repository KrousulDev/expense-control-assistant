# Arquitectura — Expense Control Assistant

> Última actualización: 2026-04-09

---

## Tabla de contenido

1. [Visión general](#1-visión-general)
2. [Arquitectura en producción](#2-arquitectura-en-producción)
3. [Componentes del sistema](#3-componentes-del-sistema)
4. [Arquitectura de comunicación](#4-arquitectura-de-comunicación)
5. [Estructura de carpetas](#5-estructura-de-carpetas)
6. [Backend — Módulos NestJS](#6-backend--módulos-nestjs)
7. [Frontend — React SPA](#7-frontend--react-spa)
8. [Base de datos](#8-base-de-datos)
9. [Interfaz MCP para agentes AI](#9-interfaz-mcp-para-agentes-ai)
10. [Nginx — Enrutamiento](#10-nginx--enrutamiento)
11. [Redes Docker](#11-redes-docker)
12. [Casos de uso](#12-casos-de-uso)

---

## 1. Visión general

**Expense Control Assistant** es una aplicación web de control de gastos personales compuesta por:

- **Dashboard web** (React SPA): registro y visualización de transacciones e ingresos.
- **API REST** (NestJS): backend que persiste los datos y expone endpoints REST + MCP.
- **Interfaz MCP**: permite que agentes AI externos registren gastos/ingresos vía lenguaje natural.

El sistema coexiste en producción junto a la aplicación **10x-builders** (agente LLM Next.js) compartiendo el mismo nginx y el mismo túnel ngrok.

**Referencias de documentación:**
- MVP y requisitos: [`docs/mvp.md`](./mvp.md)
- Setup local: [`docs/local-setup.md`](./local-setup.md)
- Despliegue en producción: [`despliegue-prd.md`](../despliegue-prd.md)
- Guía MCP para agentes: [`ai/mcp-client-guide.md`](../ai/mcp-client-guide.md)
- Contexto AI legacy: [`ai/legacy-ai.md`](../ai/legacy-ai.md)

---

## 2. Arquitectura en producción

El siguiente diagrama refleja el sistema completo desplegado en el servidor `192.168.1.212`.

```
Internet (HTTPS)
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Docker (servidor 192.168.1.212)                                            │
│                                                                             │
│  ┌──────────────────────┐                                                   │
│  │  10x-builders-ngrok  │  ngrok/ngrok:latest                              │
│  │  Túnel HTTPS público │  → nginx:80 (interno)                            │
│  └──────────┬───────────┘                                                   │
│             │ HTTP interno                                                  │
│             ▼                                                               │
│  ┌──────────────────────────────────────────────────┐                      │
│  │  10x-builders-nginx  (nginx:1.27-alpine)         │ ◄── 192.168.1.212   │
│  │  Reverse proxy unificado                         │     (acceso LAN)     │
│  │  listen :80 (ngrok) + :3000 (host/LAN)          │                      │
│  │  Gzip, WebSocket, rate limiting, headers CSP     │                      │
│  └──────┬──────────┬────────────┬───────────────────┘                      │
│         │          │            │                                           │
│   strip │    strip │      strip │                strip        solo LAN      │
│  /expense  /expense-api/  /expense-api/auth/   /agent    192.168.1.212     │
│         │          │            │                  │              │         │
│         ▼          ▼            ▼                  ▼              ▼         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐  ┌─────────────┐ ┌──────────────┐│
│  │expense-  │ │expense-  │ │expense-  │  │ agent:4000  │ │ open-webui   ││
│  │app:80    │ │api:3000  │ │api:3000  │  │ Next.js 16  │ │              ││
│  │nginx:alp │ │(NestJS)  │ │rate limit│  │ LangGraph   │ └──────────────┘│
│  │sirve SPA │ │REST API  │ │auth      │  │ agent       │                  │
│  └──────────┘ └────┬─────┘ └──────────┘  │ (standalone)│                  │
│                    │                      └─────┬───────┘                  │
│                    ▼                            │                           │
│  ┌──────────────────────┐                       │ Internet / cloud          │
│  │  expense-db:5432     │              ┌────────▼────────────┐             │
│  │  PostgreSQL 17       │              │ Supabase (hosted)   │             │
│  │  (Docker volume)     │              │ OpenRouter (LLM GW) │             │
│  └──────────────────────┘              │ Telegram Bot API    │             │
│                                        └─────────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Componentes del sistema

### 3.1 `10x-builders-ngrok`

| Atributo | Valor |
|---|---|
| Imagen | `ngrok/ngrok:latest` |
| Función | Túnel HTTPS público hacia el nginx interno |
| Configuración | Apunta a `nginx:80` dentro de la red `10x-builders_internal` |
| Dashboard | `http://192.168.1.212:4040` |

Expone toda la infraestructura al exterior con una URL HTTPS pública (generada por ngrok). Actúa como punto de entrada único desde internet.

---

### 3.2 `10x-builders-nginx` (reverse proxy unificado)

| Atributo | Valor |
|---|---|
| Imagen | `nginx:1.27-alpine` |
| Puertos | `:80` (ngrok inbound) · `:3000` (LAN, mapeado al host) |
| Config | `nginx/nginx.conf` (en repo) → bind mount en servidor |
| Redes | `10x-builders_internal` + `expense_network` |

El nginx es el **único punto de entrada** para ambas aplicaciones. Implementa:

- **Rate limiting** por zona (`auth`: 5 req/min · `api`: 10 req/s · `general`: 30 req/s)
- **Headers de seguridad** OWASP A05 (CSP, HSTS, X-Frame-Options, etc.)
- **Gzip** para JSON, JS, CSS, SVG
- **Estrategia de caché**: `index.html` sin caché · assets con hash `immutable` (1 año)
- **Routing path-based**: diferencia expense-control de 10x-builders por prefijo de URL

Tabla de rutas:

| Path | Destino | Notas |
|---|---|---|
| `/expense/` | `expense-app:80` | SPA React, strip prefijo |
| `/expense/assets/` | `expense-app:80` | Cache immutable |
| `/expense-api/auth/` | `expense-api:3000` | Rate limit estricto (5 req/min) |
| `/expense-api/` | `expense-api:3000` | Rate limit estándar |
| `/agent` | `web:3000` | WebSocket + streaming |
| `/api/auth/` | `web:3000` | Rewrite `/api/` → `/agent/api/` |
| `/api/` | `web:3000` | Streaming, sin buffer |
| `/_next/static/` | `web:3000` | Cache 1 año |
| `/` | — | Redirect 301 → `/expense/` |

> Ref: [`nginx/nginx.conf`](../nginx/nginx.conf) · [`despliegue-prd.md`](../despliegue-prd.md)

---

### 3.3 `expense-app` — Frontend React SPA

| Atributo | Valor |
|---|---|
| Imagen | `nginx:alpine` (sirve build estático de Vite) |
| Puerto interno | `:80` |
| Build | `app/Dockerfile` — multi-stage: Node build → nginx:alpine |
| Base URL | `/expense/` (configurada con `VITE_BASE`) |

Sirve la Single Page Application construida con React + Vite. El nginx interno de este contenedor usa `try_files` para soportar client-side routing (SPA fallback a `index.html`).

> Ref: [`app/nginx-static.conf`](../app/nginx-static.conf) · [`app/src/`](../app/src/)

---

### 3.4 `expense-api` — Backend NestJS

| Atributo | Valor |
|---|---|
| Imagen | Construida desde `api/Dockerfile` (node:22-alpine, multi-stage) |
| Puerto interno | `:3000` |
| Framework | NestJS 11 |
| Auth | JWT (HS256, expira 7 días) + bcrypt |
| MCP | `POST /mcp` — MCP Streamable HTTP (stateless) |

API REST principal que maneja toda la lógica de negocio. Consulta PostgreSQL directamente vía `DatabaseService.query()` (pool de conexiones `pg`).

> Ref: [`api/src/`](../api/src/) · [`docs/mvp.md`](./mvp.md)

---

### 3.5 `expense-db` — PostgreSQL 17

| Atributo | Valor |
|---|---|
| Imagen | `postgres:17` |
| Puerto | `:5432` (dentro de `expense_network`) |
| Schema | `db/init.sql` — aplicado al inicializar el contenedor |
| Volumen | `expense_db_data` (named volume Docker) |

Base de datos única del proyecto. El schema se define en `db/init.sql` y se aplica automáticamente en el primer arranque del contenedor.

> Ref: [`db/init.sql`](../db/init.sql) · [`docs/feature-expense-assistant-db-schema.md`](./feature-expense-assistant-db-schema.md)

---

### 3.6 `agent` (web) — Agente LLM Next.js

| Atributo | Valor |
|---|---|
| Framework | Next.js 16 (standalone) |
| Puerto | `:4000` |
| Acceso | `/agent` vía nginx |
| Stack AI | LangGraph + OpenRouter (LLM gateway) |

Componente del proyecto **10x-builders** que coexiste en la misma infraestructura. Puede llamar al API de expense-control directamente vía red privada (`192.168.1.212`).

---

### 3.7 `open-webui`

| Atributo | Valor |
|---|---|
| Acceso | Solo desde LAN (`http://192.168.1.212:3002`) |
| Función | UI web para interactuar con LLMs locales |

Accesible únicamente desde la red privada, no expuesto a través de ngrok ni del nginx.

---

## 4. Arquitectura de comunicación

### Flujo de datos general

```
Navegador / Agente AI
        │
        │ HTTPS (ngrok) o HTTP (LAN :3000)
        ▼
10x-builders-nginx (reverse proxy)
        │
        ├── /expense-api/*  →  expense-api (NestJS :3000)
        │                            │
        │                            └──► expense-db (PostgreSQL :5432)
        │
        └── /expense/*      →  expense-app (React SPA :80)
                                     │
                                     │ HTTP REST (VITE_API_URL relativa)
                                     └──► /expense-api/* (vuelve al nginx)
```

### Principios de comunicación

1. El **frontend NUNCA accede a la BD directamente** — toda comunicación es HTTP REST.
2. **JWT en cada request**: almacenado en `localStorage`, incluido en `Authorization: Bearer <token>`.
3. `VITE_API_URL` es **relativa** (`/expense-api`) para funcionar desde LAN y ngrok sin mixed-content.
4. El **agente AI externo** puede usar REST directo o MCP Streamable HTTP (`POST /mcp`).

---

## 5. Estructura de carpetas

```
expense-control-assistant/
│
├── app/                          # Frontend React SPA
│   ├── Dockerfile                # Multi-stage: Node build → nginx:alpine
│   ├── nginx-static.conf         # nginx interno del contenedor SPA (try_files)
│   ├── index.html                # Entry point HTML (Vite)
│   ├── vite.config.ts            # Config Vite (base URL, aliases)
│   └── src/
│       ├── main.tsx              # Bootstrap React + BrowserRouter con basename
│       ├── App.tsx               # Rutas protegidas (React Router v7)
│       ├── index.css             # Tailwind v4 global styles
│       ├── assets/               # Imágenes estáticas (hero.png, SVGs)
│       ├── components/           # Componentes reutilizables
│       │   ├── Layout.tsx        # Sidebar + header (shell principal)
│       │   ├── ProtectedRoute.tsx # Guard de rutas autenticadas
│       │   ├── TransactionModal.tsx # Modal crear/editar transacción
│       │   └── DeleteConfirmDialog.tsx # Diálogo de confirmación borrado
│       ├── contexts/             # Context API
│       │   ├── AuthContext.tsx   # Proveedor de autenticación (login, logout, user)
│       │   └── auth-context.ts  # Tipo del contexto
│       ├── hooks/
│       │   └── useAuth.ts       # Hook para consumir AuthContext
│       ├── lib/
│       │   └── apiClient.ts     # Cliente HTTP centralizado (Axios/fetch + JWT header)
│       ├── pages/               # Vistas principales (1 por ruta)
│       │   ├── LoginPage.tsx    # Pantalla de login
│       │   ├── DashboardPage.tsx # Resumen financiero
│       │   ├── TransactionsPage.tsx # Listado + CRUD transacciones
│       │   ├── BudgetsPage.tsx  # Gestión de presupuestos
│       │   └── SettingsPage.tsx # Perfil de usuario
│       ├── services/            # Capa de acceso al API (una por recurso)
│       │   ├── authService.ts   # login(), register()
│       │   ├── transactionsService.ts # getAll(), create(), update(), delete()
│       │   ├── categoriesService.ts   # getAll()
│       │   ├── budgetsService.ts      # getAll(), create(), delete()
│       │   └── profileService.ts     # get(), update()
│       ├── test/
│       │   └── setup.ts         # Vitest global setup (Testing Library)
│       └── types/
│           └── index.ts         # Tipos TypeScript compartidos (Transaction, Budget, etc.)
│
├── api/                          # Backend NestJS
│   ├── Dockerfile                # Multi-stage: build → node:22-alpine
│   ├── nest-cli.json             # Config NestJS CLI
│   └── src/
│       ├── main.ts               # Bootstrap NestJS (puerto, CORS, pipes)
│       ├── app.module.ts         # Módulo raíz (importa todos los módulos)
│       ├── app.controller.ts     # GET /health (Docker healthcheck)
│       ├── database/
│       │   ├── database.module.ts  # Proveedor global del pool pg
│       │   └── database.service.ts # query() — wrapper de pg.Pool
│       ├── auth/                 # Módulo de autenticación
│       │   ├── auth.module.ts
│       │   ├── auth.controller.ts  # POST /auth/register, POST /auth/login
│       │   ├── auth.service.ts     # bcrypt hash/compare, JWT sign
│       │   ├── jwt.strategy.ts     # Validación del token (PassportStrategy)
│       │   ├── jwt-auth.guard.ts   # Guard para rutas protegidas
│       │   ├── current-user.decorator.ts # @CurrentUser() extrae userId del JWT
│       │   └── dto/
│       │       ├── login.dto.ts
│       │       └── register.dto.ts
│       ├── profiles/             # Perfil de usuario
│       │   ├── profiles.module.ts
│       │   ├── profiles.controller.ts  # GET /profile, PUT /profile
│       │   └── profiles.service.ts
│       ├── transactions/         # Transacciones (gastos e ingresos)
│       │   ├── transactions.module.ts
│       │   ├── transactions.controller.ts # GET/POST /transactions, PUT/DELETE /transactions/:id
│       │   └── transactions.service.ts
│       ├── categories/           # Categorías del sistema
│       │   ├── categories.module.ts
│       │   ├── categories.controller.ts  # GET /categories
│       │   └── categories.service.ts
│       ├── budgets/              # Presupuestos mensuales
│       │   ├── budgets.module.ts
│       │   ├── budgets.controller.ts     # GET/POST /budgets, DELETE /budgets/:id
│       │   └── budgets.service.ts
│       └── mcp/                  # MCP Streamable HTTP Server
│           ├── mcp.module.ts
│           ├── mcp.controller.ts   # POST /mcp (MCP protocol handler)
│           └── mcp.service.ts      # Registra tools: get_user_context, list_transactions,
│                                   #   create_transaction, get_budget_status
│
├── db/                           # Base de datos
│   ├── init.sql                  # Schema PostgreSQL (fuente de verdad)
│   ├── docker-compose.yml        # PostgreSQL standalone (desarrollo local)
│   └── supabase/snippets/        # Snippets históricos (Supabase, legacy)
│
├── nginx/
│   └── nginx.conf                # Config nginx unificada (expense + 10x-builders)
│                                 # En producción: bind mount en 10x-builders-nginx
│
├── ai/
│   ├── mcp-client-guide.md       # Guía para conectar agentes AI via MCP
│   └── legacy-ai.md              # Contexto del módulo AI removido (histórico)
│
├── docs/                         # Documentación del proyecto
│   ├── architecture.md           # Este documento
│   ├── mvp.md                    # Especificación MVP v2 (features, endpoints, schema)
│   ├── local-setup.md            # Setup local, curl examples, MCP testing
│   ├── 2026-04-03-edit-delete-transactions.md  # Feature: edit/delete (histórico)
│   └── feature-expense-assistant-db-schema.md  # Schema original (legacy Supabase)
│
├── scripts/
│   ├── deploy-expenses-control.sh # Script de despliegue rsync + docker-compose
│   └── setup-server.sh           # Setup inicial del servidor Ubuntu
│
├── qa-reports/
│   └── screenshots/              # Screenshots de QA (generados por qa-engineer)
│
├── .cursor/
│   ├── rules/forma_de_trabajo.mdc # Reglas de trabajo para el agente AI
│   ├── agents/                    # Prompts de sub-agentes (qa-engineer, feature-documentator)
│   └── skills/                    # Skills del agente (TDD, browser, DB, etc.)
│
├── docker-compose.yml            # Stack completo: DB + API + App (producción)
├── docker-compose.app.yml        # Solo API + App (BD externa, uso en producción)
├── despliegue-prd.md             # Guía completa de despliegue en producción
├── quickly-commands.md           # Comandos de diagnóstico rápido
├── package.json                  # Raíz monorepo (npm workspaces: app, api)
├── .env.example                  # Template de variables de entorno
└── .env.production               # Template producción (sin secretos reales)
```

---

## 6. Backend — Módulos NestJS

Todos los endpoints de datos requieren `JwtAuthGuard`. El `userId` se extrae del JWT con `@CurrentUser()` — nunca se acepta como parámetro externo.

| Módulo | Endpoints | Guard | Descripción |
|---|---|---|---|
| `app` | `GET /health` | Público | Healthcheck para Docker |
| `auth` | `POST /auth/register` `POST /auth/login` | Público | Registro y login JWT |
| `profiles` | `GET /profile` `PUT /profile` | JWT | Perfil del usuario autenticado |
| `transactions` | `GET /transactions` `POST /transactions` `PUT /transactions/:id` `DELETE /transactions/:id` | JWT | CRUD de transacciones |
| `categories` | `GET /categories` | JWT | Categorías del sistema (seed en init.sql) |
| `budgets` | `GET /budgets` `POST /budgets` `DELETE /budgets/:id` | JWT | Presupuestos mensuales |
| `mcp` | `POST /mcp` | JWT (header) | MCP Streamable HTTP — tools para agentes AI |
| `database` | — | — | Pool PostgreSQL compartido (`DatabaseService.query()`) |

### Patrón de implementación

```
Controller (HTTP/MCP)
    └── Service (lógica de negocio)
            └── DatabaseService.query() (SQL raw sobre pg.Pool)
                        └── PostgreSQL 17
```

> Ref: [`api/src/`](../api/src/) · [`docs/local-setup.md`](./local-setup.md)

---

## 7. Frontend — React SPA

### Stack

- **React 19** + **React Router v7** (con `basename` para sub-ruta `/expense/`)
- **Vite 8** (bundler, dev server)
- **Tailwind v4** (utility-first CSS)
- **Vitest** + **Testing Library** (tests unitarios)

### Arquitectura de capas

```
Pages (vistas/rutas)
    └── Services (transactionsService, budgetsService, …)
            └── apiClient.ts (HTTP client con JWT automático)
                    └── API REST (/expense-api/*)
```

### Páginas

| Ruta | Componente | Función |
|---|---|---|
| `/login` | `LoginPage.tsx` | Login y registro |
| `/` → `/dashboard` | `DashboardPage.tsx` | Resumen financiero |
| `/transactions` | `TransactionsPage.tsx` | Listado + modal crear/editar + borrar |
| `/budgets` | `BudgetsPage.tsx` | Ver y crear presupuestos mensuales |
| `/settings` | `SettingsPage.tsx` | Editar perfil (nombre, moneda, timezone) |

### Auth Flow

1. Login → API devuelve `accessToken` (JWT)
2. Token guardado en `localStorage`
3. `apiClient.ts` inyecta `Authorization: Bearer <token>` en cada request
4. `AuthContext` provee `user`, `login()`, `logout()` a toda la app
5. `ProtectedRoute` redirige a `/login` si no hay token

> Ref: [`app/src/`](../app/src/) · [`docs/2026-04-03-edit-delete-transactions.md`](./2026-04-03-edit-delete-transactions.md)

---

## 8. Base de datos

Schema definido en [`db/init.sql`](../db/init.sql). Fuente de verdad única — no hay ORM ni migraciones externas.

### Tablas

| Tabla | Descripción |
|---|---|
| `users` | Credenciales (email + password hash) |
| `profiles` | Perfil extendido (display_name, currency, timezone) |
| `categories` | Categorías del sistema (12 seeds: Alimentación, Transporte, etc.) |
| `transactions` | Gastos e ingresos (amount, type, category, description, occurred_at) |
| `budgets` | Presupuestos mensuales por categoría (amount_limit, month YYYY-MM) |
| `conversation_messages` | Mensajes de conversación con agentes AI (auditoría) |

### Enums

| Enum | Valores |
|---|---|
| `transaction_type` | `expense`, `income` |
| `source_channel` | `web`, `telegram`, `whatsapp`, `api` |
| `message_direction` | `in`, `out` |

### Características

- **`pgcrypto`**: UUIDs como PKs (`gen_random_uuid()`)
- **`set_updated_at()`**: trigger que actualiza `updated_at` automáticamente
- **Aislamiento por usuario**: todas las queries filtran por `user_id` extraído del JWT
- **Índices**: `user_id` en transactions y budgets, `occurred_at` en transactions

---

## 9. Interfaz MCP para agentes AI

El backend expone un **MCP Server stateless** en `POST /mcp` que implementa el protocolo [MCP Streamable HTTP](https://modelcontextprotocol.io/specification).

### Autenticación del agente

```http
POST /auth/login
→ { "accessToken": "eyJ..." }

POST /mcp
Authorization: Bearer eyJ...
```

### Tools disponibles

| Tool | Descripción | Parámetros requeridos |
|---|---|---|
| `get_user_context` | Perfil, categorías y presupuestos activos | — |
| `list_transactions` | Lista transacciones con filtros | `type`, `from`, `to`, `page`, `pageSize` (todos opcionales) |
| `create_transaction` | Registra gasto o ingreso | `type`, `amount` |
| `get_budget_status` | Estado de presupuestos de un mes (límite vs. real) | `month` (YYYY-MM) |

### Compatibilidad verificada

| Cliente | Compatible |
|---|---|
| Claude (claude-mcp-sdk) | ✅ |
| OpenAI Agent SDK | ✅ |
| LangChain / LangGraph con MCP | ✅ |
| `@modelcontextprotocol/sdk` TypeScript | ✅ |
| `mcp` Python SDK | ✅ |

> Ref: [`ai/mcp-client-guide.md`](../ai/mcp-client-guide.md) · [`api/src/mcp/`](../api/src/mcp/)

---

## 10. Nginx — Enrutamiento

El archivo [`nginx/nginx.conf`](../nginx/nginx.conf) define el server block unificado.

### Rate limiting

| Zona | Límite | Aplicada en |
|---|---|---|
| `auth` | 5 req/min (burst 10) | `/expense-api/auth/`, `/api/auth/` |
| `api` | 10 req/s (burst 30) | `/expense-api/`, `/api/` |
| `general` | 30 req/s (burst 50) | `/expense/`, `/agent`, `/` |

### Estrategia de caché

```
/expense/           → Cache-Control: no-cache        ← index.html, siempre fresco
/expense/assets/*   → Cache-Control: immutable (1y)  ← JS/CSS con hash en nombre
/_next/static/      → Cache-Control: immutable (1y)  ← Next.js assets
```

### Headers de seguridad (OWASP A05)

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (HSTS)
- `Content-Security-Policy` (CSP)
- `Permissions-Policy`
- `Referrer-Policy`

---

## 11. Redes Docker

```
expense_network (external: true)
├── expense-app      (:80)
├── expense-api      (:3000)
├── expense-db       (:5432)
└── 10x-builders-nginx  ← puente entre ambas redes

10x-builders_internal
├── 10x-builders-nginx
├── 10x-builders-web (Next.js agent)
└── 10x-builders-ngrok
```

El nginx de 10x-builders está en **ambas redes**, actuando como router entre los dos proyectos.

### docker-compose files

| Archivo | Uso |
|---|---|
| `docker-compose.yml` | Stack completo (DB + API + App) — producción o reset total |
| `docker-compose.app.yml` | Solo API + App (BD ya levantada externamente) — deploys rápidos |
| `db/docker-compose.yml` | Solo PostgreSQL — desarrollo local |

---

## 12. Casos de uso

### UC-01 — Registro de usuario

**Actor:** Usuario nuevo  
**Precondición:** Ninguna  
**Flujo:**
1. Usuario completa email y password en `LoginPage`
2. Frontend llama `authService.register()` → `POST /auth/register`
3. API crea registro en `users` (password con bcrypt) y en `profiles` (defaults)
4. Retorna JWT → frontend almacena en `localStorage` y redirige al dashboard

**Archivos involucrados:** `app/src/pages/LoginPage.tsx` · `app/src/services/authService.ts` · `api/src/auth/`

---

### UC-02 — Login de usuario

**Actor:** Usuario registrado  
**Precondición:** Cuenta existente  
**Flujo:**
1. Usuario ingresa email y password
2. `POST /auth/login` → API verifica bcrypt, genera JWT (7 días)
3. Frontend guarda token y redirige al dashboard

**Archivos involucrados:** `api/src/auth/auth.service.ts` · `app/src/contexts/AuthContext.tsx`

---

### UC-03 — Registrar transacción (dashboard)

**Actor:** Usuario autenticado  
**Precondición:** Sesión activa, categorías cargadas  
**Flujo:**
1. Usuario abre `TransactionModal` (botón "Nueva transacción")
2. Completa: tipo (gasto/ingreso), monto, categoría, descripción, fecha
3. Frontend llama `transactionsService.create()` → `POST /transactions`
4. API inserta en `transactions` con `user_id` del JWT y `source_channel = 'web'`
5. Modal se cierra y la lista se refresca

**Archivos involucrados:** `app/src/components/TransactionModal.tsx` · `api/src/transactions/`

---

### UC-04 — Editar transacción

**Actor:** Usuario autenticado  
**Precondición:** Transacción existente  
**Flujo:**
1. Usuario hace clic en "Editar" en la fila de la transacción
2. `TransactionModal` se abre pre-relleno con los datos actuales
3. Usuario modifica campos y confirma
4. `PUT /transactions/:id` → API verifica que `user_id` del JWT coincide con el dueño
5. Registro actualizado en BD

**Archivos involucrados:** `app/src/components/TransactionModal.tsx` · `api/src/transactions/transactions.service.ts`

> Ref: [`docs/2026-04-03-edit-delete-transactions.md`](./2026-04-03-edit-delete-transactions.md)

---

### UC-05 — Eliminar transacción

**Actor:** Usuario autenticado  
**Precondición:** Transacción existente  
**Flujo:**
1. Usuario hace clic en "Eliminar"
2. `DeleteConfirmDialog` solicita confirmación
3. Al confirmar: `DELETE /transactions/:id` → API verifica propiedad y elimina
4. Lista se actualiza sin la transacción

**Archivos involucrados:** `app/src/components/DeleteConfirmDialog.tsx` · `api/src/transactions/transactions.controller.ts`

---

### UC-06 — Ver listado de transacciones

**Actor:** Usuario autenticado  
**Flujo:**
1. Usuario navega a `/transactions`
2. `GET /transactions` con filtros opcionales (tipo, rango de fechas, paginación)
3. API retorna transacciones del usuario ordenadas por `occurred_at DESC`
4. Frontend muestra tabla con columnas: fecha, descripción, categoría, tipo, monto

**Archivos involucrados:** `app/src/pages/TransactionsPage.tsx` · `api/src/transactions/transactions.service.ts`

---

### UC-07 — Ver dashboard financiero

**Actor:** Usuario autenticado  
**Flujo:**
1. Usuario accede a `/` (dashboard)
2. Frontend carga en paralelo: transacciones recientes, presupuestos del mes, perfil
3. Muestra: balance total, gastos vs. ingresos del mes, últimas transacciones, estado de presupuestos

**Archivos involucrados:** `app/src/pages/DashboardPage.tsx` · múltiples services

---

### UC-08 — Crear presupuesto mensual

**Actor:** Usuario autenticado  
**Flujo:**
1. Usuario va a `/budgets` y hace clic en "Nuevo presupuesto"
2. Selecciona categoría, mes (YYYY-MM) y límite de gasto
3. `POST /budgets` → API inserta en `budgets`
4. Lista de presupuestos se actualiza

**Archivos involucrados:** `app/src/pages/BudgetsPage.tsx` · `api/src/budgets/`

---

### UC-09 — Ver estado de presupuestos

**Actor:** Usuario autenticado  
**Flujo:**
1. Dashboard o página de budgets carga el mes actual
2. `GET /budgets` retorna límites con gasto real calculado (JOIN con transactions)
3. Muestra barra de progreso: límite vs. gastado vs. restante por categoría

**Archivos involucrados:** `api/src/budgets/budgets.service.ts`

---

### UC-10 — Actualizar perfil

**Actor:** Usuario autenticado  
**Flujo:**
1. Usuario va a `/settings`
2. Edita nombre, moneda por defecto, timezone
3. `PUT /profile` → API actualiza `profiles` del usuario
4. Cambios reflejados en el header del dashboard

**Archivos involucrados:** `app/src/pages/SettingsPage.tsx` · `api/src/profiles/`

---

### UC-11 — Agente AI registra transacción vía MCP

**Actor:** Agente AI externo (ej. bot de Telegram con LangGraph)  
**Precondición:** Agente tiene JWT válido del usuario  
**Flujo:**
1. Agente llama `get_user_context` → obtiene categorías y moneda por defecto del usuario
2. Agente interpreta texto libre del usuario con su LLM (ej. "gasté 250 en comida")
3. Agente llama `create_transaction` con los campos clasificados
4. API inserta en `transactions` con `source_channel = 'api'` y `raw_user_text` para auditoría
5. Agente confirma al usuario el registro exitoso

**Archivos involucrados:** `api/src/mcp/mcp.service.ts`  
> Ref: [`ai/mcp-client-guide.md`](../ai/mcp-client-guide.md)

---

### UC-12 — Agente AI consulta estado de presupuesto

**Actor:** Agente AI externo  
**Precondición:** JWT válido  
**Flujo:**
1. Usuario pregunta al agente "¿cómo voy con mi presupuesto de enero?"
2. Agente llama `get_budget_status` con `month: "2026-01"`
3. API retorna array con límite, gasto real y restante por categoría
4. Agente responde en lenguaje natural al usuario

**Archivos involucrados:** `api/src/mcp/mcp.service.ts` · `api/src/budgets/budgets.service.ts`

---

### UC-13 — Agente AI lista transacciones con filtros

**Actor:** Agente AI externo  
**Precondición:** JWT válido  
**Flujo:**
1. Usuario pregunta "¿cuánto gasté en restaurantes esta semana?"
2. Agente llama `list_transactions` con `type: 'expense'`, `from`, `to`
3. API retorna transacciones paginadas del período
4. Agente agrupa, suma y responde al usuario

**Archivos involucrados:** `api/src/mcp/mcp.service.ts` · `api/src/transactions/transactions.service.ts`

---

## Apéndice — Variables de entorno

### API (`api/.env`)

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | `postgresql://postgres:<pwd>@localhost:5432/expense_control` |
| `JWT_SECRET` | Secreto para firmar tokens (≥ 64 chars en producción) |
| `PORT` | Puerto del servidor NestJS (default: 3000) |
| `FRONTEND_URL` | URL del frontend para CORS |
| `NODE_ENV` | `development` o `production` |

### App (`app/.env`)

| Variable | Descripción |
|---|---|
| `VITE_API_URL` | URL base del API. **Relativa en producción** (`/expense-api`) |
| `VITE_BASE` | Base path de la SPA (`/expense/` en producción, `/` en local) |

### Agente externo

| Variable | Descripción |
|---|---|
| `EXPENSE_API_URL` | URL base del API (`http://localhost:3000` o URL de ngrok) |
| `EXPENSE_API_EMAIL` | Email de la cuenta del agente |
| `EXPENSE_API_PASSWORD` | Password de la cuenta del agente |

> Ref: [`.env.example`](../.env.example) · [`despliegue-prd.md`](../despliegue-prd.md#paso-3--crear-envproduction-en-el-servidor)
