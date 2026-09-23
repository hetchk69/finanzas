-- ============================================================
-- Quanto DIY — v5, parte C de C: vistas, consultas y permisos
--
-- Correr las tres EN ORDEN: A, luego B, luego C.
-- Pegar cada una completa, sin seleccionar texto, y pulsar Run.
-- Si al final no aparece el sello, el pegado se truncó.
--
-- Idempotente: se puede repetir cualquiera sin romper nada.
-- ============================================================

-- ------------------------------------------------------------
-- E7. El icono viaja aparte en las vistas y consultas
-- ------------------------------------------------------------

-- OJO con el orden de las columnas: `create or replace view` solo permite
-- AGREGAR columnas al final. Si `icono` se mete en medio, Postgres lo
-- interpreta como renombrar la columna que estaba en esa posición y falla
-- con 42P16. Por eso va de último aunque se lea peor.
create or replace view v_estado_presupuestos as
select
  c.name  as categoria,
  c.color,
  b.monthly_limit                              as limite,
  coalesce(sum(t.amount), 0)                   as gastado,
  b.monthly_limit - coalesce(sum(t.amount), 0) as disponible,
  round(100 * coalesce(sum(t.amount), 0) / b.monthly_limit, 1) as pct_usado,
  c.icon  as icono
from budgets b
join categories c on c.id = b.category_id
left join transactions t
  on t.category_id = b.category_id and t.kind = 'gasto'
 and t.occurred_on between cycle_start() and cycle_end()
where b.active = true
group by c.name, c.icon, c.color, b.monthly_limit
order by pct_usado desc;

create or replace view v_gasto_por_categoria as
select c.name as categoria, c.color,
       sum(t.amount) as total, count(*) as movimientos,
       c.icon as icono
from transactions t
join categories c on c.id = t.category_id
where t.kind = 'gasto'
  and t.occurred_on between cycle_start() and cycle_end()
group by c.name, c.icon, c.color
order by total desc;

revoke all on v_estado_presupuestos, v_gasto_por_categoria from anon, authenticated;

-- desglose(): agrega `icono` a cada categoría.
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
      ) y)
  );
$fn$;

-- dashboard(): el icono en presupuestos y en cada asiento.
create or replace function dashboard(p_limit int default 40)
returns json
language sql
stable
security definer
set search_path = public
as $fn$
  select json_build_object(
    'ciclo', json_build_object(
      'desde', cycle_start(), 'hasta', cycle_end(), 'hoy', current_date,
      'dia_inicio', (select cycle_start_day from settings where id = 1),
      'dia_actual', (current_date - cycle_start() + 1),
      'dias_total', (cycle_end() - cycle_start() + 1)),
    'resumen',      (select row_to_json(r) from v_resumen_ciclo r),
    'presupuestos', (select coalesce(json_agg(b), '[]'::json) from v_estado_presupuestos b),
    'saldos',       (select coalesce(json_agg(s), '[]'::json) from v_balances_cuentas s),
    'categorias',   (select coalesce(json_agg(g), '[]'::json) from v_gasto_por_categoria g),
    'metas',        (select coalesce(json_agg(m), '[]'::json) from v_metas m),
    'serie', (
      select coalesce(json_agg(x order by x.dia), '[]'::json)
      from (
        select d::date as dia,
               coalesce(sum(t.amount) filter (where t.kind = 'gasto'),   0) as gastos,
               coalesce(sum(t.amount) filter (where t.kind = 'ingreso'), 0) as ingresos
        from generate_series(cycle_start(), cycle_end(), interval '1 day') d
        left join transactions t
               on t.occurred_on = d::date and t.kind in ('gasto', 'ingreso')
        group by d
      ) x),
    'movimientos', (
      select coalesce(json_agg(m), '[]'::json)
      from (
        select t.id, t.occurred_on as fecha, t.amount as monto, t.kind as tipo,
               c.name as categoria, c.icon as icono, c.color,
               a.name as cuenta, d.name as cuenta_destino,
               t.note as nota, (t.recurring_id is not null) as recurrente
        from transactions t
        left join categories c on c.id = t.category_id
        join      accounts   a on a.id = t.account_id
        left join accounts   d on d.id = t.to_account_id
        order by t.occurred_on desc, t.created_at desc
        limit greatest(p_limit, 1)
      ) m)
  );
$fn$;


-- ------------------------------------------------------------
-- PERMISOS: revocar a PUBLIC y otorgar una por una.
-- norm() queda fuera a propósito: es interna.
-- ------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.log_expense(numeric, text, text, text, date) to anon;
grant execute on function public.log_income(numeric, text, text, text, date)  to anon;
grant execute on function public.transfer(numeric, text, text, text, date)    to anon;
grant execute on function public.undo_last()                                  to anon;
grant execute on function public.get_lists()                                  to anon;
grant execute on function public.cycle_summary()                              to anon;
grant execute on function public.dashboard(int)                                       to anon;
grant execute on function public.desglose(date, date)                                 to anon;
grant execute on function public.edit_transaction(uuid, numeric, text, text, text, date) to anon;
grant execute on function public.delete_transaction(uuid)                             to anon;
grant execute on function public.set_budget(text, numeric)                            to anon;
grant execute on function public.set_cycle_day(int)                                   to anon;
grant execute on function public.set_goal(text, text, numeric, date)                  to anon;
grant execute on function public.delete_goal(text)                                    to anon;


-- ------------------------------------------------------------
-- Verificación
--
--   select get_lists();                       -- categorías con emoji
--   select log_expense(50, '🍽️ Comida', 'BAC Crédito', 'prueba');
--   select log_income(100, '💻 Desarrollo', 'Banco Atlántida', 'prueba');
--   select undo_last(); select undo_last();
--
-- Y que siga cerrado lo que debe estarlo:
--   select run_recurring();   -- debe dar permission denied desde anon
-- ------------------------------------------------------------

select 'v5 parte C aplicada' as sello;
