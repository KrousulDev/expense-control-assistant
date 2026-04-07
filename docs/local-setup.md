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

---

## 10. Probar el MCP Server

El API expone un servidor MCP en `POST /mcp` usando el protocolo [Model Context Protocol](https://modelcontextprotocol.io) con Streamable HTTP transport. Cada request es **stateless** — no hay sesión persistente entre llamadas.

> Prerequisito: tener el API corriendo (`npm run dev:api`) y un token JWT válido (ver sección 5).

### Obtener el token y guardarlo

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' | jq -r '.accessToken')

echo "Token: ${TOKEN:0:40}..."
```

### Headers obligatorios en cada request MCP

Todos los requests al endpoint `/mcp` requieren estos 3 headers:

| Header | Valor |
|--------|-------|
| `Content-Type` | `application/json` |
| `Accept` | `application/json, text/event-stream` |
| `Authorization` | `Bearer <tu-token>` |

> El header `Accept` es obligatorio — sin él el servidor retorna `{"error":{"code":-32000,"message":"Not Acceptable: Client must accept both application/json and text/event-stream"}}`.

### 1. Inicializar sesión

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": { "name": "curl-test", "version": "1.0" }
    }
  }'
```

Respuesta esperada:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": { "tools": {} },
    "serverInfo": { "name": "expense-control", "version": "1.0.0" }
  }
}
```

### 2. Listar tools disponibles

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}' | jq '.result.tools[].name'
```

Salida esperada:
```
"get_user_context"
"list_transactions"
"create_transaction"
"get_budget_status"
```

### 3. Llamar `get_user_context`

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "get_user_context",
      "arguments": {}
    }
  }' | jq '.result.content[0].text | fromjson'
```

### 4. Llamar `list_transactions`

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "list_transactions",
      "arguments": {
        "type": "expense",
        "from": "2026-04-01",
        "to": "2026-05-01",
        "pageSize": 5
      }
    }
  }' | jq '.result.content[0].text | fromjson'
```

### 5. Llamar `create_transaction`

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tools/call",
    "params": {
      "name": "create_transaction",
      "arguments": {
        "type": "expense",
        "amount": 350,
        "currency": "MXN",
        "description": "Gasolina",
        "rawUserText": "gasté 350 en gasolina"
      }
    }
  }' | jq '.result.content[0].text | fromjson'
```

### 6. Llamar `get_budget_status`

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 6,
    "method": "tools/call",
    "params": {
      "name": "get_budget_status",
      "arguments": { "month": "2026-04" }
    }
  }' | jq '.result.content[0].text | fromjson'
```

### Alternativa: MCP Inspector (UI visual)

```bash
npx @modelcontextprotocol/inspector
```

Abre `http://localhost:6274`, selecciona **Streamable HTTP**, ingresa:
- URL: `http://localhost:3000/mcp`
- Header: `Authorization: Bearer <tu-token>`

### Alternativa: Script Node.js con el SDK Client

Crea `test-mcp.mjs` en la raíz del proyecto y ejecútalo:

```js
// test-mcp.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE = 'http://localhost:3000';

const { accessToken } = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
}).then(r => r.json());

const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
  requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
});
const client = new Client({ name: 'test', version: '1.0.0' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log('Tools:', tools.map(t => t.name));

const ctx = await client.callTool({ name: 'get_user_context', arguments: {} });
console.log(JSON.parse(ctx.content[0].text));

await client.close();
```

```bash
node test-mcp.mjs
```

---

## 11. Agregar un nuevo tool al MCP Server

El archivo central es `api/src/mcp/mcp.service.ts`, método `buildServer()`. Sigue estos pasos:

### Paso 1 — Definir el tool en `mcp.service.ts`

Dentro del método `buildServer(userId: string)`, añade una nueva llamada a `server.registerTool()` siguiendo el patrón existente:

```typescript
server.registerTool(
  'nombre_del_tool',          // snake_case, único
  {
    description: 'Descripción clara para el LLM de qué hace este tool y cuándo usarlo.',
    inputSchema: z.object({
      // Define los parámetros con tipos Zod
      parametro: z.string().describe('Descripción del parámetro'),
      opcionalNum: z.number().optional().describe('Parámetro opcional'),
    }),
  },
  async (args) => {
    // args está tipado según el inputSchema
    const resultado = await this.algunServicio.metodo(userId, args.parametro);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(resultado, null, 2),
        },
      ],
    };
  },
);
```

### Paso 2 — Inyectar dependencias si hace falta

Si el tool necesita un servicio que el `McpService` no tiene todavía:

**a)** Inyecta el servicio en el constructor de `McpService`:

```typescript
// api/src/mcp/mcp.service.ts
constructor(
  // ... servicios existentes ...
  private readonly nuevoServicio: NuevoServicio,
) {}
```

**b)** Agrega el módulo del servicio en los imports de `McpModule`:

```typescript
// api/src/mcp/mcp.module.ts
@Module({
  imports: [
    ProfilesModule,
    CategoriesModule,
    TransactionsModule,
    BudgetsModule,
    NuevoModule,   // ← agregar aquí
    JwtModule.registerAsync({ ... }),
  ],
  ...
})
```

**c)** Asegúrate de que `NuevoModule` exporte el servicio:

```typescript
// api/src/nuevo/nuevo.module.ts
@Module({
  providers: [NuevoServicio],
  exports: [NuevoServicio],   // ← esto es obligatorio
})
export class NuevoModule {}
```

### Paso 3 — Verificar tipos con TypeScript

```bash
cd api && npx tsc --noEmit
```

No debe haber errores. El servidor recarga automáticamente si `npm run dev` está corriendo.

### Paso 4 — Probar el tool con curl

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 99,
    "method": "tools/call",
    "params": {
      "name": "nombre_del_tool",
      "arguments": { "parametro": "valor" }
    }
  }' | jq '.result.content[0].text | fromjson'
```

### Referencia rápida de tipos Zod disponibles

| Tipo | Ejemplo |
|------|---------|
| String | `z.string()` |
| Número | `z.number()` |
| Entero positivo | `z.number().int().positive()` |
| Enum | `z.enum(['a', 'b'])` |
| Booleano | `z.boolean()` |
| UUID | `z.string().uuid()` |
| Fecha ISO | `z.string()` (validar con `.regex(/^\d{4}-\d{2}-\d{2}$/)`) |
| Mes YYYY-MM | `z.string().regex(/^\d{4}-\d{2}$/)` |
| Objeto anidado | `z.object({ campo: z.string() })` |
| Array | `z.array(z.string())` |
| Opcional | `.optional()` al final |
| Con descripción | `.describe('texto para el LLM')` |
