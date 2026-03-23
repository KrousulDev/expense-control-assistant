-- Base categories used by automatic classification.
-- Webhook writers should use service role credentials or a SECURITY DEFINER RPC.

insert into public.categories (name, slug, is_system, user_id, sort_order)
values
  ('Comida', 'comida', true, null, 10),
  ('Transporte', 'transporte', true, null, 20),
  ('Vivienda', 'vivienda', true, null, 30),
  ('Salud', 'salud', true, null, 40),
  ('Entretenimiento', 'entretenimiento', true, null, 50),
  ('Educacion', 'educacion', true, null, 60),
  ('Servicios', 'servicios', true, null, 70),
  ('Compras', 'compras', true, null, 80),
  ('Deuda', 'deuda', true, null, 90),
  ('Salario', 'salario', true, null, 100),
  ('Otros_ingresos', 'otros_ingresos', true, null, 110),
  ('Otros_gastos', 'otros_gastos', true, null, 120)
on conflict (slug) where user_id is null
do update
set
  name = excluded.name,
  is_system = true,
  sort_order = excluded.sort_order;
