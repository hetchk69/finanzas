-- ============================================================
-- Quanto DIY — Apéndice E: categorías de entrada
--
-- El atajo del teléfono pasa a preguntar primero Entrada o Salida, y la
-- rama de entrada necesita más que las dos categorías originales
-- (Salario, Extras). Estas tres son las que el usuario registra de verdad.
--
-- «Cobro de servicios» y no «Servicios» a propósito: `categories.name` es
-- único a nivel global —la restricción es `categories_name_key`, sobre
-- `name` solo, no sobre (name, kind)— y ya existe una categoría de gasto
-- llamada «Servicios», la de agua y luz. Aparte del choque técnico, ver la
-- misma palabra en las dos listas significando cosas opuestas hace ilegible
-- el libro tres meses después.
--
-- `color` e `icon` quedan nulos: la rampa de las donas y la leyenda solo
-- recorren categorías de gasto, así que un color aquí no se pinta en ningún
-- lado. Si algún día hay gráficos de ingreso, se llenan en su propia
-- migración.
--
-- Salario y Extras se conservan. Archivarlas dejaría huérfano cualquier
-- ingreso ya registrado con ellas, y Extras sigue siendo el cajón para lo
-- que no encaja en ninguna.
--
-- Idempotente por el `on conflict`: se puede volver a correr sin duplicar.
-- ============================================================

insert into categories (name, kind) values
  ('Pago de trabajo',    'ingreso'),
  ('Cobro de servicios', 'ingreso'),
  ('Instalaciones',      'ingreso')
on conflict (name) do nothing;

-- ------------------------------------------------------------
-- Sin permisos que otorgar: `categories` sigue cerrada a `anon`, que la lee
-- únicamente por `get_lists()`. Nada que revocar tampoco — esta migración no
-- crea funciones, así que el `alter default privileges` del apéndice B no
-- tiene nada que interceptar aquí.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- Verificación:
--   select name from categories where kind = 'ingreso' order by name;
--   select get_lists() -> 'ingresos';
-- ------------------------------------------------------------
