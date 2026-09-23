-- ============================================================
-- Quanto DIY — v5, parte B de C: funciones de captura
--
-- Correr las tres EN ORDEN: A, luego B, luego C.
-- Pegar cada una completa, sin seleccionar texto, y pulsar Run.
-- Si al final no aparece el sello, el pegado se truncó.
--
-- Idempotente: se puede repetir cualquiera sin romper nada.
-- ============================================================

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

select 'v5 parte B aplicada' as sello;
