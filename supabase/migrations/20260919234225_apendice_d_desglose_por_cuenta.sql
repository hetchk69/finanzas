-- ============================================================
-- Quanto DIY — Apéndice D: gasto por cuenta dentro del rango
--
-- Agrega el arreglo `cuentas` a lo que devuelve desglose(), para la
-- cuarta dona: de dónde salió el dinero (efectivo, débito, crédito).
--
-- Es un `create or replace` sobre la misma firma desglose(date, date),
-- así que no crea una sobrecarga ni rompe el permiso ya otorgado.
-- El tablero funciona igual sin esto: si `cuentas` no viene, esa dona
-- simplemente no se dibuja.
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
as $$
  with r as (
    select coalesce(p_desde, date_trunc('month', current_date)::date) as desde,
           coalesce(p_hasta, (date_trunc('month', current_date)
                              + interval '1 month' - interval '1 day')::date) as hasta
  ),
  g as (
    select t.category_id,
           sum(t.amount)  as total,
           count(*)::int  as movimientos
    from transactions t cross join r
    where t.kind = 'gasto'
      and t.occurred_on between r.desde and r.hasta
    group by t.category_id
  ),
  -- Solo gastos: una transferencia mueve saldo entre cuentas propias y
  -- contarla aquí inflaría el total sin que haya salido un lempira.
  a as (
    select t.account_id,
           sum(t.amount)  as total,
           count(*)::int  as movimientos
    from transactions t cross join r
    where t.kind = 'gasto'
      and t.occurred_on between r.desde and r.hasta
    group by t.account_id
  )
  select json_build_object(
    'rango', (select json_build_object(
        'desde', desde, 'hasta', hasta, 'dias', hasta - desde + 1) from r),

    'totales', (
      select json_build_object(
        'gastos',      coalesce(sum(t.amount) filter (where t.kind = 'gasto'),   0),
        'ingresos',    coalesce(sum(t.amount) filter (where t.kind = 'ingreso'), 0),
        'movimientos', count(*) filter (where t.kind in ('gasto', 'ingreso')))
      from transactions t cross join r
      where t.occurred_on between r.desde and r.hasta
    ),

    'categorias', (
      select coalesce(json_agg(x order by x.total desc, x.categoria), '[]'::json)
      from (
        select c.name                     as categoria,
               c.color,
               coalesce(g.total, 0)       as total,
               coalesce(g.movimientos, 0) as movimientos,
               b.monthly_limit            as limite
        from categories c
        left join g       on g.category_id = c.id
        left join budgets b on b.category_id = c.id and b.active = true
        where c.kind = 'gasto' and c.archived = false
      ) x
    ),

    'cuentas', (
      select coalesce(json_agg(y order by y.total desc, y.cuenta), '[]'::json)
      from (
        select ac.name                     as cuenta,
               ac.type                     as tipo,
               coalesce(a.total, 0)        as total,
               coalesce(a.movimientos, 0)  as movimientos
        from accounts ac
        left join a on a.account_id = ac.id
        where ac.archived = false
      ) y
    )
  );
$$;

revoke execute on function public.desglose(date, date) from public, anon, authenticated;
grant  execute on function public.desglose(date, date) to anon;

-- ------------------------------------------------------------
-- Verificación:
--   select desglose() -> 'cuentas';
-- ------------------------------------------------------------
