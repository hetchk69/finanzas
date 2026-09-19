-- ============================================================
-- Quanto DIY — Apéndice B
-- Complemento del script base (quanto_supabase.sql).
--
-- Cierra lo que la sección 7 "Qué falta" dejó abierto:
--   B1. Corrección de seguridad (hueco verificado, ver nota).
--   B2. Metas de ahorro.
--   B3. dashboard() — una sola llamada con todo lo que la página lee.
--   B4. Edición y borrado de movimientos por id.
--   B5. Ajustes sin abrir el SQL Editor (presupuestos, día de ciclo).
--   B6. Permisos: revocar a PUBLIC y otorgar explícitamente a anon.
--
-- Idempotente: se puede volver a correr completo sin romper nada.
-- Pegar en el SQL Editor y Run. Requiere que el base ya esté aplicado.
-- ============================================================


-- ------------------------------------------------------------
-- B1. CORRECCIÓN DE SEGURIDAD
--
-- El script base hace:
--     revoke all on all functions in schema public from anon, authenticated;
--
-- Eso NO cierra el acceso. Postgres concede EXECUTE a PUBLIC por
-- defecto en cada función nueva, y anon hereda de PUBLIC: revocarle
-- a anon su grant directo lo deja igual de habilitado por herencia.
--
-- Verificado contra el proyecto el 2026-09-19: POST /rest/v1/rpc/run_recurring
-- con la anon key devolvió 0 (ejecución exitosa), cuando debía ser 401/403.
-- Hoy el daño es nulo porque no hay reglas recurrentes activas, pero en
-- cuanto exista una (el Netflix de la sección 6), cualquiera con la llave
-- puede adelantar sus inserciones.
--
-- La línea que sí cierra es el revoke a PUBLIC, abajo en B6.
-- Esta de aquí evita que el agujero se reabra con cada función futura.
-- ------------------------------------------------------------

alter default privileges in schema public revoke execute on functions from public;


-- ------------------------------------------------------------
-- B2. METAS DE AHORRO
--
-- Modeladas como el doc anticipa: una cuenta de tipo 'ahorro' que ya
-- acumula saldo por transferencias, más un objetivo con fecha. No se
-- inventa un saldo paralelo — lo ahorrado ES el saldo de la cuenta,
-- así que una transferencia a Ahorros mueve la meta sin pasos extra.
-- ------------------------------------------------------------

create table if not exists goals (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  account_id    uuid not null references accounts(id),
  target_amount numeric(12,2) not null check (target_amount > 0),
  target_date   date,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table goals enable row level security;

create or replace view v_metas as
select
  g.id,
  g.name                                   as meta,
  a.name                                   as cuenta,
  g.target_amount                          as objetivo,
  greatest(coalesce(b.saldo, 0), 0)        as ahorrado,
  greatest(g.target_amount - greatest(coalesce(b.saldo, 0), 0), 0) as falta,
  round(100 * least(greatest(coalesce(b.saldo, 0), 0) / g.target_amount, 1), 1) as pct,
  g.target_date                            as fecha_objetivo,
  case when g.target_date is null then null
       else greatest(g.target_date - current_date, 0) end as dias_restantes,
  -- Cuánto hay que apartar por mes para llegar a tiempo. Null si no hay
  -- fecha objetivo o si ya se alcanzó: mostrar una cuota de 0 confunde.
  case
    when g.target_date is null then null
    when greatest(coalesce(b.saldo, 0), 0) >= g.target_amount then null
    else round(
      (g.target_amount - greatest(coalesce(b.saldo, 0), 0))
      / greatest(ceil((g.target_date - current_date) / 30.0), 1), 2)
  end as cuota_mensual
from goals g
join accounts a on a.id = g.account_id
left join v_balances_cuentas b on b.id = g.account_id
where g.active = true
order by g.target_date nulls last, g.name;


-- ------------------------------------------------------------
-- B3. dashboard() — una sola llamada
--
-- Mismo principio que cycle_summary(): la agregación vive en Postgres
-- y el cliente hace UNA petición. cycle_summary() se deja intacta
-- porque los atajos de Shortcuts ya dependen de su forma exacta.
-- ------------------------------------------------------------

create or replace function dashboard(p_limit int default 40)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'ciclo', json_build_object(
      'desde',      cycle_start(),
      'hasta',      cycle_end(),
      'hoy',        current_date,
      'dia_inicio', (select cycle_start_day from settings where id = 1),
      'dia_actual', (current_date - cycle_start() + 1),
      'dias_total', (cycle_end() - cycle_start() + 1)
    ),
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
               on t.occurred_on = d::date
              and t.kind in ('gasto', 'ingreso')
        group by d
      ) x
    ),
    'movimientos', (
      select coalesce(json_agg(m), '[]'::json)
      from (
        select t.id,
               t.occurred_on as fecha,
               t.amount      as monto,
               t.kind        as tipo,
               c.name        as categoria,
               c.color,
               a.name        as cuenta,
               d.name        as cuenta_destino,
               t.note        as nota,
               (t.recurring_id is not null) as recurrente
        from transactions t
        left join categories c on c.id = t.category_id
        join      accounts   a on a.id = t.account_id
        left join accounts   d on d.id = t.to_account_id
        order by t.occurred_on desc, t.created_at desc
        limit greatest(p_limit, 1)
      ) m
    )
  );
$$;

-- Los movimientos se ordenan por fecha y luego por inserción; el índice
-- del base solo cubre la primera columna.
create index if not exists idx_tx_fecha_creacion
  on transactions (occurred_on desc, created_at desc);


-- ------------------------------------------------------------
-- B4. EDITAR Y BORRAR POR ID
--
-- undo_last() solo alcanza el último movimiento. Esto cubre el resto:
-- el monto mal tecleado de hace tres días, la categoría equivocada.
--
-- Convención de parámetros: null = "no tocar ese campo".
-- Para dejar la nota en blanco se manda cadena vacía, no null.
-- ------------------------------------------------------------

create or replace function edit_transaction(
  p_id       uuid,
  p_amount   numeric default null,
  p_category text    default null,
  p_account  text    default null,
  p_note     text    default null,
  p_date     date    default null
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx  transactions%rowtype;
  v_cat uuid;
  v_acc uuid;
begin
  select * into v_tx from transactions where id = p_id;
  if v_tx.id is null then
    raise exception 'Movimiento no encontrado: %', p_id;
  end if;

  if p_amount is not null and p_amount <= 0 then
    raise exception 'El monto debe ser mayor que cero';
  end if;

  if p_category is not null then
    if v_tx.kind = 'transferencia' then
      raise exception 'Una transferencia no lleva categoría';
    end if;
    select id into v_cat from categories
     where lower(name) = lower(trim(p_category)) and archived = false;
    if v_cat is null then
      raise exception 'Categoría no encontrada: %', p_category;
    end if;
  end if;

  if p_account is not null then
    select id into v_acc from accounts
     where lower(name) = lower(trim(p_account)) and archived = false;
    if v_acc is null then
      raise exception 'Cuenta no encontrada: %', p_account;
    end if;
    if v_tx.kind = 'transferencia' and v_acc = v_tx.to_account_id then
      raise exception 'Origen y destino no pueden ser la misma cuenta';
    end if;
  end if;

  update transactions set
    amount      = coalesce(p_amount, amount),
    category_id = coalesce(v_cat, category_id),
    account_id  = coalesce(v_acc, account_id),
    occurred_on = coalesce(p_date, occurred_on),
    note        = case when p_note is null then note
                       else nullif(trim(p_note), '') end
  where id = p_id
  returning * into v_tx;

  return json_build_object(
    'ok',    true,
    'id',    v_tx.id,
    'monto', v_tx.amount,
    'tipo',  v_tx.kind,
    'fecha', v_tx.occurred_on
  );
end;
$$;

create or replace function delete_transaction(p_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v record;
begin
  delete from transactions where id = p_id returning * into v;
  if v.id is null then
    raise exception 'Movimiento no encontrado: %', p_id;
  end if;
  return json_build_object('ok', true, 'monto', v.amount, 'tipo', v.kind);
end;
$$;


-- ------------------------------------------------------------
-- B5. AJUSTES SIN SQL EDITOR
--
-- El doc obliga a volver al SQL Editor para cambiar un presupuesto o
-- el día de pago. Son las dos cosas que sí se ajustan seguido.
-- ------------------------------------------------------------

create or replace function set_budget(p_category text, p_limit numeric)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_cat uuid;
begin
  select id into v_cat from categories
   where lower(name) = lower(trim(p_category)) and kind = 'gasto' and archived = false;
  if v_cat is null then
    raise exception 'Categoría de gasto no encontrada: %', p_category;
  end if;

  -- Límite 0 o negativo = quitar el presupuesto. El CHECK del base no
  -- admite 0, así que desactivar es la única forma de "ninguno".
  if p_limit is null or p_limit <= 0 then
    update budgets set active = false where category_id = v_cat;
    return json_build_object('ok', true, 'categoria', p_category, 'limite', null);
  end if;

  insert into budgets (category_id, monthly_limit, active)
  values (v_cat, p_limit, true)
  on conflict (category_id)
  do update set monthly_limit = excluded.monthly_limit, active = true;

  return json_build_object('ok', true, 'categoria', p_category, 'limite', p_limit);
end;
$$;

create or replace function set_cycle_day(p_day int)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_day is null or p_day < 1 or p_day > 28 then
    raise exception 'El día de inicio debe estar entre 1 y 28';
  end if;
  update settings set cycle_start_day = p_day where id = 1;
  return json_build_object('ok', true, 'dia_inicio', p_day,
                           'desde', cycle_start(), 'hasta', cycle_end());
end;
$$;

create or replace function set_goal(
  p_name    text,
  p_account text,
  p_target  numeric,
  p_date    date default null
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_acc uuid;
begin
  if p_target is null or p_target <= 0 then
    raise exception 'El objetivo debe ser mayor que cero';
  end if;

  select id into v_acc from accounts
   where lower(name) = lower(trim(p_account)) and archived = false;
  if v_acc is null then
    raise exception 'Cuenta no encontrada: %', p_account;
  end if;

  insert into goals (name, account_id, target_amount, target_date, active)
  values (trim(p_name), v_acc, p_target, p_date, true)
  on conflict (name)
  do update set account_id    = excluded.account_id,
                target_amount = excluded.target_amount,
                target_date   = excluded.target_date,
                active        = true;

  return (select row_to_json(m) from v_metas m where m.meta = trim(p_name));
end;
$$;

create or replace function delete_goal(p_name text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  -- Borrado lógico: conservar la meta cumplida es parte del registro.
  update goals set active = false where lower(name) = lower(trim(p_name));
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Meta no encontrada: %', p_name;
  end if;
  return json_build_object('ok', true, 'meta', p_name);
end;
$$;


-- ------------------------------------------------------------
-- B6. PERMISOS
--
-- Orden importante: primero revocar a PUBLIC (de donde anon hereda),
-- luego otorgar una por una. Cualquier función que no aparezca en esta
-- lista queda cerrada — incluida run_recurring(), que solo debe correr
-- por pg_cron.
-- ------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

alter table goals enable row level security;
revoke all on goals    from anon, authenticated;
revoke all on v_metas  from anon, authenticated;

-- Las seis originales.
grant execute on function public.log_expense(numeric, text, text, text, date) to anon;
grant execute on function public.log_income(numeric, text, text, text, date)  to anon;
grant execute on function public.transfer(numeric, text, text, text, date)    to anon;
grant execute on function public.undo_last()                                  to anon;
grant execute on function public.get_lists()                                  to anon;
grant execute on function public.cycle_summary()                              to anon;

-- Las nuevas.
grant execute on function public.dashboard(int)                                       to anon;
grant execute on function public.edit_transaction(uuid, numeric, text, text, text, date) to anon;
grant execute on function public.delete_transaction(uuid)                             to anon;
grant execute on function public.set_budget(text, numeric)                            to anon;
grant execute on function public.set_cycle_day(int)                                   to anon;
grant execute on function public.set_goal(text, text, numeric, date)                  to anon;
grant execute on function public.delete_goal(text)                                    to anon;


-- ------------------------------------------------------------
-- Verificación. Lo importante es la última: debe FALLAR.
--
--   select dashboard();
--   select set_goal('Fondo de emergencia', 'Ahorros', 30000, '2027-06-30');
--   select set_budget('Salud', 1500);
--   select set_cycle_day(25);
--
-- Y desde la terminal, con la anon key — esta debe devolver 401/403,
-- no un número:
--   curl -X POST "$URL/rest/v1/rpc/run_recurring" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
-- ------------------------------------------------------------
