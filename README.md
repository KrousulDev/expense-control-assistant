# expense-control-assistant

Dashboard web de control de gastos personales con API REST consumible por agentes de AI externos.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| Backend | NestJS (Node.js) |
| Base de datos | PostgreSQL 17 |
| Auth | JWT (bcrypt + @nestjs/jwt) |
| Gestor de paquetes | npm |

## Estructura

```
/
├── app/          ← React SPA (dashboard financiero)
├── api/          ← NestJS REST API
├── db/           ← Schema SQL + docker-compose de BD
├── context/      ← nginx.conf unificado (se despliega en 10x-builders)
├── nginx/        ← Referencia histórica de nginx
├── ai/           ← Guías para agentes de AI externos
└── docs/         ← Documentación de features
```

## Desarrollo local

```bash
# Instalar dependencias e iniciar la BD
npm install && npm run db:start

# Iniciar todos los servicios en modo desarrollo
npm run dev
```

## Producción

El sistema corre en `192.168.1.212` bajo Docker Compose.
Ver [`despliegue-prd.md`](despliegue-prd.md) para la guía completa de despliegue.

### Arquitectura en producción

```
Internet (ngrok HTTPS)
    │
    ▼
10x-builders-nginx  (listen :80 ngrok / :3000 LAN)
    ├── /expense/        → expense_control_app (React SPA)
    ├── /expense-api/    → expense_control_api (NestJS)
    ├── /agent           → 10x-builders-web (Next.js)
    └── /api/            → 10x-builders-web
         │
         └── expense_control_db (PostgreSQL 17)
```

### Acceso

| Canal | URL |
|---|---|
| LAN | `http://192.168.1.212:3000/expense/` |
| Internet | URL ngrok (ver `http://192.168.1.212:4040`) |
| open-webui | `http://192.168.1.212:3002` |

## Diagnóstico rápido

Ver [`quickly-commands.md`](quickly-commands.md) para comandos de diagnóstico en producción.

## Módulos del API

| Módulo | Endpoints | Acceso |
|---|---|---|
| `auth` | `POST /auth/register`, `POST /auth/login` | Público |
| `profile` | `GET /profile`, `PUT /profile` | JWT |
| `transactions` | `GET/POST /transactions`, `PUT/DELETE /transactions/:id` | JWT |
| `categories` | `GET /categories` | JWT |
| `budgets` | `GET/POST /budgets`, `DELETE /budgets/:id` | JWT |
| `health` | `GET /health` | Público (healthcheck) |
