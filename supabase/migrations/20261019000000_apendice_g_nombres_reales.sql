-- ============================================================
-- Quanto DIY — Apéndice G: los nombres que de verdad se usan
--
-- Al armar el atajo quedó claro que los nombres del teléfono no son
-- los de la base. Se corrige la base, no el teléfono: los de arriba
-- son los que el usuario piensa cuando registra, y el atajo es donde
-- se registra todos los días.
--
--   G1. La cuenta de Atlántida pasa a llamarse como sus hermanas.
--   G2. Instalación → Instalaciones.
--   G3. DIGER y CCONCASA como categorías de entrada.
--
-- Renombrar no pierde nada: los movimientos cuelgan del id, no del
-- nombre, así que cualquier gasto ya registrado sigue colgando igual.
--
-- Idempotente. Pegar en el SQL Editor y Run.
-- ============================================================


-- ------------------------------------------------------------
-- G1. CUENTA
--
-- BAC tiene débito y crédito, así que esas dos se nombran por banco e
-- instrumento. Atlántida se había quedado con el banco solo, y en el
-- selector del atajo rompe la simetría — se escribió "Banco Atlántida
-- Débito" por reflejo y la llamada falló con "Cuenta no encontrada".
-- ------------------------------------------------------------

update accounts set name = 'Banco Atlántida Débito'
where name = 'Banco Atlántida';


-- ------------------------------------------------------------
-- G2. INSTALACIONES
--
-- En plural, que es como se dice al cobrarlas. La comparación de
-- norm() ignora tildes y mayúsculas pero no el número gramatical:
-- "Instalaciones" nunca iba a encontrar "Instalación".
-- ------------------------------------------------------------

update categories set name = 'Instalaciones'
where kind = 'ingreso' and lower(name) = 'instalación';


-- ------------------------------------------------------------
-- G3. LAS DOS FUENTES DE INGRESO QUE FALTABAN
--
-- DIGER y CCONCASA son de dónde entra el dinero. El emoji y el color
-- se pueden cambiar después sin romper nada: el nombre es el dato.
--
-- `Salario` se deja como está. Si DIGER lo reemplaza del todo, se
-- archiva con la línea comentada de abajo — archivar y no borrar,
-- porque borrarla dejaría huérfano cualquier ingreso ya registrado.
-- ------------------------------------------------------------

insert into categories (name, kind, icon, color)
select v.nombre, 'ingreso', v.emoji, v.color
from (values
  ('DIGER',    '🏛️', '#2E5E9E'),
  ('CCONCASA', '🏢', '#1F7A4D')
) as v(nombre, emoji, color)
where not exists (
  select 1 from categories c
   where lower(c.name) = lower(v.nombre) and c.kind = 'ingreso');

-- Si Salario ya no se usa:
-- update categories set archived = true where kind = 'ingreso' and name = 'Salario';


-- ------------------------------------------------------------
-- Sin permisos que tocar: no se crean funciones ni tablas, así que el
-- `alter default privileges` del apéndice B no tiene nada que hacer
-- aquí y los grants existentes siguen igual.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- Verificación:
--   select get_lists() -> 'ingresos';
--   select get_lists() -> 'cuentas';
--
-- Deben salir DIGER, CCONCASA, Desarrollo, Instalaciones y Otros
-- (más Salario si no se archivó), y la cuenta Banco Atlántida Débito.
-- ------------------------------------------------------------
