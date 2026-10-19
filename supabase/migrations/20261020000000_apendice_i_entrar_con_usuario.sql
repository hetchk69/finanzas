-- ============================================================
-- Quanto DIY — Apéndice I: entrar con usuario y contraseña
--
-- Hasta aquí la anon key era la credencial: todas las funciones se
-- otorgaban a `anon`, así que quien tuviera esa llave tenía el libro
-- entero. Por eso no podía ir escrita en la página y había que
-- pegarla en cada dispositivo.
--
-- Este apéndice le quita todo a `anon` y se lo pasa a `authenticated`,
-- el rol que Supabase le pone a quien inició sesión con Supabase Auth.
-- Desde aquí la anon key es solo el identificador público del
-- proyecto —sirve para tocar la puerta, no para entrar— y la
-- credencial real pasa a ser tu correo y tu contraseña.
--
-- ORDEN — el apéndice da por hecho estos dos pasos en el panel:
--
--   1. Authentication → Users → Add user → tu correo y contraseña,
--      con «Auto Confirm User» marcado.
--   2. Apagar el registro público («Allow new users to sign up»),
--      en la configuración de Authentication. Si queda prendido,
--      cualquiera que conozca la URL del proyecto puede crearse una
--      cuenta, y `authenticated` dejaría de querer decir «vos».
--
-- El paso 2 es la cerradura principal. I2, abajo, es la segunda: aunque
-- algún día se prenda el registro por error, las funciones solo
-- responden al usuario anotado en `dueno`.
--
-- OJO, a partir de este apéndice:
--   * NO volver a correr B ni F. Los dos revocan en bloque y otorgan su
--     lista a `anon`: le devolverían el libro a la anon key —que ya va
--     escrita en la página, a la vista— y dejarían sin nada al usuario
--     con sesión. Si pasa por accidente, correr este otra vez lo arregla.
--   * Lo mismo con C, D y H, que otorgan desglose() a `anon`.
--   * Las funciones nuevas de apéndices futuros se otorgan a
--     `authenticated`, nunca a `anon`.
--
-- Rompe el atajo de iPhone tal como estaba: mandaba la anon key cruda y
-- eso ya no abre nada. ATAJOS.md explica cómo iniciar sesión desde ahí.
--
-- Idempotente. Pegar en el SQL Editor y Run.
-- ============================================================


-- ------------------------------------------------------------
-- I1. Lo que tenía anon pasa a authenticated.
--
-- Se recorre el catálogo en vez de copiar la lista de F: la lista
-- escrita a mano es justo lo que dejó a desglose() afuera del
-- apéndice B. Así se mueve lo que anon puede ejecutar *de verdad* en
-- tu base hoy —se esperan 14 funciones— y no lo que creemos que puede.
--
-- Va en una transacción con su propia verificación al final: o se
-- mueve todo, o no se mueve nada. Lo peor sería quedar a medias, con
-- anon sin permisos y authenticated todavía sin recibirlos.
--
-- Se saltan las funciones que pertenecen a una extensión (pg_depend
-- con deptype 'e'). La primera corrida tropezó con las cuatro de
-- `unaccent`, que el apéndice F instaló en public para norm(): no leen
-- ni escriben nada del libro —le quitan tildes a un texto— y no son
-- nuestras. El permiso a PUBLIC lo otorgó el dueño de la extensión, y
-- en Postgres nadie revoca lo que no otorgó: el revoke no hacía nada y
-- no avisaba, y la verificación las seguía viendo. Para quien llega sin
-- sesión igual quedan cerradas: el guardia de I2 corta cualquier
-- llamada sin sesión antes de que llegue a una función.
-- ------------------------------------------------------------
begin;

do $$
declare
  f record;
  movidas int := 0;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and p.proname <> 'solo_el_dueno'
      and not exists (select 1 from pg_depend d
                      where d.classid = 'pg_proc'::regclass
                        and d.objid = p.oid and d.deptype = 'e')
      and has_function_privilege('anon', p.oid, 'execute')
  loop
    -- PUBLIC también: anon hereda de ahí, y revocarle solo a anon lo
    -- dejaría igual de habilitado (es la lección de B6).
    execute format('revoke execute on routine %s from public, anon', f.firma);
    execute format('grant execute on routine %s to authenticated', f.firma);
    movidas := movidas + 1;
  end loop;
  raise notice 'I1: % funciones pasaron de anon a authenticated.', movidas;
end $$;

do $$
declare
  quedan text;
begin
  select string_agg(p.oid::regprocedure::text, ', ')
    into quedan
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind in ('f', 'p')
    and p.proname <> 'solo_el_dueno'
    and not exists (select 1 from pg_depend d
                    where d.classid = 'pg_proc'::regclass
                      and d.objid = p.oid and d.deptype = 'e')
    and has_function_privilege('anon', p.oid, 'execute');

  if quedan is not null then
    raise exception 'I1: anon todavía puede ejecutar: %', quedan;
  end if;
end $$;

commit;


-- ------------------------------------------------------------
-- I2. Solo el dueño.
--
-- Una tabla de una fila con tu id de usuario, y una función que
-- PostgREST corre antes de cada llamada (db_pre_request): si quien
-- llama no es el dueño, corta con 401 antes de llegar a la función.
-- Una sola puerta en vez de editar las catorce funciones.
--
-- Va en su propia transacción a propósito: si algo de aquí falla, I1
-- ya quedó firme y el libro funciona igual con la cerradura principal.
-- ------------------------------------------------------------
begin;

create table if not exists public.dueno (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  registrado timestamptz not null default now()
);

alter table public.dueno enable row level security;
revoke all on public.dueno from public, anon, authenticated;

-- Tu correo no se escribe aquí: este archivo es público. En su lugar
-- se adopta al usuario si es el único que existe, que con el registro
-- apagado solo puede ser el que creaste en el paso 1. Si hay cero o
-- más de uno, no adopta a nadie y todo queda cerrado hasta resolverlo
-- — falla hacia cerrado, nunca hacia abierto.
insert into public.dueno (user_id)
select id from auth.users
where (select count(*) from auth.users) = 1
on conflict do nothing;

create or replace function public.solo_el_dueno()
returns void
language plpgsql
security definer
set search_path = public, auth
as $fn$
begin
  -- El service_role es la llave maestra del panel: no pasa por aquí.
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return;
  end if;

  -- Sin sesión, el mismo 401 seco de siempre: a quien toca la puerta
  -- sin llave no se le explica cómo está armada la cerradura.
  if auth.uid() is null then
    raise sqlstate 'PT401' using message = 'No autorizado.';
  end if;

  if not exists (select 1 from public.dueno) then
    raise sqlstate 'PT401'
      using message = 'Falta anotar al dueño: corre otra vez el apéndice I.';
  end if;

  if not exists (select 1 from public.dueno where user_id = auth.uid()) then
    raise sqlstate 'PT401' using message = 'No autorizado.';
  end if;
end;
$fn$;

-- PostgREST la ejecuta con el rol de quien llama, así que los tres la
-- necesitan. A anon le sirve para recibir un 401 claro en vez de un
-- «permission denied» que no dice nada.
grant execute on function public.solo_el_dueno() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.solo_el_dueno';

commit;

notify pgrst, 'reload config';

do $$
declare
  n int;
begin
  select count(*) into n from public.dueno;
  if n = 0 then
    raise notice 'I2: no se anotó dueño. Revisa que exista exactamente un usuario en Authentication → Users y corre este archivo otra vez.';
  else
    raise notice 'I2: dueño anotado.';
  end if;
end $$;


-- ------------------------------------------------------------
-- Resumen en la tabla de resultados. El SQL Editor no siempre muestra
-- los avisos de arriba; esta fila sí sale siempre. Lo esperado:
--   anon_ejecuta 0 · authenticated_ejecuta 14 · duenos 1 · guardia true
-- ------------------------------------------------------------
with nuestras as (
  select p.oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind in ('f', 'p')
    and p.proname <> 'solo_el_dueno'
    and not exists (select 1 from pg_depend d
                    where d.classid = 'pg_proc'::regclass
                      and d.objid = p.oid and d.deptype = 'e')
)
select
  (select count(*) from nuestras where has_function_privilege('anon', oid, 'execute'))          as anon_ejecuta,
  (select count(*) from nuestras where has_function_privilege('authenticated', oid, 'execute')) as authenticated_ejecuta,
  (select count(*) from public.dueno)                                                            as duenos,
  exists (select 1 from pg_roles r, unnest(r.rolconfig) c
          where r.rolname = 'authenticator'
            and c = 'pgrst.db_pre_request=public.solo_el_dueno')                                 as guardia;


-- ------------------------------------------------------------
-- Verificación, desde una terminal ($ANON = la anon key):
--
-- Sin sesión, esta debe devolver 401:
--   curl -s -o /dev/null -w '%{http_code}\n' -X POST \
--     https://dabvugwhzwkmdmsvrazz.supabase.co/rest/v1/rpc/dashboard \
--     -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--     -H "Content-Type: application/json" -d '{}'
--
-- Y en el SQL Editor:
--   select * from public.dueno;                     -- una fila, tu id
--   select rolconfig from pg_roles
--    where rolname = 'authenticator';               -- trae db_pre_request
-- ------------------------------------------------------------
