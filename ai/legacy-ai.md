# Legacy AI Package

> **Fecha de eliminación:** Abril 2026  
> **Motivo:** Las capacidades de interpretación de lenguaje natural se delegaron a un agente externo independiente que consume los endpoints REST del backend (`/api`).

---

## Qué contenía este paquete

El workspace `ai/` era un paquete TypeScript compartido (`name: "ai"`) que exportaba la función `interpret()` utilizada por el backend NestJS para clasificar mensajes de WhatsApp en lenguaje natural.

### Archivos originales

| Archivo | Descripción |
|---------|-------------|
| `src/interpret.ts` | Función principal. Llamaba a `gpt-4o-mini` (OpenAI) con `temperature: 0.1` y salida JSON validada por Zod. |
| `src/types.ts` | Interfaces `InterpretInput` y `InterpretResult`. |
| `src/index.ts` | Re-exportaba `interpret` y los tipos públicos. |
| `src/interpret.spec.ts` | Tests Vitest (6 casos) que verificaban parsing de texto en español. |
| `src/index.spec.ts` | Test de importación del módulo. |

### Contrato de la función

```typescript
interface InterpretInput {
  text: string;           // texto libre del usuario ("gasté 200 en comida")
  defaultCurrency: string; // moneda por defecto del perfil ("MXN")
  categorySlugs: string[]; // slugs de categorías disponibles
}

interface InterpretResult {
  type: 'expense' | 'income';
  amount: number;          // positivo
  currency: string;        // 3 caracteres ISO
  categorySlug: string | null;
  description: string;     // resumen corto en español
  confidence: number;      // 0.0 – 1.0
  rawModelMeta: Record<string, unknown>; // tokens, modelo, JSON raw para auditoría
}
```

### Modelo y configuración del prompt

- **Modelo:** `gpt-4o-mini`
- **Temperature:** `0.1`
- **Response format:** `json_object`
- **Reglas del prompt (resumen):**
  - `"20k"` → `20000`, `"500 pesos"` → `500`
  - Moneda explícita del usuario (USD, euros) tiene precedencia; si no, se usa `defaultCurrency`
  - Palabras como "gasté", "pagué", "compré" → `type = 'expense'`
  - Palabras como "me pagaron", "cobré", "salario" → `type = 'income'`
  - Si ninguna categoría encaja → `categorySlug = null`

### Por qué se eliminó

1. **Desacoplamiento:** La lógica de AI se mueve a un agente externo independiente que es el único consumidor del backend.
2. **Eliminación de Twilio/WhatsApp:** El canal conversacional vía WhatsApp fue retirado del proyecto. La entrada de datos ahora es exclusivamente por el dashboard web.
3. **Separación de responsabilidades:** Este repositorio se enfoca en el dashboard web (`app/`) y el backend REST (`api/`). La inteligencia artificial es responsabilidad de otro proyecto.

---

## Cómo consumir las capacidades desde el agente externo

El agente externo debe autenticarse con el API REST y puede usar los siguientes endpoints para replicar el flujo de registro de transacciones:

### 1. Autenticación

```http
POST /auth/login
Content-Type: application/json

{ "email": "...", "password": "..." }
```

Respuesta: `{ "accessToken": "eyJ..." }`

### 2. Obtener perfil del usuario (moneda por defecto, timezone)

```http
GET /profile
Authorization: Bearer <accessToken>
```

### 3. Listar categorías del sistema

```http
GET /categories
Authorization: Bearer <accessToken>
```

### 4. Registrar una transacción clasificada por la AI

```http
POST /transactions
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "type": "expense",
  "amount": 200,
  "currency": "MXN",
  "categoryId": "<uuid-de-categoria>",
  "description": "Gasto en comida",
  "sourceChannel": "api",
  "rawUserText": "gasté 200 en comida",
  "classificationMeta": { "model": "gpt-4o-mini", "confidence": 0.95 }
}
```

### 5. Registrar conversación (opcional, para auditoría)

El agente externo puede escribir en `conversation_messages` directamente con `source_channel = 'api'` y `direction = 'inbound'` / `'outbound'`. Actualmente esto no tiene endpoint dedicado en el API — el agente puede solicitar su adición si lo necesita.

---

## Variables de entorno que ya no se requieren

| Variable | Uso anterior |
|----------|-------------|
| `OPENAI_API_KEY` | Requerida por `interpret()` para llamar a la API de OpenAI |
| `TWILIO_AUTH_TOKEN` | Validación de firma del webhook de WhatsApp |
| `TWILIO_ACCOUNT_SID` | Identificación de cuenta Twilio |
| `TWILIO_WHATSAPP_FROM` | Número de sandbox de WhatsApp Twilio |
| `SUPABASE_URL` | Conexión al proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Acceso bypass-RLS al backend Supabase |
| `VITE_SUPABASE_URL` | Cliente Supabase en el frontend |
| `VITE_SUPABASE_ANON_KEY` | Cliente Supabase (anon key) en el frontend |
