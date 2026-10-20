-- ============================================================
-- Quanto DIY — Apéndice J: los días se cuentan en hora de Honduras
--
-- El servidor de Supabase vive en UTC y ningún apéndice le había dicho
-- otra cosa. log_expense, log_income y transfer toman la fecha por
-- defecto con current_date, y el atajo nunca manda fecha; la página
-- tampoco, cuando el movimiento es de hoy. Desde las 6 de la tarde en
-- Honduras (UTC−6, sin horario de verano) para la base ya es mañana: el
-- movimiento quedaba anotado con la fecha del día siguiente, y en el
-- Libro aparecía bajo un día que todavía no llegó. Lo mismo el ciclo:
-- dashboard() calcula el día actual con current_date.
--
-- J1 cambia el reloj de la base. J2 no cambia nada: lista los
-- movimientos que ya quedaron corridos, para revisarlos a mano.
--
-- No toca permisos: a diferencia de B, C, D, F y H, se puede correr
-- cuantas veces haga falta.
--
-- Idempotente. Pegar en el SQL Editor y Run.
-- ============================================================


-- ------------------------------------------------------------
-- J1. El reloj.
--
-- Solo cambia cómo se leen las fechas: los timestamptz guardan el
-- instante absoluto y no se mueven. Las conexiones que PostgREST ya
-- tiene abiertas conservan la zona vieja hasta que se reciclan, que es
-- cuestión de minutos.
-- ------------------------------------------------------------
alter database postgres set timezone to 'America/Tegucigalpa';


-- ------------------------------------------------------------
-- J2. Los que ya quedaron corridos.
--
-- created_at guarda el instante real del registro. Si la fecha anotada
-- es la de UTC y no la de Honduras, el movimiento se registró entre las
-- 6 de la tarde y la medianoche y quedó un día adelante.
--
-- Ojo: un movimiento al que a propósito se le puso la fecha de mañana a
-- esa hora también aparece aquí. Por eso se lista y no se corrige solo.
-- La consulta usa «at time zone» explícito, así que da lo mismo que esta
-- sesión todavía esté en UTC.
-- ------------------------------------------------------------
select
  t.id,
  t.occurred_on                                                          as fecha_anotada,
  (t.created_at at time zone 'America/Tegucigalpa')::date                 as fecha_en_honduras,
  to_char(t.created_at at time zone 'America/Tegucigalpa', 'YYYY-MM-DD HH24:MI') as registrado,
  t.kind,
  t.amount,
  t.note
from transactions t
where t.occurred_on = (t.created_at at time zone 'UTC')::date
  and t.occurred_on <> (t.created_at at time zone 'America/Tegucigalpa')::date
order by t.created_at desc;


-- ------------------------------------------------------------
-- Para corregirlos, después de revisar la lista de arriba:
--
--   update transactions t
--      set occurred_on = (t.created_at at time zone 'America/Tegucigalpa')::date
--    where t.occurred_on = (t.created_at at time zone 'UTC')::date
--      and t.occurred_on <> (t.created_at at time zone 'America/Tegucigalpa')::date;
--
-- Verificación, en una consulta nueva del SQL Editor:
--   select current_setting('TimeZone'), now(), current_date;
--   -> America/Tegucigalpa, la hora de Honduras y la fecha de hoy aquí.
-- ------------------------------------------------------------
