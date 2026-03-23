---
name: modifying-database
description: Guía para cambiar el esquema PostgreSQL local con Supabase CLI en este repo (migraciones SQL, aplicar cambios, reset). Usar al añadir tablas, columnas, índices, RLS, seeds, o cuando el usuario mencione migraciones, Supabase local o `db/supabase`.
---

# Cambios en la base de datos (este proyecto)

## Contexto del repo

El directorio de proyecto Supabase **no es la raíz del monorepo**: está en `db/` (ahí vive `supabase/config.toml`). El script `npm run supabase:gen` ya usa `--workdir db`.

**Desde la raíz del repositorio**, pasa siempre `--workdir db` a la CLI de Supabase. Alternativa: `cd db` y ejecutar los mismos comandos sin `--workdir`.

## Flujo habitual

1. **Crear el archivo de migración** (nombre descriptivo en snake_case):

   ```bash
   supabase migration new nombre_migracion --workdir db
   ```

   Se genera un `.sql` nuevo bajo `db/supabase/migrations/` con prefijo de timestamp.

2. **Editar ese archivo** y escribir el SQL del cambio (DDL, políticas RLS, funciones, etc.). Una migración = un cambio de esquema coherente y reversible cuando tenga sentido (`down` manual o migración nueva si hace falta revertir).

3. **Aplicar migraciones pendientes en la base local**:

   ```bash
   supabase migration up --workdir db
   ```

   Requiere stack local en marcha según tu entorno (p. ej. `supabase start` si aplica).

4. **Tipos TypeScript** (si el esquema afecta al cliente/API):

   ```bash
   npm run supabase:gen
   ```

   Regenera `db/generated/database.types.ts`.

## Si el historial de migraciones está corrupto

En local, **reinicia la base** al estado definido por las migraciones del repo:

```bash
supabase db reset --workdir db
```

**Advertencia:** borra datos locales no respaldados; vuelve a aplicar migraciones y seeds configurados en `db/supabase/config.toml` (p. ej. `seed.sql`).

## Comandos relacionados (referencia breve)

| Objetivo | Comando (desde raíz con `--workdir db`) |
|----------|----------------------------------------|
| Nueva migración vacía | `supabase migration new nombre_migracion` |
| Aplicar pendientes (local) | `supabase migration up` |
| Reset local + migraciones + seed | `supabase db reset` |
| Subir migraciones al proyecto remoto (cuando toque) | `supabase db push` (requiere login/proyecto enlazado) |

## Buenas prácticas

- Nombres de migración claros (`add_expenses_table`, no `update`).
- No editar migraciones ya aplicadas en entornos compartidos; añadir una nueva migración para corregir.
- Tras cambios de esquema usados en código, ejecutar `npm run supabase:gen` y ajustar tipos/importaciones.
