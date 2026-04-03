# MVP — Control de Gastos con Entrada Conversacional

> **Versión:** 1.0.0-mvp  
> **Fecha:** Abril 2026  
> **Stack:** ReactJS · NestJS · Supabase (PostgreSQL) · OpenAI · Twilio WhatsApp

---

## Resumen ejecutivo

Sistema de control financiero personal que permite registrar gastos e ingresos mediante lenguaje natural por WhatsApp y visualizar el estado financiero en un dashboard web. La AI clasifica automáticamente cada movimiento y genera respuestas conversacionales inmediatas.

---

## Features principales

### F-01 · Autenticación de usuarios

**Descripción**  
Registro e inicio de sesión seguro mediante email y contraseña a través de Supabase Auth. El sistema crea automáticamente un perfil de usuario en la tabla `public.profiles` vía trigger de base de datos en el momento del registro.

**Especificaciones**

- Registro con email y contraseña (mínimo 6 caracteres)
- Login con sesión persistida en `localStorage` via JWT de Supabase
- Rutas protegidas — redirigen a `/login` si no hay sesión activa
- Cierre de sesión desde cualquier pantalla del dashboard
- Creación automática de perfil (`profiles`) al registrarse:
  - `default_currency`: `MXN` por defecto
  - `timezone`: `America/Mexico_City` por defecto
  - `whatsapp_phone_e164`: `null` hasta que el usuario lo configure

**Flujo de datos**

```
Usuario → LoginPage → supabase.auth.signUp/signIn
       → AuthContext actualiza sesión global
       → ProtectedRoute libera acceso al dashboard
       → Trigger DB crea fila en public.profiles
```

**Componentes involucrados**
- `app/src/pages/LoginPage.tsx`
- `app/src/contexts/AuthContext.tsx`
- `app/src/hooks/useAuth.ts`
- `app/src/components/ProtectedRoute.tsx`
- `db/supabase/migrations/` — trigger `on_auth_user_created`

---

### F-02 · Dashboard financiero mensual

**Descripción**  
Vista principal del estado financiero del usuario para el mes en curso. Muestra tres KPIs (gastos, ingresos, balance) y una tabla de movimientos recientes con fecha, descripción, categoría y monto.

**Especificaciones**

- **KPIs del mes actual:**
  - Total de gastos (`type = 'expense'`)
  - Total de ingresos (`type = 'income'`)
  - Balance neto = ingresos − gastos
- Consulta filtra por `user_id = auth.uid()` y rango del mes en curso (`occurred_at`)
- **Movimientos recientes:** últimas 5 transacciones ordenadas por `occurred_at DESC`
- Los montos se muestran con símbolo de la moneda del movimiento (`currency`)
- Gastos se muestran en rojo con prefijo `−`, ingresos en verde con prefijo `+`

**Consulta Supabase (ejemplo)**

```typescript
supabase
  .from('transactions')
  .select('*')
  .eq('user_id', user.id)
  .gte('occurred_at', firstDayOfMonth)
  .lte('occurred_at', lastDayOfMonth)
```

**Componentes involucrados**
- `app/src/pages/DashboardPage.tsx`
- `app/src/lib/supabase.ts`

---

### F-03 · Registro y consulta de movimientos

**Descripción**  
Listado paginado de todas las transacciones del usuario con capacidad de filtrar por tipo (todos / gastos / ingresos). Cada movimiento muestra su fecha, descripción, categoría asignada y monto.

**Especificaciones**

- Filtro de tipo mediante selector (`<select>`) con opciones: `Todos`, `Gastos`, `Ingresos`
- Orden descendente por `occurred_at`
- Cada fila de la tabla expone:
  - Fecha formateada en español (`es-MX`)
  - Descripción generada por la AI o ingresada manualmente
  - Nombre de categoría (si tiene una asignada)
  - Monto con moneda
- Las transacciones registradas vía WhatsApp tienen `source_channel = 'whatsapp'`
- Las transacciones tienen `external_message_id` único para garantizar idempotencia (no se duplican si Twilio reintenta el webhook)

**Componentes involucrados**
- `app/src/pages/TransactionsPage.tsx`

---

### F-04 · Presupuestos mensuales

**Descripción**  
Gestión de presupuestos por mes con seguimiento de progreso. Un presupuesto puede ser global (aplica a todos los gastos del mes) o específico por categoría. Se visualiza el porcentaje utilizado versus el límite establecido.

**Especificaciones**

- Selector de mes/año para consultar presupuestos históricos
- Creación de presupuesto con:
  - Categoría: `Global (todas)` o cualquiera de las 12 categorías del sistema
  - Monto límite (numérico, obligatorio)
  - Moneda (texto de 3 caracteres, obligatorio, ej. `MXN`)
- Si ya existe un presupuesto global o para esa categoría en el mismo mes/año, se actualiza (upsert)
- Progreso calculado como: gastos en el período / límite × 100
- Barra de progreso: verde < 80%, amarillo 80–99%, rojo ≥ 100%
- Eliminación de presupuesto con confirmación

**Estructura en base de datos**

```sql
budgets (
  id, user_id, category_id (nullable),
  month INT, year INT,
  amount NUMERIC, currency CHAR(3)
)
-- Constraint: unique (user_id, category_id, month, year)
```

**Componentes involucrados**
- `app/src/pages/BudgetsPage.tsx`

---

### F-05 · Configuración de perfil y vinculación de WhatsApp

**Descripción**  
Página de ajustes donde el usuario personaliza su perfil y vincula su número de WhatsApp en formato E.164. Este número es la clave de búsqueda que el webhook usa para identificar al usuario cuando llega un mensaje.

**Especificaciones**

- Campos editables:
  - `display_name`: nombre visible (opcional)
  - `whatsapp_phone_e164`: número de teléfono en formato E.164 (ej. `+5215512345678`)
  - `default_currency`: moneda de 3 caracteres (ej. `MXN`, `USD`, `COP`)
  - `timezone`: zona horaria IANA (ej. `America/Mexico_City`)
- Validación del teléfono con regex `/^\+[1-9]\d{7,14}$/` antes de enviar
- El número de WhatsApp debe ser **único en el sistema** — constraint `UNIQUE` en `whatsapp_phone_e164`
- Si el número ya existe en otra cuenta se muestra: `"Ese número de WhatsApp ya está registrado en otra cuenta."`
- Mensaje de éxito/error con `role="alert"` para accesibilidad
- Los cambios aplican mediante UPDATE con RLS (`id = auth.uid()`)

**Componentes involucrados**
- `app/src/pages/SettingsPage.tsx`
- `db` — constraint `profiles_whatsapp_phone_e164_key`

---

### F-06 · Interpretación AI de lenguaje natural

**Descripción**  
Capa de inteligencia artificial que procesa el texto libre del usuario (enviado por WhatsApp) y extrae la información estructurada de la transacción: tipo, monto, moneda, categoría y descripción. Usa `gpt-4o-mini` de OpenAI con salida en JSON estructurado y validación estricta mediante Zod.

**Especificaciones**

- **Modelo:** `gpt-4o-mini` con `temperature: 0.1` y `response_format: json_object`
- **Inputs del prompt:**
  - Texto libre del usuario
  - Slugs de categorías disponibles del sistema
  - Moneda por defecto del perfil del usuario
- **Output validado con Zod:**

```typescript
{
  type: 'expense' | 'income'
  amount: number          // positivo
  currency: string        // 3 caracteres ISO
  category_slug: string | null
  description: string     // resumen corto
  confidence: number      // 0.0 – 1.0
}
```

- **Reglas de interpretación (en el prompt):**
  - `"20k"` → `20000`; `"500 pesos"` → `500`
  - Si el usuario menciona moneda explícita (USD, euros) se usa esa; si no, la moneda por defecto
  - Si ninguna categoría encaja, `category_slug = null`
  - Gastos: palabras como "gasté", "pagué", "compré" → `type = 'expense'`
  - Ingresos: palabras como "me pagaron", "cobré", "salario" → `type = 'income'`
- `rawModelMeta` guarda el modelo, tokens usados y el JSON raw para auditoría en `classification_meta`

**Ubicación del código**
- `ai/src/interpret.ts` — función `interpret()`
- `ai/src/types.ts` — interfaces `InterpretInput` / `InterpretResult`

---

### F-07 · Webhook WhatsApp (Twilio) + registro automático

**Descripción**  
Endpoint NestJS que recibe mensajes entrantes de Twilio, identifica al usuario por su número de WhatsApp, llama a la capa AI, persiste la transacción y responde automáticamente con un resumen en lenguaje natural. Toda la conversación queda auditada en `conversation_messages`.

**Especificaciones**

- **Endpoint:** `POST /webhooks/twilio/whatsapp`
- **Seguridad:** Guard `TwilioSignatureGuard` valida la firma HMAC-SHA1 de Twilio usando `TWILIO_AUTH_TOKEN`
- **Respuesta:** TwiML `<Response><Message>...</Message></Response>`
- **Flujo completo:**

```
Twilio → POST /webhooks/twilio/whatsapp
       → TwilioSignatureGuard (valida firma)
       → Extraer phone de From: "whatsapp:+521..." → "+521..."
       → Buscar perfil por whatsapp_phone_e164 (service role)
       → Si no existe: responder "No encontré tu cuenta..."
       → Insertar conversation_messages (inbound)
       → Cargar categorías del sistema
       → interpret({ text, defaultCurrency, categorySlugs })
       → Insertar transaction (idempotente por external_message_id)
       → Generar reply: "Gasto registrado: $150 MXN (Comida) — Gasto en comida"
       → Insertar conversation_messages (outbound)
       → Retornar TwiML con reply
```

- **Idempotencia:** `UNIQUE(external_message_id)` en `transactions` y `conversation_messages` evita duplicados si Twilio reintenta el webhook
- **Error de interpretación:** si la AI falla, se responde con mensaje de ayuda y se persiste el intento fallido
- **Supabase service role:** el backend usa `SUPABASE_SERVICE_ROLE_KEY` (bypassa RLS) para poder leer el perfil de cualquier usuario por teléfono

**Componentes involucrados**
- `api/src/webhooks/webhooks.controller.ts`
- `api/src/webhooks/webhooks.service.ts`
- `api/src/webhooks/twilio-signature.guard.ts`
- `api/src/supabase/supabase.service.ts`

---

## Esquema de base de datos

### Tablas

| Tabla | Propósito |
|---|---|
| `profiles` | Perfil del usuario: nombre, teléfono WhatsApp, moneda, timezone |
| `categories` | Catálogo de categorías (12 del sistema + personalizadas por usuario) |
| `transactions` | Gastos e ingresos con origen, categoría y metadatos AI |
| `budgets` | Presupuestos mensuales globales o por categoría |
| `conversation_messages` | Historial auditable de mensajes inbound/outbound de WhatsApp |

### Enums

| Enum | Valores |
|---|---|
| `transaction_type` | `expense`, `income` |
| `source_channel` | `whatsapp`, `web`, `api` |
| `message_direction` | `inbound`, `outbound` |

### Categorías del sistema (seed)

| Slug | Nombre | Orden |
|---|---|---|
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

### Seguridad (RLS)

Todas las tablas de dominio tienen Row Level Security habilitado. Las políticas aplican `id = auth.uid()` (o `user_id = auth.uid()`) para que cada usuario solo acceda a sus propios datos. El backend API usa el rol `service_role` para operaciones que requieren acceso cross-user (lookup por teléfono).

---

## Pruebas ejecutadas

### Pruebas unitarias — AI (`/ai`)

Framework: **Vitest**  
Archivo: `ai/src/interpret.spec.ts`

| # | Caso de prueba | Input | Resultado esperado | Estado |
|---|---|---|---|---|
| 1 | Interpreta gasto con abreviatura numérica | `"gasté 20k en comida"` | `type=expense, amount=20000, currency=MXN, categorySlug=comida, confidence>0.5` | PASS |
| 2 | Interpreta ingreso con moneda explícita | `"me pagaron 500 usd"` | `type=income, amount=500, currency=USD, categorySlug=salario` | PASS |
| 3 | Devuelve `categorySlug=null` cuando no hay categoría que encaje | `"pagué 150 pesos de algo raro"` | `categorySlug=null` | PASS |
| 4 | Usa moneda por defecto si no se especifica | `"uber 300"` | `currency=MXN` (moneda del perfil) | PASS |
| 5 | Lanza error con respuesta vacía de OpenAI | OpenAI retorna `content=null` | `throw Error('Empty response from OpenAI')` | PASS |
| 6 | Prompt incluye categorías y moneda del usuario | Input con `categorySlugs`, `defaultCurrency` | Prompt contiene los slugs y la moneda | PASS |

### Pruebas unitarias — Webhook (`/api`)

Framework: **Jest**  
Archivo: `api/src/webhooks/webhooks.service.spec.ts`

| # | Caso de prueba | Escenario | Resultado esperado | Estado |
|---|---|---|---|---|
| 1 | Perfil no encontrado | `whatsapp_phone_e164` sin coincidencia en DB | Respuesta contiene `"Vinculá tu número"` | PASS |
| 2 | Transacción exitosa | Perfil existe, AI retorna clasificación válida | Respuesta contiene `"Gasto registrado"`, monto `200`, categoría `Comida` | PASS |
| 3 | Fallo de interpretación AI | `interpret()` lanza error | Respuesta contiene `"No pude interpretar"`, sin romper el flujo | PASS |

### Pruebas de integración E2E — Browser (`agent-browser`)

Herramienta: **agent-browser** (Vercel Labs)  
URL: `http://localhost:5173`

| # | Flujo | Acción | Resultado esperado | Estado |
|---|---|---|---|---|
| 1 | Registro de usuario nuevo | Formulario con email + contraseña → "Crear cuenta" | Redirige al dashboard, perfil creado en DB | PASS |
| 2 | Dashboard vacío (nuevo usuario) | Acceder a `/` | Muestra KPIs en $0.00, tabla de movimientos vacía | PASS |
| 3 | Navegación a Movimientos | Click en link "Movimientos" | Ruta `/transactions`, filtro de tipo visible | PASS |
| 4 | Crear presupuesto global | `/budgets` → "Nuevo" → `50000 MXN` → "Guardar" | Presupuesto aparece en lista con barra de progreso | PASS |
| 5 | Guardar ajustes de perfil (teléfono único) | Ingresar `+19005550123` → "Guardar cambios" | `alert "Perfil actualizado."`, DB actualizada | PASS |
| 6 | Error por teléfono duplicado | Ingresar teléfono ya registrado → "Guardar cambios" | `alert "Ese número de WhatsApp ya está registrado en otra cuenta."` (HTTP 409 → código 23505) | PASS |
| 7 | Webhook WhatsApp — gasto en comida | `curl POST /webhooks/twilio/whatsapp` con `Body="Gaste 150 en comida"` y `From=whatsapp:+19005550123` | TwiML: `"Gasto registrado: $150 MXN (Comida) — Gasto en comida"` | PASS |
| 8 | Dashboard refleja movimiento de WhatsApp | Acceder al dashboard después del webhook | KPI Gastos = $150.00, movimiento "Gasto en comida" en tabla | PASS |

---

## Variables de entorno requeridas

| Variable | Scope | Descripción |
|---|---|---|
| `VITE_SUPABASE_URL` | Frontend | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Frontend | Clave pública (anon) de Supabase |
| `SUPABASE_URL` | API | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | API | Clave service role (bypassa RLS) |
| `OPENAI_API_KEY` | API | Clave de OpenAI para `gpt-4o-mini` |
| `TWILIO_ACCOUNT_SID` | API | SID de cuenta Twilio |
| `TWILIO_AUTH_TOKEN` | API | Token para validar firmas del webhook |
| `TWILIO_WHATSAPP_FROM` | API | Número Twilio Sandbox (ej. `+14155238886`) |

Ver `.env.example` en la raíz para el template completo.

---

## Limitaciones conocidas del MVP

| # | Limitación | Impacto | Posible mejora |
|---|---|---|---|
| L-01 | Sin soporte para edición/eliminación de transacciones desde la web | Medio | Añadir acciones en la tabla de movimientos |
| L-02 | Categorías personalizadas por usuario no implementadas en UI | Bajo | Pantalla de gestión de categorías |
| L-03 | El webhook no valida firma Twilio en ambiente local sin ngrok+HTTPS | Bajo | El guard se puede desactivar por env en desarrollo |
| L-04 | Sin paginación en la tabla de movimientos del dashboard (solo 5 recientes) | Bajo | Añadir paginación o scroll infinito |
| L-05 | Los mensajes de WhatsApp con múltiples transacciones en un solo texto no se desglosan | Medio | Detección de múltiples entidades en un mensaje |
| L-06 | Sin soporte de adjuntos (imágenes de tickets/recibos) | Bajo | Integración con Vision API de OpenAI |
