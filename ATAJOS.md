# Atajos de iPhone — hoja de armado

## Por qué hay que armarlos a mano

Desde **iOS 15 los archivos `.shortcut` van firmados**, y la firma solo se puede
hacer desde un Mac (`shortcuts sign`). Un archivo sin firmar no entra al teléfono:
«Allow Untrusted Shortcuts» sirve para atajos compartidos entre personas, no para
un plist generado en una PC. Así que no tiene sentido que te entregue archivos —
no se importarían. Esto es lo que sí sirve: los valores exactos, sin ambigüedad.

Son unos quince minutos. Solo el primero tiene trabajo real —son dos ramas—; los
otros son variaciones de dos o tres campos.

---

## Datos que vas a pegar

```
URL base    https://dabvugwhzwkmdmsvrazz.supabase.co/rest/v1/rpc/
ANON KEY    Supabase → Settings → API → Project API keys → anon public
```

La anon key no está escrita en ningún archivo de esta carpeta, a propósito: así la
carpeta entera se puede publicar sin filtrarla. Cópiala del panel de Supabase.

**Los tres encabezados** van en *toda* llamada. En la acción **Obtener contenido de
la URL**, método `POST`, sección *Headers*:

| Clave | Valor |
|---|---|
| `apikey` | *(la anon key)* |
| `Authorization` | `Bearer ` + *(la anon key)* — con el espacio |
| `Content-Type` | `application/json` |

En *Request Body* elige **JSON** (no «Form»). Y ojo con la barra final: es
`/rest/v1/rpc/log_expense`, no `/rest/v1/rpclog_expense`.

---

## 1. Atajo «Movimiento» — el que vas a usar todos los días

Nómbralo exactamente `Movimiento`, en una palabra, para que Siri lo entienda.

La primera acción parte el atajo en dos ramas, y todo lo demás vive *dentro* de
una de ellas.

**Acción 1 — Elegir del menú.** Pregunta: `¿Entrada o salida?` Dos opciones, en
este orden exacto:

```
Salida
Entrada
```

> Salida va primero porque la vas a tocar veinte veces más seguido, y en un menú
> de dos la primera opción cae donde ya está el pulgar.

«Elegir del menú» abre un bloque por opción en el editor. Las acciones que
siguen van adentro del bloque que les toca, no debajo de todo.

---

### Rama «Salida»

**Acción 2 — Texto.** Pega esto, una categoría por línea:

```
Comida
Supermercado
Transporte
Combustible
Servicios
Salud
Suscripciones
Ocio
Hogar
Otros
```

**Acción 3 — Dividir texto.** Separador: **Líneas nuevas**.

**Acción 4 — Elegir de la lista.** Entrada: el resultado anterior. Pregunta:
`¿Categoría?`

**Acción 5 — Pedir entrada.** Tipo **Número**. Pregunta: `¿Cuánto? L`

**Acción 6 — Pedir entrada.** Tipo **Texto**. Pregunta: `¿En qué?`

**Acción 7 — Obtener contenido de la URL.**

- URL: `https://dabvugwhzwkmdmsvrazz.supabase.co/rest/v1/rpc/log_expense`
- Método: `POST`
- Headers: los tres de arriba
- Request Body → **JSON**:

| Clave | Tipo | Valor |
|---|---|---|
| `p_amount` | Número | *variable de la acción 5* |
| `p_category` | Texto | *variable de la acción 4* |
| `p_account` | Texto | `Efectivo` |
| `p_note` | Texto | *variable de la acción 6* |

**Acción 8 — Obtener valor del diccionario.** Clave: `disponible`

**Acción 9 — Mostrar notificación:**

```
L [Monto] en [Categoría] · Quedan L [Disponible]
```

Ese aviso es el producto. Sin él estás escribiendo en un agujero negro.

---

### Rama «Entrada»

Misma forma, tres cambios: otra lista, otra URL y otra clave de salida.

**Acción 2 — Texto.** Las cinco categorías de ingreso:

```
Pago de trabajo
Cobro de servicios
Instalaciones
Salario
Extras
```

> «Cobro de servicios» y no «Servicios» porque el nombre es único en toda la
> tabla y «Servicios» ya es la categoría de gasto del agua y la luz. Aparte del
> choque técnico, la misma palabra en las dos listas significando cosas
> opuestas vuelve ilegible el libro tres meses después.

**Acción 3 — Dividir texto.** Separador: **Líneas nuevas**.

**Acción 4 — Elegir de la lista.** Pregunta: `¿De qué?`

**Acción 5 — Pedir entrada.** Tipo **Número**. Pregunta: `¿Cuánto? L`

**Acción 6 — Pedir entrada.** Tipo **Texto**. Pregunta: `¿De quién?`

**Acción 7 — Obtener contenido de la URL.**

- URL: `https://dabvugwhzwkmdmsvrazz.supabase.co/rest/v1/rpc/log_income`
- Método: `POST`, los tres headers, Request Body → **JSON**:

| Clave | Tipo | Valor |
|---|---|---|
| `p_amount` | Número | *variable de la acción 5* |
| `p_category` | Texto | *variable de la acción 4* |
| `p_account` | Texto | `Efectivo` |
| `p_note` | Texto | *variable de la acción 6* |

**Acción 8 — Obtener valor del diccionario.** Clave: `saldo`

**Acción 9 — Mostrar notificación:**

```
L [Monto] · [Categoría] · Saldo L [Saldo]
```

Si el dinero entra a otra cuenta —un pago que cae al banco y no a la mano—
cambia `p_account` a `Débito` en esa rama, o duplica el atajo como se hace con
la tarjeta abajo.

---

### Sobre el orden de las preguntas

La descripción va al final porque así lo pediste, y tiene un costo que conviene
tener dicho: el último teclado que aparece es el alfabético, no el numérico, así
que la confirmación deja de ser de una sola mano. Si eso estorba en la práctica,
**intercambia las acciones 5 y 6** —descripción antes del monto— y el teclado
numérico vuelve a ser el último. El cuerpo JSON no cambia, solo qué variable
apunta a cuál acción.

Dejar la descripción vacía es válido: se guarda como texto vacío y el libro lo
pinta igual que un asiento sin nota.

### Sobre las listas fijas de categorías

Existe `get_lists` para no mantenerlas a mano: devuelve `gastos` e `ingresos`
por separado, así que se pondría una llamada a `.../rpc/get_lists` + **Obtener
valor del diccionario** con la clave que toque antes de cada selector, y se
borran las acciones de Texto y Dividir de las dos ramas.

**No lo recomiendo para este atajo.** Agrega un viaje de red antes de que
aparezca el selector — medio segundo de rueda girando justo en el momento que
tiene que ser instantáneo, y la captura lenta es exactamente lo que mata estos
sistemas. Las listas fijas se desincronizan solo cuando agregues una categoría,
y ese día editas una acción de texto. Usa `get_lists` en «Resumen», donde medio
segundo no importa.

---

## 2. Atajo «Gasto tarjeta»

Duplica `Movimiento`, **borra el bloque de Entrada** y en la acción de la URL
cambia `p_account` a `Crédito`. Como queda una sola rama, también puedes borrar
la acción del menú y dejar el atajo directo.

Dos atajos rápidos le ganan a uno lento que pregunta la cuenta cada vez. Si de
verdad usas tres o cuatro cuentas a diario, entonces sí mete un segundo
**Texto → Dividir → Elegir de la lista** con `Efectivo`, `Débito`, `Crédito`,
`Ahorros` y usa esa variable en `p_account`.

> El viejo atajo «Ingreso» ya no existe por separado: es la rama de Entrada de
> «Movimiento». Si lo tenías armado, bórralo para no registrar dos veces.

---

## 3. Atajo «Transferencia»

- **Elegir de la lista** (cuentas) → `p_from`
- **Elegir de la lista** (cuentas) → `p_to`
- **Pedir entrada**, Número → `p_amount`
- URL: `.../rpc/transfer`
- Claves de salida: `saldo_origen` y `saldo_destino`

Origen y destino no pueden ser la misma cuenta: la base lo rechaza con un error
claro, no con un movimiento raro.

---

## 4. Atajo «Deshacer»

Dos acciones. Este es el que más vas a agradecer.

1. **Obtener contenido de la URL** → `POST .../rpc/undo_last`, los tres headers,
   **sin cuerpo**
2. **Mostrar notificación** → `Borrado: L [monto]`

Ponlo en el Centro de Control junto a «Movimiento». Vas a teclear mal un monto en la
primera semana, y sin deshacer se abandona el sistema.

---

## 5. Atajo «Resumen»

1. **Obtener contenido de la URL** → `POST .../rpc/cycle_summary`
2. **Obtener valor del diccionario** → clave `presupuestos`
3. **Repetir con cada elemento** → dentro, extraer `categoria`, `gastado`, `limite`
4. **Mostrar resultado**

Aquí el bucle sí es aceptable: son cinco presupuestos, no cientos de movimientos.

Con el apéndice B aplicado puedes apuntar a `.../rpc/dashboard`, que además trae
saldos, metas, serie diaria y los últimos movimientos en la misma llamada.

---

## 6. Disparadores

| Método | Dónde | Velocidad |
|---|---|---|
| **Botón de Acción** | Ajustes → Botón de Acción → Atajo → `Movimiento` | La más rápida |
| **Centro de Control** | Añadir control → Atajo | Muy rápida |
| **Widget** | Widget de Atajos en la pantalla de inicio | Rápida |
| **Siri** | «Oye Siri, Movimiento» | Manos libres |
| **Tocar atrás** | Accesibilidad → Tocar → Tocar atrás → Doble toque | Discreta |

Una automatización que vale la pena: **al salir del supermercado o la gasolinera**
→ ejecutar `Movimiento` con la rama de salida y la categoría precargadas.

---

## Si algo falla

| Síntoma | Causa |
|---|---|
| `Categoría no encontrada` | El texto del atajo no coincide con la tabla. La comparación ignora mayúsculas, **pero no tildes ni espacios**: `Debito` no encuentra `Débito`. |
| `401` / `JWT expired` | Rotaste las llaves y no actualizaste los atajos. |
| Todo devuelve `404` | Falta la barra: es `/rest/v1/rpc/`, no `/rest/v1/rpc`. |
| `Empty or invalid json` | El *Request Body* quedó en «Form» en vez de «JSON». |
| `disponible` sale vacío | Esa categoría no tiene presupuesto. Es correcto, no un error. |
| El menú no ramifica: pregunta y luego corre todo | Las acciones quedaron *debajo* del bloque en vez de adentro. Arrástralas dentro de su opción. |
| La descripción no aparece en el asiento | O la dejaste vacía, o `p_note` quedó apuntando a la acción del monto. |
| Nada responde tras días sin usarlo | El proyecto se pausó por inactividad. Se reactiva desde el panel de Supabase. |
