-- ============================================================
-- Quanto DIY — v5, parte A de C: normalización, cuentas, categorías y emojis
--
-- Correr las tres EN ORDEN: A, luego B, luego C.
-- Pegar cada una completa, sin seleccionar texto, y pulsar Run.
-- Si al final no aparece el sello, el pegado se truncó.
--
-- Idempotente: se puede repetir cualquiera sin romper nada.
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

select 'v5 parte A aplicada' as sello;
