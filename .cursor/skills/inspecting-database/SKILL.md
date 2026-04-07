---
name: inspecting-database
description: Inspección read-only del esquema y datos del PostgreSQL local que corre en Docker. Usar para debugging, aclarar el esquema actual o extraer información sin modificar el estado de la base; cuando el usuario pida explorar la DB local, o el esquema sin hacer cambios.
---

# Inspección de base de datos (PostgreSQL en Docker, solo lectura)

## Contexto

La base de datos es un contenedor Docker con PostgreSQL 17. El esquema está definido en `db/init.sql`.

**No usar Supabase CLI ni MCP de Supabase** — ya no existen en este proyecto.

## Política de lectura

Este skill es **solo lectura**: sirve para debugging, documentar o entender el esquema, y consultar datos de forma puntual.

**No ejecutar** sentencias que escriban en la base: `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, DDL (`CREATE`, `ALTER`, `DROP`).

## Comandos para inspeccionar

### Conectarse al contenedor

```bash
docker exec -it expense_control_db psql -U postgres -d expense_control
```

### Consultas SQL útiles (solo lectura)

```sql
-- Listar tablas en el schema public
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Columnas de una tabla
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'nombre_tabla'
ORDER BY ordinal_position;

-- Índices
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'nombre_tabla';

-- Conteo de filas
SELECT count(*) FROM public.nombre_tabla;

-- Ver categorías del sistema
SELECT id, slug, name, sort_order FROM public.categories ORDER BY sort_order;

-- Ver usuarios registrados
SELECT id, email, created_at FROM public.users ORDER BY created_at DESC LIMIT 10;
```

### Ejecutar query SQL sin entrar al contenedor

```bash
docker exec -i expense_control_db psql -U postgres -d expense_control -c "SELECT * FROM public.categories ORDER BY sort_order;"
```

### Ver logs del contenedor

```bash
docker logs expense_control_db --tail=50
```

## Relación con `modifying-database`

| Necesidad | Dónde |
|-----------|--------|
| Cambiar esquema de forma persistente | Skill **modifying-database** |
| Ver o consultar sin mutar | Este skill (**inspecting-database**) |
