-- ============================================================
-- Quanto DIY — Apéndice C: desglose por categoría en un rango
--
-- `dashboard()` está clavado a cycle_start()/cycle_end(). Esto agrega
-- una función que acepta cualquier rango de fechas y devuelve el total
-- y el desglose por categoría, con el límite de cada una para poder
-- ajustarlo desde ahí mismo.
--
-- No toca nada de lo existente: `dashboard()` y `cycle_summary()` quedan
-- igual, así que los atajos del teléfono no se enteran.
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
    -- Por defecto, el mes calendario. Deliberadamente NO el ciclo de pago:
    -- el ciclo manda en el resto del tablero, pero este desglose se pidió
    -- como "del primero de mes al final". Si algún día el día de pago deja
    -- de ser 1, ambos rangos dejan de coincidir y hay que elegir a mano.
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

    -- Todas las categorías de gasto, no solo las que tuvieron movimiento:
    -- la pantalla las usa para poder ponerle límite a cualquiera.
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
    )
  );
$$;

-- El índice por categoría del script base cubre (category_id, occurred_on),
-- pero este recorre por fecha primero. idx_tx_fecha ya existe y basta para
-- el volumen de un tracker personal.

-- ------------------------------------------------------------
-- Permisos: revocar a PUBLIC (de donde anon hereda) y otorgar.
-- ------------------------------------------------------------
revoke execute on function public.desglose(date, date) from public, anon, authenticated;
grant  execute on function public.desglose(date, date) to anon;

-- ------------------------------------------------------------
-- Verificación:
--   select desglose();                              -- mes actual
--   select desglose('2026-09-01', '2026-09-15');    -- primera quincena
--   select desglose('2026-01-01', '2026-12-31');    -- el año
--
-- Y que run_recurring siga cerrada (no debe haberse reabierto):
--   curl -X POST "$URL/rest/v1/rpc/run_recurring" -H "apikey: $ANON" ...
-- ------------------------------------------------------------
