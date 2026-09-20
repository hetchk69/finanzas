# Atajos de iPhone — hoja de armado

## Por qué hay que armarlos a mano

Desde **iOS 15 los archivos `.shortcut` van firmados**, y la firma solo se puede
hacer desde un Mac (`shortcuts sign`). Un archivo sin firmar no entra al teléfono:
«Allow Untrusted Shortcuts» sirve para atajos compartidos entre personas, no para
un plist generado en una PC. Así que no tiene sentido que te entregue archivos —
no se importarían. Esto es lo que sí sirve: los valores exactos, sin ambigüedad.

Son unos diez minutos para los cuatro atajos. Solo el primero tiene trabajo real;
los otros tres son variaciones de dos o tres campos.

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

## 1. Atajo «Gasto» — el que vas a usar todos los días

Nómbralo exactamente `Gasto`, en una palabra, para que Siri lo entienda.

**Acción 1 — Texto.** Pega esto, una categoría por línea:

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

**Acción 2 — Dividir texto.** Separador: **Líneas nuevas**.

**Acción 3 — Elegir de la lista.** Entrada: el resultado anterior. Pregunta:
`¿Categoría?`

**Acción 4 — Pedir entrada.** Tipo **Número**. Pregunta: `¿Cuánto? L`

> El orden importa: la categoría es lo que más tarda en decidirse, y dejar el
> monto de último hace que el teclado numérico aparezca al final. Se confirma con
> una sola mano.

**Acción 5 — Obtener contenido de la URL.**

- URL: `https://dabvugwhzwkmdmsvrazz.supabase.co/rest/v1/rpc/log_expense`
- Método: `POST`
- Headers: los tres de arriba
- Request Body → **JSON**:

| Clave | Tipo | Valor |
|---|---|---|
| `p_amount` | Número | *variable de la acción 4* |
| `p_category` | Texto | *variable de la acción 3* |
| `p_account` | Texto | `Efectivo` |

**Acción 6 — Obtener valor del diccionario.** Clave: `disponible`

**Acción 7 — Mostrar notificación:**

```
L [Monto] en [Categoría] · Quedan L [Disponible]
```

Ese aviso es el producto. Sin él estás escribiendo en un agujero negro.

### Sobre la lista fija de categorías

Existe `get_lists` para no mantenerla a mano: se pondría una llamada a
`.../rpc/get_lists` + **Obtener valor del diccionario** con clave `gastos` antes
del selector, y se borran las acciones 1 y 2.

**No lo recomiendo para este atajo.** Agrega un viaje de red antes de que aparezca
el selector — medio segundo de rueda girando justo en el momento que tiene que ser
instantáneo, y la captura lenta es exactamente lo que mata estos sistemas. La lista
fija se desincroniza solo cuando agregues una categoría, y ese día editas una
acción de texto. Usa `get_lists` en «Resumen», donde medio segundo no importa.

---

## 2. Atajo «Gasto tarjeta»

Duplica `Gasto` y cambia **una sola cosa**: en la acción 5, `p_account` = `Crédito`.

Dos atajos rápidos le ganan a uno lento que pregunta la cuenta cada vez. Si de
verdad usas tres o cuatro cuentas a diario, entonces sí mete un segundo
**Texto → Dividir → Elegir de la lista** con `Efectivo`, `Débito`, `Crédito`,
`Ahorros` y usa esa variable en `p_account`.

---

## 3. Atajo «Ingreso»

Igual que `Gasto`, con tres cambios:

- Acción 1, la lista: solo `Salario` y `Extras`
- Acción 5, la URL: `.../rpc/log_income`
- Acción 6, la clave: `saldo` en vez de `disponible`
- Notificación: `L [Monto] · Saldo L [Saldo]`

---

## 4. Atajo «Transferencia»

- **Elegir de la lista** (cuentas) → `p_from`
- **Elegir de la lista** (cuentas) → `p_to`
- **Pedir entrada**, Número → `p_amount`
- URL: `.../rpc/transfer`
- Claves de salida: `saldo_origen` y `saldo_destino`

Origen y destino no pueden ser la misma cuenta: la base lo rechaza con un error
claro, no con un movimiento raro.

---

## 5. Atajo «Deshacer»

Dos acciones. Este es el que más vas a agradecer.

1. **Obtener contenido de la URL** → `POST .../rpc/undo_last`, los tres headers,
   **sin cuerpo**
2. **Mostrar notificación** → `Borrado: L [monto]`

Ponlo en el Centro de Control junto al de gasto. Vas a teclear mal un monto en la
primera semana, y sin deshacer se abandona el sistema.

---

## 6. Atajo «Resumen»

1. **Obtener contenido de la URL** → `POST .../rpc/cycle_summary`
2. **Obtener valor del diccionario** → clave `presupuestos`
3. **Repetir con cada elemento** → dentro, extraer `categoria`, `gastado`, `limite`
4. **Mostrar resultado**

Aquí el bucle sí es aceptable: son cinco presupuestos, no cientos de movimientos.

Con el apéndice B aplicado puedes apuntar a `.../rpc/dashboard`, que además trae
saldos, metas, serie diaria y los últimos movimientos en la misma llamada.

---

## 7. Disparadores

| Método | Dónde | Velocidad |
|---|---|---|
| **Botón de Acción** | Ajustes → Botón de Acción → Atajo → `Gasto` | La más rápida |
| **Centro de Control** | Añadir control → Atajo | Muy rápida |
| **Widget** | Widget de Atajos en la pantalla de inicio | Rápida |
| **Siri** | «Oye Siri, Gasto» | Manos libres |
| **Tocar atrás** | Accesibilidad → Tocar → Tocar atrás → Doble toque | Discreta |

Una automatización que vale la pena: **al salir del supermercado o la gasolinera**
→ ejecutar `Gasto` con la categoría precargada.

---

## Si algo falla

| Síntoma | Causa |
|---|---|
| `Categoría no encontrada` | El texto del atajo no coincide con la tabla. La comparación ignora mayúsculas, **pero no tildes ni espacios**: `Debito` no encuentra `Débito`. |
| `401` / `JWT expired` | Rotaste las llaves y no actualizaste los atajos. |
| Todo devuelve `404` | Falta la barra: es `/rest/v1/rpc/`, no `/rest/v1/rpc`. |
| `Empty or invalid json` | El *Request Body* quedó en «Form» en vez de «JSON». |
| `disponible` sale vacío | Esa categoría no tiene presupuesto. Es correcto, no un error. |
| Nada responde tras días sin usarlo | El proyecto se pausó por inactividad. Se reactiva desde el panel de Supabase. |
