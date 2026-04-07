---
name: modifying-database
description: Guía para cambiar el esquema PostgreSQL local que corre en Docker (editar db/init.sql, reiniciar contenedor). Usar al añadir tablas, columnas, índices, seeds, o cuando el usuario mencione cambios de esquema, migraciones o db/init.sql.
---

# Cambios en la base de datos (PostgreSQL en Docker)

## Contexto

La base de datos es un contenedor Docker con PostgreSQL 17. El esquema completo (tablas, tipos, índices, seed de categorías) está en un único archivo:

```
db/init.sql
```

Este archivo se aplica automáticamente cuando Docker inicia el contenedor **por primera vez** (montado en `docker-entrypoint-initdb.d/`). Para aplicar cambios después de la creación inicial, hay que reiniciar el contenedor con volumen limpio.

**No existe Supabase CLI en este proyecto.** No usar `supabase migration new`, `supabase migration up`, ni `supabase db reset`.

## Flujo para cambiar el esquema

### 1. Editar `db/init.sql`

Agregar o modificar las sentencias SQL necesarias:

- Nuevas tablas: `CREATE TABLE IF NOT EXISTS public.nueva_tabla (...);`
- Nuevas columnas: `ALTER TABLE public.tabla ADD COLUMN IF NOT EXISTS col tipo;`
- Índices: `CREATE INDEX IF NOT EXISTS idx_name ON public.tabla (col);`
- Datos seed: `INSERT INTO public.tabla (...) VALUES (...) ON CONFLICT DO ...;`

### 2. Reiniciar el contenedor con volumen limpio

```bash
npm run db:reset
# equivalente a: docker compose down -v && docker compose up -d
```

**Advertencia:** esto borra todos los datos. Útil en desarrollo local donde no hay datos de producción.

### 3. Verificar que el esquema se aplicó

```bash
docker exec -it expense_control_db psql -U postgres -d expense_control -c "\dt public.*"
```

## Comandos de referencia

| Objetivo | Comando |
|----------|---------|
| Iniciar contenedor | `npm run db:start` o `docker compose up -d` |
| Detener contenedor | `npm run db:stop` o `docker compose down` |
| Reset completo (borra datos) | `npm run db:reset` o `docker compose down -v && docker compose up -d` |
| Ver logs | `docker logs expense_control_db --tail=50` |
| Acceder a psql | `docker exec -it expense_control_db psql -U postgres -d expense_control` |

## Variables de conexión

```
POSTGRES_DB: expense_control
POSTGRES_USER: postgres
POSTGRES_PASSWORD: postgres
POSTGRES_HOST: localhost
POSTGRES_PORT: 5432

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/expense_control
```

## Actualizar tipos TypeScript en el frontend

Cuando se agregue o modifique una tabla, actualizar manualmente los tipos en:

```
app/src/types/index.ts
```

No existe `supabase:gen` — los tipos se mantienen manualmente alineados con `db/init.sql`.

## Buenas prácticas

- Usar `IF NOT EXISTS` en todas las sentencias para que `init.sql` sea idempotente.
- El archivo `db/init.sql` es la única fuente de verdad del esquema.
- Si se agregan nuevas entidades, también actualizar los servicios del API en `api/src/` y los tipos del frontend en `app/src/types/`.
