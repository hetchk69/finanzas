-- ============================================================
-- Quanto DIY — Apéndice F: cuentas reales, categorías de ingreso
-- y emojis
--
-- Reemplaza al apéndice E (nunca aplicado, ver su archivo). Este es
-- el diseño que sí se decidió y sí está en producción:
--
--   F1. norm(): comparación tolerante a emoji, tildes y mayúsculas.
--   F2. Cuentas que existen de verdad (Banco Atlántida, BAC x2, Efectivo).
--   F3. Categorías de ingreso (Salario, Instalación, Desarrollo, Otros)
--       + el mismo nombre en gasto e ingreso.
--   F4. Emojis en la columna `icon`, que estaba sin usar.
--   F5. get_lists() devuelve "🍽️ Comida" para que el atajo los muestre.
--   F6. Las funciones de captura usan norm() y filtran por tipo.
--   F7. Las vistas y consultas devuelven el icono aparte.
--
-- Se aplicó en tres pegados separados en el SQL Editor porque 20 KB de
-- una sola vez se truncaban ahí; como archivo de migración para
-- `db push` no hace falta partirlo, así que va completo.
--
-- Idempotente en su totalidad.
-- ============================================================

create extension if not exists unaccent;


-- ------------------------------------------------------------
-- E1. Normalización
--
-- El atajo manda lo que el usuario ve: "🍽️ Comida". La base guarda
-- "Comida". Sin esto, la captura falla con "Categoría no encontrada"
-- y el mensaje ni siquiera deja claro por qué.
--
-- Quita todo lo que no sea letra o número al inicio (emoji y su
-- espacio), las tildes y las mayúsculas. STABLE y no IMMUTABLE porque
-- unaccent depende de un diccionario; no se usa en ningún índice.
-- ------------------------------------------------------------

create or replace function norm(txt text)
returns text
language sql
stable
set search_path = public, extensions
as $fn$
  select lower(regexp_replace(unaccent(trim(coalesce(txt, ''))), '^[^[:alnum:]]+', ''));
$fn$;


-- ------------------------------------------------------------
-- E2. CUENTAS
--
-- Atlántida tiene solo débito; BAC tiene débito y crédito. Por eso
-- "débito" a secas es ambiguo y las cuentas se nombran por banco e
-- instrumento juntos. Una sola lista sirve a entradas y salidas: si
-- fueran dos listas distintas, el dinero entraría a un banco y saldría
-- de otro lado, y los saldos no significarían nada.
--
-- Las dos cuentas viejas se renombran en vez de borrarse, para no
-- perder los movimientos que ya tienen colgando.
-- ------------------------------------------------------------

update accounts set name = 'BAC Débito'  where name = 'Débito';
update accounts set name = 'BAC Crédito' where name = 'Crédito';

insert into accounts (name, type, initial_balance) values
  ('Banco Atlántida', 'debito', 0)
on conflict (name) do nothing;

-- Si alguna vez se corrieron versiones previas de este script.
update accounts set name = 'Banco Atlántida' where name = 'Atlántida';

-- Ahorros se queda: las metas de ahorro se apoyan en una cuenta de
-- tipo 'ahorro'. No aparece en los selectores del atajo.


-- ------------------------------------------------------------
-- E3. CATEGORÍAS
--
-- "Otros" tiene que poder existir como gasto Y como ingreso. El
-- UNIQUE del script base es sobre el nombre solo, así que lo cambia
-- por (nombre, tipo).
-- ------------------------------------------------------------

do $do$
begin
  if exists (select 1 from pg_constraint
              where conrelid = 'categories'::regclass and contype = 'u'
                and conname = 'categories_name_key') then
    alter table categories drop constraint categories_name_key;
  end if;
end $do$;

create unique index if not exists ux_categories_nombre_tipo
  on categories (lower(name), kind);

-- Extras pasa a llamarse Otros; las otras dos son nuevas.
update categories set name = 'Otros' where name = 'Extras' and kind = 'ingreso';

insert into categories (name, kind, color)
select v.nombre, 'ingreso', v.color
from (values
  ('Salario',     '#2E5E9E'),
  ('Instalación', '#1F7A4D'),
  ('Desarrollo',  '#7A4DA8'),
  ('Otros',       '#6B7280')
) as v(nombre, color)
where not exists (
  select 1 from categories c where lower(c.name) = lower(v.nombre) and c.kind = 'ingreso');


-- ------------------------------------------------------------
-- E4. EMOJIS
--
-- Van en `icon`, no dentro del nombre: el nombre sigue siendo el dato
-- y el emoji la presentación. Cambiar un emoji no rompe nada.
-- ------------------------------------------------------------

update categories c set icon = v.emoji
from (values
  ('gasto',   'Comida',        '🍽️'),
  ('gasto',   'Supermercado',  '🛒'),
  ('gasto',   'Transporte',    '🚌'),
  ('gasto',   'Combustible',   '⛽'),
  ('gasto',   'Servicios',     '💡'),
  ('gasto',   'Salud',         '🏥'),
  ('gasto',   'Suscripciones', '🔁'),
  ('gasto',   'Ocio',          '🎬'),
  ('gasto',   'Hogar',         '🏠'),
  ('gasto',   'Otros',         '📦'),
  ('ingreso', 'Salario',       '💼'),
  ('ingreso', 'Instalación',   '🔧'),
  ('ingreso', 'Desarrollo',    '💻'),
  ('ingreso', 'Otros',         '✨')
) as v(tipo, nombre, emoji)
where c.kind = v.tipo and lower(c.name) = lower(v.nombre);


-- ------------------------------------------------------------
-- E5. get_lists() con emoji
--
-- Así el atajo puede leer la lista de la base y mostrarla bonita sin
-- que haya que mantener el emoji en dos lados.
-- ------------------------------------------------------------

create or replace function get_lists()
returns json
language sql
security definer
set search_path = public
as $fn$
  select json_build_object(
    'gastos',   (select coalesce(json_agg(trim(coalesce(icon, '') || ' ' || name) order by name), '[]'::json)
                   from categories where kind = 'gasto'   and archived = false),
    'ingresos', (select coalesce(json_agg(trim(coalesce(icon, '') || ' ' || name) order by name), '[]'::json)
                   from categories where kind = 'ingreso' and archived = false),
    'cuentas',  (select coalesce(json_agg(name order by name), '[]'::json)
                   from accounts where archived = false)
  );
$fn$;

-- ------------------------------------------------------------
-- E6. CAPTURA con norm() y filtro por tipo
--
-- El filtro por tipo es una corrección: hasta ahora log_expense
-- buscaba la categoría solo por nombre, así que con "Otros" existiendo
-- en gasto e ingreso podía agarrar la equivocada.
-- ------------------------------------------------------------

create or replace function log_expense(
  p_amount   numeric,
  p_category text,
  p_account  text,
  p_note     text default null,
  p_date     date default current_date
) returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cat uuid; v_acc uuid;
  v_limite numeric; v_gastado numeric; v_nombre text;
begin
  select id, name into v_cat, v_nombre from categories
   where norm(name) = norm(p_category) and kind = 'gasto' and archived = false;
  if v_cat is null then
    raise exception 'Categoría de gasto no encontrada: %', p_category;
  end if;

  select id into v_acc from accounts
   where norm(name) = norm(p_account) and archived = false;
  if v_acc is null then
    raise exception 'Cuenta no encontrada: %', p_account;
  end if;

  insert into transactions (occurred_on, amount, kind, category_id, account_id, note)
  values (p_date, p_amount, 'gasto', v_cat, v_acc, nullif(trim(coalesce(p_note, '')), ''));

  select monthly_limit into v_limite
    from budgets where category_id = v_cat and active = true;

  select coalesce(sum(amount), 0) into v_gastado
    from transactions
   where category_id = v_cat and kind = 'gasto'
     and occurred_on between cycle_start() and cycle_end();

  return json_build_object(
    'ok', true, 'categoria', v_nombre, 'monto', p_amount,
    'gastado', v_gastado, 'limite', v_limite,
    'disponible', case when v_limite is null then null else v_limite - v_gastado end);
end;
$fn$;

create or replace function log_income(
  p_amount   numeric,
  p_category text,
  p_account  text,
  p_note     text default null,
  p_date     date default current_date
) returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare v_cat uuid; v_acc uuid; v_saldo numeric; v_nombre text;
begin
  select id, name into v_cat, v_nombre from categories
   where norm(name) = norm(p_category) and kind = 'ingreso' and archived = false;
  if v_cat is null then
    raise exception 'Categoría de ingreso no encontrada: %', p_category;
  end if;

  select id into v_acc from accounts
   where norm(name) = norm(p_account) and archived = false;
  if v_acc is null then raise exception 'Cuenta no encontrada: %', p_account; end if;

  insert into transactions (occurred_on, amount, kind, category_id, account_id, note)
  values (p_date, p_amount, 'ingreso', v_cat, v_acc, nullif(trim(coalesce(p_note, '')), ''));

  select saldo into v_saldo from v_balances_cuentas where id = v_acc;

  return json_build_object('ok', true, 'cuenta', p_account, 'categoria', v_nombre,
                           'monto', p_amount, 'saldo', v_saldo);
end;
$fn$;

create or replace function transfer(
  p_amount numeric, p_from text, p_to text,
  p_note text default null, p_date date default current_date
) returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare v_from uuid; v_to uuid;
begin
  select id into v_from from accounts where norm(name) = norm(p_from) and archived = false;
  select id into v_to   from accounts where norm(name) = norm(p_to)   and archived = false;
  if v_from is null then raise exception 'Cuenta origen no encontrada: %', p_from; end if;
  if v_to   is null then raise exception 'Cuenta destino no encontrada: %', p_to; end if;

  insert into transactions (occurred_on, amount, kind, account_id, to_account_id, note)
  values (p_date, p_amount, 'transferencia', v_from, v_to, nullif(trim(coalesce(p_note, '')), ''));

  return json_build_object('ok', true,
    'saldo_origen',  (select saldo from v_balances_cuentas where id = v_from),
    'saldo_destino', (select saldo from v_balances_cuentas where id = v_to));
end;
$fn$;

create or replace function set_budget(p_category text, p_limit numeric)
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare v_cat uuid; v_nombre text;
begin
  select id, name into v_cat, v_nombre from categories
   where norm(name) = norm(p_category) and kind = 'gasto' and archived = false;
  if v_cat is null then
    raise exception 'Categoría de gasto no encontrada: %', p_category;
  end if;

  if p_limit is null or p_limit <= 0 then
    update budgets set active = false where category_id = v_cat;
    return json_build_object('ok', true, 'categoria', v_nombre, 'limite', null);
  end if;

  insert into budgets (category_id, monthly_limit, active)
  values (v_cat, p_limit, true)
  on conflict (category_id)
  do update set monthly_limit = excluded.monthly_limit, active = true;

  return json_build_object('ok', true, 'categoria', v_nombre, 'limite', p_limit);
end;
$fn$;

create or replace function edit_transaction(
  p_id uuid, p_amount numeric default null, p_category text default null,
  p_account text default null, p_note text default null, p_date date default null
) returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare v_tx transactions%rowtype; v_cat uuid; v_acc uuid;
begin
  select * into v_tx from transactions where id = p_id;
  if v_tx.id is null then raise exception 'Movimiento no encontrado: %', p_id; end if;
  if p_amount is not null and p_amount <= 0 then
    raise exception 'El monto debe ser mayor que cero';
  end if;

  if p_category is not null then
    if v_tx.kind = 'transferencia' then
      raise exception 'Una transferencia no lleva categoría';
    end if;
    select id into v_cat from categories
     where norm(name) = norm(p_category) and kind = v_tx.kind and archived = false;
    if v_cat is null then raise exception 'Categoría no encontrada: %', p_category; end if;
  end if;

  if p_account is not null then
    select id into v_acc from accounts where norm(name) = norm(p_account) and archived = false;
    if v_acc is null then raise exception 'Cuenta no encontrada: %', p_account; end if;
    if v_tx.kind = 'transferencia' and v_acc = v_tx.to_account_id then
      raise exception 'Origen y destino no pueden ser la misma cuenta';
    end if;
  end if;

  update transactions set
    amount      = coalesce(p_amount, amount),
    category_id = coalesce(v_cat, category_id),
    account_id  = coalesce(v_acc, account_id),
    occurred_on = coalesce(p_date, occurred_on),
    note        = case when p_note is null then note else nullif(trim(p_note), '') end
  where id = p_id
  returning * into v_tx;

  return json_build_object('ok', true, 'id', v_tx.id, 'monto', v_tx.amount,
                           'tipo', v_tx.kind, 'fecha', v_tx.occurred_on);
end;
$fn$;

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
