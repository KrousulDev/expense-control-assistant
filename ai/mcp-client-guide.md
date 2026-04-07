# Guía: Conectar un Agente AI como MCP Client

> Esta guía describe paso a paso cómo un agente externo debe conectarse al MCP Server expuesto en `POST /mcp` del backend NestJS.

---

## Arquitectura

```
Agente AI (MCP Client)
    │
    │  HTTP POST /mcp
    │  Authorization: Bearer <jwt>
    ▼
API NestJS (MCP Server) → PostgreSQL
```

El servidor MCP es **stateless**: cada request POST crea una sesión limpia y termina cuando la respuesta se completa.

---

## Requisitos del Client

- Compatible con [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification)
- Capaz de enviar el header `Authorization: Bearer <token>` en cada request
- Soporte para JSON-RPC 2.0 sobre HTTP

### Compatibilidad verificada

| Entorno | Compatible |
|---|---|
| Claude (claude-mcp-sdk) | ✅ |
| OpenAI Agent SDK (tool_choice) | ✅ |
| LangChain / LangGraph con MCP | ✅ |
| `@modelcontextprotocol/sdk` Client (TypeScript) | ✅ |
| `mcp` Python SDK Client | ✅ |

---

## Paso 1 — Obtener el JWT

Antes de conectar el MCP Client, el agente debe autenticarse:

```http
POST http://localhost:3000/auth/login
Content-Type: application/json

{
  "email": "agente@ejemplo.com",
  "password": "tu-password"
}
```

Respuesta:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

Guarda este `accessToken` — lo necesitas en cada request al MCP Server.

---

## Paso 2 — Conectar el MCP Client (TypeScript)

### Instalación

```bash
npm install @modelcontextprotocol/sdk zod
```

### Cliente mínimo (stateless, un request)

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const MCP_URL = 'http://localhost:3000/mcp';
const accessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // obtenido del login

async function main() {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const client = new Client({ name: 'mi-agente', version: '1.0.0' });
  await client.connect(transport);

  // Listar las herramientas disponibles
  const { tools } = await client.listTools();
  console.log('Tools disponibles:', tools.map(t => t.name));

  // Llamar una herramienta
  const result = await client.callTool({
    name: 'get_user_context',
    arguments: {},
  });

  console.log(result.content);

  await client.close();
}

main().catch(console.error);
```

---

## Paso 3 — Herramientas disponibles

El MCP Server expone 4 herramientas (tools):

### `get_user_context`

Retorna el perfil del usuario, todas las categorías y presupuestos activos.

```typescript
await client.callTool({ name: 'get_user_context', arguments: {} });
```

**Respuesta (texto JSON):**

```json
{
  "profile": {
    "id": "uuid",
    "display_name": "Juan",
    "default_currency": "MXN",
    "timezone": "America/Mexico_City"
  },
  "categories": [
    { "id": "uuid", "name": "Alimentación", "slug": "alimentacion" },
    ...
  ],
  "budgets": [
    { "id": "uuid", "category_id": "uuid", "month": "2024-01", "amount_limit": "5000" }
  ]
}
```

---

### `list_transactions`

Lista transacciones con filtros opcionales.

```typescript
await client.callTool({
  name: 'list_transactions',
  arguments: {
    type: 'expense',        // 'expense' | 'income' (opcional)
    from: '2024-01-01',     // fecha inicio ISO 8601 (opcional)
    to: '2024-02-01',       // fecha fin ISO 8601 (opcional)
    page: 0,                // página (opcional, default 0)
    pageSize: 20,           // por página (opcional, default 20, máx 100)
  },
});
```

---

### `create_transaction`

Registra un gasto o ingreso.

```typescript
await client.callTool({
  name: 'create_transaction',
  arguments: {
    type: 'expense',                          // requerido
    amount: 250,                              // requerido, número positivo
    currency: 'MXN',                          // opcional, default MXN
    description: 'Comida en restaurante',     // opcional
    categoryId: 'uuid-categoria',             // opcional (obtener con get_user_context)
    occurredAt: '2024-01-15T13:00:00.000Z',   // opcional, default: ahora
    rawUserText: 'gasté 250 en comida',       // opcional, para auditoría
    classificationMeta: {                     // opcional
      model: 'gpt-4o-mini',
      confidence: 0.95,
    },
  },
});
```

---

### `get_budget_status`

Obtiene el estado de presupuestos de un mes (límite vs. gasto real).

```typescript
await client.callTool({
  name: 'get_budget_status',
  arguments: {
    month: '2024-01',   // formato YYYY-MM, requerido
  },
});
```

**Respuesta (texto JSON):**

```json
[
  {
    "id": "uuid",
    "category_id": "uuid",
    "month": "2024-01",
    "amount_limit": "5000",
    "currency": "MXN",
    "spent": 3200,
    "remaining": 1800
  }
]
```

---

## Paso 4 — Flujo completo para registrar una transacción

Este es el flujo recomendado para un agente que interpreta texto libre y registra transacciones:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function createAgentClient(accessToken: string) {
  const transport = new StreamableHTTPClientTransport(
    new URL('http://localhost:3000/mcp'),
    {
      requestInit: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    },
  );
  const client = new Client({ name: 'expense-agent', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

async function registerExpense(accessToken: string, userText: string) {
  const client = await createAgentClient(accessToken);

  // 1. Obtener contexto del usuario (categorías, moneda por defecto)
  const contextResult = await client.callTool({
    name: 'get_user_context',
    arguments: {},
  });
  const context = JSON.parse((contextResult.content[0] as { text: string }).text);

  // 2. Aquí el agente interpreta `userText` con su LLM usando `context.categories`
  //    y determina: type, amount, currency, categoryId, description
  const interpreted = await myLlm.interpret(userText, context);

  // 3. Registrar la transacción
  const txResult = await client.callTool({
    name: 'create_transaction',
    arguments: {
      type: interpreted.type,
      amount: interpreted.amount,
      currency: interpreted.currency ?? context.profile.default_currency,
      description: interpreted.description,
      categoryId: interpreted.categoryId ?? undefined,
      rawUserText: userText,
      classificationMeta: {
        model: interpreted.model,
        confidence: interpreted.confidence,
      },
    },
  });

  const transaction = JSON.parse((txResult.content[0] as { text: string }).text);
  console.log('Transacción creada:', transaction.id);

  await client.close();
  return transaction;
}
```

---

## Paso 5 — Ejemplo con Python (mcp SDK)

```python
import asyncio
import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

MCP_URL = "http://localhost:3000/mcp"
ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

async def main():
    headers = {"Authorization": f"Bearer {ACCESS_TOKEN}"}
    
    async with streamablehttp_client(MCP_URL, headers=headers) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            
            # Listar tools
            tools = await session.list_tools()
            print([t.name for t in tools.tools])
            
            # Obtener contexto
            result = await session.call_tool("get_user_context", {})
            print(result.content[0].text)

asyncio.run(main())
```

### Instalación Python

```bash
pip install mcp httpx
```

---

## Variables de entorno del agente

El agente externo necesita estas variables de entorno:

| Variable | Descripción | Ejemplo |
|---|---|---|
| `EXPENSE_API_URL` | URL base de la API | `http://localhost:3000` |
| `EXPENSE_API_EMAIL` | Email del usuario agente | `agente@ejemplo.com` |
| `EXPENSE_API_PASSWORD` | Password del usuario agente | `supersecret` |

---

## Notas de seguridad

- El JWT expira en **7 días**. El agente debe obtener un nuevo token cuando recibe un 401.
- El MCP Server filtra los datos por `userId` extraído del JWT — el agente no puede acceder a datos de otros usuarios.
- No hardcodear el JWT en el código; usar variables de entorno o un vault de secretos.

---

## Referencia rápida de endpoints HTTP

| Método | URL | Descripción |
|---|---|---|
| `POST` | `/auth/login` | Obtener JWT |
| `POST` | `/mcp` | MCP Streamable HTTP (tools) |

El endpoint `GET /mcp` y `DELETE /mcp` retornan 405 — el protocolo stateless solo usa POST.
