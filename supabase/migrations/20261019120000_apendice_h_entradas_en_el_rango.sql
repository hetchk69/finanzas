-- ============================================================
-- Quanto DIY — Apéndice H: de dónde entró el dinero
--
-- `desglose()` contaba el ingreso del rango en `totales.ingresos`,
-- pero no decía de dónde venía: el arreglo `categorias` filtra por
-- kind = 'gasto' y `cuentas` también. La vista de Gráficos quedaba
-- siendo cuatro donas de gasto y nada más.
--
-- Agrega un solo arreglo, `entradas`, con el ingreso por categoría
-- dentro del rango. Es un `create or replace` sobre la misma firma
-- desglose(date, date), así que no crea una sobrecarga ni rompe el
-- permiso ya otorgado, y lo demás que devuelve queda idéntico.
--
-- El tablero funciona igual sin esto: si `entradas` no viene, esa
-- dona simplemente no se dibuja.
--
-- Idempotente. Pegar en el SQL Editor y Run.
-- ============================================================

create or replace function desglose(
  p_desde date default null,
  p_hasta date default null
) returns json
language sql
stable
security definer
set search_path = public
as $fn$
  with r as (
    select coalesce(p_desde, date_trunc('month', current_date)::date) as desde,
           coalesce(p_hasta, (date_trunc('month', current_date)
                              + interval '1 month' - interval '1 day')::date) as hasta
  ),
  g as (
    select t.category_id, sum(t.amount) as total, count(*)::int as movimientos
    from transactions t cross join r
    where t.kind = 'gasto' and t.occurred_on between r.desde and r.hasta
    group by t.category_id
  ),
  a as (
    select t.account_id, sum(t.amount) as total, count(*)::int as movimientos
    from transactions t cross join r
    where t.kind = 'gasto' and t.occurred_on between r.desde and r.hasta
    group by t.account_id
  ),
  -- Entradas por categoría. Solo 'ingreso': una transferencia no es
  -- dinero que entra, es dinero que cambia de bolsillo.
  i as (
    select t.category_id, sum(t.amount) as total, count(*)::int as movimientos
    from transactions t cross join r
    where t.kind = 'ingreso' and t.occurred_on between r.desde and r.hasta
    group by t.category_id
  )
  select json_build_object(
    'rango', (select json_build_object('desde', desde, 'hasta', hasta,
                                       'dias', hasta - desde + 1) from r),
    'totales', (
      select json_build_object(
        'gastos',      coalesce(sum(t.amount) filter (where t.kind = 'gasto'),   0),
        'ingresos',    coalesce(sum(t.amount) filter (where t.kind = 'ingreso'), 0),
        'movimientos', count(*) filter (where t.kind in ('gasto', 'ingreso')))
      from transactions t cross join r
      where t.occurred_on between r.desde and r.hasta),
    'categorias', (
      select coalesce(json_agg(x order by x.total desc, x.categoria), '[]'::json)
      from (
        select c.name as categoria, c.icon as icono, c.color,
               coalesce(g.total, 0) as total,
               coalesce(g.movimientos, 0) as movimientos,
               b.monthly_limit as limite
        from categories c
        left join g on g.category_id = c.id
        left join budgets b on b.category_id = c.id and b.active = true
        where c.kind = 'gasto' and c.archived = false
      ) x),
    'cuentas', (
      select coalesce(json_agg(y order by y.total desc, y.cuenta), '[]'::json)
      from (
        select ac.name as cuenta, ac.type as tipo,
               coalesce(a.total, 0) as total,
               coalesce(a.movimientos, 0) as movimientos
        from accounts ac
        left join a on a.account_id = ac.id
        where ac.archived = false
      ) y),

    -- Solo las que tuvieron movimiento, al revés que en gasto: ahí se
    -- listan todas porque a cualquiera se le puede poner un límite
    -- desde la pantalla. Un ingreso no tiene límite que ajustar, así
    -- que una categoría en cero sería una fila muerta.
    --
    -- El left join deja pasar un ingreso con categoría nula. Hoy no
    -- debería existir —log_income rechaza la categoría que no resuelve—
    -- pero si alguna vez entra uno por SQL, se ve en vez de perderse.
    'entradas', (
      select coalesce(json_agg(z order by z.total desc, z.categoria), '[]'::json)
      from (
        select coalesce(c.name, 'Sin categoría') as categoria,
               c.icon  as icono,
               c.color as color,
               i.total,
               i.movimientos
        from i
        left join categories c on c.id = i.category_id
      ) z)
  );
$fn$;

-- ------------------------------------------------------------
-- Permisos: la firma no cambió, pero se repite el par por si este
-- archivo se corre después de volver a aplicar el apéndice B, que
-- revoca en bloque y no conoce a desglose().
-- ------------------------------------------------------------
revoke execute on function public.desglose(date, date) from public, anon, authenticated;
grant  execute on function public.desglose(date, date) to anon;

-- ------------------------------------------------------------
-- Verificación:
--   select desglose() -> 'entradas';
--   select desglose('2026-01-01', '2026-12-31') -> 'totales';
-- ------------------------------------------------------------
