-- ============================================================
-- Quanto DIY — Apéndice K: las entradas aceptan el nombre corto de la cuenta
--
-- El apéndice G renombró «Banco Atlántida» a «Banco Atlántida Débito»,
-- pero la lista de cuentas de la rama Entrada del atajo quedó con el
-- nombre viejo. norm() ignora emoji, tildes y mayúsculas, no palabras que
-- falten, así que la entrada fallaba con «Cuenta no encontrada».
--
-- Igual que en G, se corrige la base y no el teléfono: el atajo es donde
-- se registra todos los días. La lista de la rama Entrada es, y se queda:
--
--     Banco Atlantida
--     BAC
--     Efectivo
--
-- log_income resuelve la cuenta así:
--
--   1. Nombre exacto (normalizado), como siempre.
--   2. Si no hay, una cuenta cuyo nombre empiece con lo que se mandó y
--      siga con una palabra más — pero solo si queda UNA candidata.
--   3. En las entradas, las cuentas de crédito no son candidatas.
--
-- El paso 3 es lo que desempata «BAC». Existen BAC Débito y BAC Crédito,
-- pero a una tarjeta de crédito no le entra dinero: abonarle es pagarla,
-- y eso es una transferencia. Esa regla ya estaba escrita en ATAJOS.md y
-- la página ya esconde la tarjeta del selector de ingresos desde hace
-- días; aquí la base por fin opina lo mismo. Como la tarjeta no compite,
-- «BAC» apunta sola a BAC Débito.
--
-- Fuera de las entradas la regla no aplica: un gasto sí se paga con la
-- tarjeta, y una transferencia sí le abona. Por eso el filtro es un
-- parámetro de cuenta_id() y no su comportamiento por defecto.
--
-- Solo cambia log_income, a pedido del dueño. log_expense y transfer
-- pueden usar la misma búsqueda cambiando su línea de la cuenta por
-- cuenta_id(p_account) —sin el segundo argumento—, el día que se quiera.
--
-- La firma de log_income no cambia, así que conserva el permiso para
-- `authenticated` que le dio el apéndice I. cuenta_id no se otorga a
-- nadie: solo la llaman funciones security definer, que corren como su
-- dueño.
--
-- Idempotente. Pegar en el SQL Editor y Run.
-- ============================================================


-- ------------------------------------------------------------
-- K1. La búsqueda de cuenta: exacta, o por nombre corto sin ambigüedad.
--
-- Si una versión anterior de este apéndice alcanzó a correr, dejó una
-- cuenta_id(text) de un solo argumento. Se va: con el default del
-- segundo parámetro, las dos firmas convivirían y cada llamada sería
-- ambigua para Postgres.
-- ------------------------------------------------------------

drop function if exists public.cuenta_id(text);

create or replace function cuenta_id(p_nombre text, p_sin_credito boolean default false)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
  v_cuantas int;
begin
  select id into v_id from accounts
   where norm(name) = norm(p_nombre)
     and archived = false
     and (not p_sin_credito or type <> 'credito');
  if v_id is not null then
    return v_id;
  end if;

  -- El espacio antes del % obliga a que lo que sigue sea otra palabra:
  -- «Banco Atlántida» no debe encontrar algo como «Banco Atlántidas».
  select count(*), min(id::text)::uuid into v_cuantas, v_id from accounts
   where norm(name) like norm(p_nombre) || ' %'
     and archived = false
     and (not p_sin_credito or type <> 'credito');

  return case when v_cuantas = 1 then v_id end;
end;
$fn$;

revoke execute on function public.cuenta_id(text, boolean) from public, anon, authenticated;


-- ------------------------------------------------------------
-- K2. log_income con la búsqueda nueva. Todo lo demás, idéntico al del
-- apéndice F.
-- ------------------------------------------------------------
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
declare v_cat uuid; v_acc uuid; v_saldo numeric; v_nombre text; v_cuenta text;
begin
  select id, name into v_cat, v_nombre from categories
   where norm(name) = norm(p_category) and kind = 'ingreso' and archived = false;
  if v_cat is null then
    raise exception 'Categoría de ingreso no encontrada: %', p_category;
  end if;

  v_acc := cuenta_id(p_account, true);
  if v_acc is null then
    -- Si el nombre sí existe pero es de crédito, el error lo dice: «no
    -- encontrada» mandaría a buscar un error de escritura que no hay.
    if exists (select 1 from accounts
                where (norm(name) = norm(p_account) or norm(name) like norm(p_account) || ' %')
                  and type = 'credito' and archived = false) then
      raise exception 'A una tarjeta de crédito no le entra dinero: % es de crédito, y abonarle es una transferencia', p_account;
    end if;
    raise exception 'Cuenta no encontrada: %', p_account;
  end if;
  select name into v_cuenta from accounts where id = v_acc;

  insert into transactions (occurred_on, amount, kind, category_id, account_id, note)
  values (p_date, p_amount, 'ingreso', v_cat, v_acc, nullif(trim(coalesce(p_note, '')), ''));

  select saldo into v_saldo from v_balances_cuentas where id = v_acc;

  -- 'cuenta' devuelve el nombre real, no el que se mandó: así la
  -- notificación del atajo dice dónde cayó de verdad.
  return json_build_object('ok', true, 'cuenta', v_cuenta, 'categoria', v_nombre,
                           'monto', p_amount, 'saldo', v_saldo);
end;
$fn$;


-- ------------------------------------------------------------
-- Verificación. Las tres primeras columnas son las tres opciones del
-- atajo y deben traer el nombre completo de la cuenta. La cuarta debe
-- venir vacía: con el filtro de crédito, la tarjeta no es candidata ni
-- cuando se la nombra entera.
-- ------------------------------------------------------------
select
  (select name from accounts where id = cuenta_id('Banco Atlantida', true)) as entrada_atlantida,
  (select name from accounts where id = cuenta_id('BAC',             true)) as entrada_bac,
  (select name from accounts where id = cuenta_id('efectivo',        true)) as entrada_efectivo,
  (select name from accounts where id = cuenta_id('BAC Crédito',     true)) as entrada_tarjeta,
  (select name from accounts where id = cuenta_id('BAC Crédito'))           as gasto_tarjeta;
