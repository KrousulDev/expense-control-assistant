# Feature Brief: Esquema de base de datos para asistente de control de gastos

## Objetivo

Implementar el esquema base de PostgreSQL (Supabase) para soportar:

- Registro de gastos e ingresos via WhatsApp.
- Clasificacion automatica de movimientos.
- Dashboard financiero basico.
- Presupuestos mensuales simples.
- Respuestas automaticas auditables.

## Alcance implementado

Se implemento una migracion inicial con:

- Extensiones y enums de dominio:
  - `transaction_type` (`expense`, `income`)
  - `source_channel` (`whatsapp`, `web`, `api`)
  - `message_direction` (`inbound`, `outbound`)
- Tablas principales:
  - `profiles`
  - `categories`
  - `transactions`
  - `budgets`
  - `conversation_messages`
- Constraints e indices para:
  - Integridad de datos (currency, month, formatos, checks).
  - Idempotencia por `external_message_id` en transacciones y mensajes.
  - Consultas de dashboard (`user_id`, `occurred_at`, `category_id`).
- RLS por usuario (`auth.uid()`) en todas las tablas de dominio.
- Trigger `on auth.users insert` para crear `profiles` automaticamente.
- Grants para rol `authenticated`.

## Archivos creados/modificados

- `db/supabase/migrations/20260323154656_test_skill_path.sql`
  - DDL completo del esquema, politicas RLS y trigger de perfil.
- `db/supabase/seed.sql`
  - Categorias del sistema para clasificacion inicial.
- `db/generated/database.types.ts`
  - Tipos TypeScript alineados con el esquema implementado.
- `.cursor/skills/modifying-database/SKILL.md`
  - Flujo actualizado para usar `supabase migration new ... --yes` en modo no interactivo.
- `.cursor/skills/inspecting-database/SKILL.md`
  - Referencia ajustada al flujo de migraciones no interactivas.

## Comandos ejecutados

- `supabase migration up --workdir db` (exitoso)
- `npm run supabase:gen` (sin completar por estado/permisos del entorno Docker en esta sesion)
- Intentos de arranque/verificacion de stack local de Supabase para generacion de tipos.

## Estado final

- La migracion quedo aplicada en la base local.
- El `seed.sql` quedo listo para cargas de categorias base.
- Los tipos TypeScript quedaron presentes en `db/generated/database.types.ts`.
- El flujo de creacion de migraciones quedo documentado en no interactivo (`--yes`) para evitar bloqueos en agentes.

## Nota operativa

Si en otra sesion `npm run supabase:gen` vuelve a fallar por conflictos de proyecto/puertos, validar que solo haya un stack local activo para el `project_id` objetivo antes de regenerar tipos.
