# Atajo de iPhone — entradas y salidas

> **Requiere `quanto_v5.sql` aplicado.** Antes de eso las cuentas nuevas no
> existen y las categorías no tienen emoji.

## Por qué va a mano

Desde iOS 15 los archivos `.shortcut` van firmados, y la firma solo se hace desde
un Mac. Un archivo generado en Windows no se importaría. Esto es lo que sí sirve:
los valores exactos.

## Antes de empezar

Mándese al teléfono la anon key (Supabase → Settings → API → **anon public**) y
esta URL base, que son lo único largo de teclear:

```
https://dabvugwhzwkmdmsvrazz.supabase.co/rest/v1/rpc/
```

**Los tres encabezados** van en toda llamada. En *Obtener contenido de la URL*,
método `POST`, sección *Encabezados*:

| Clave | Valor |
|---|---|
| `apikey` | *(la anon key)* |
| `Authorization` | la palabra `Bearer`, **un espacio**, y la llave |
| `Content-Type` | `application/json` |

En `Authorization` no va ningún `+`: es `Bearer eyJhbGci…`, pegado con un espacio.

Y en *Cuerpo de la solicitud* elija **JSON**, nunca «Formulario» — si queda en
formulario, Supabase responde `Empty or invalid json`.

---

## Un solo atajo con bifurcación

Nómbrelo `Registrar`.

### Acciones 1–3 — la pregunta que parte todo

**1. Texto**
```
Entrada
Salida
```

**2. Dividir texto** → separador **Líneas nuevas**

**3. Elegir de la lista** → entrada: el resultado anterior · Preguntar: `¿Entrada o salida?`

### Acción 4 — Si

Agregue la acción **Si**. Configúrela:

> **Si** `Elemento elegido` **es** `Entrada`

Shortcuts agrega sola las secciones **Si no** y **Finalizar si**. Todo lo de la
rama de entrada va *entre* «Si» y «Si no»; lo de salida, entre «Si no» y
«Finalizar si».

---

## Rama ENTRADA (entre «Si» y «Si no»)

**5. Texto** — a qué cuenta entra el dinero:
```
Banco Atlántida
BAC Débito
Efectivo
```

> BAC Crédito no aparece aquí a propósito: meter dinero a una tarjeta de crédito
> no es un ingreso, es pagar la tarjeta. Eso es una transferencia.

**6. Dividir texto** → **Líneas nuevas**

**7. Elegir de la lista** → Preguntar: `¿A qué cuenta?`

**8. Texto** — categorías de ingreso:
```
💼 Salario
🔧 Instalación
💻 Desarrollo
✨ Otros
```

**9. Dividir texto** → **Líneas nuevas**

**10. Elegir de la lista** → Preguntar: `¿De qué?`

**11. Pedir entrada** → tipo **Número** · Preguntar: `¿Cuánto? L`

**12. Pedir entrada** → tipo **Texto** · Preguntar: `Descripción (opcional)`

**13. Obtener contenido de la URL**

- URL: `https://dabvugwhzwkmdmsvrazz.supabase.co/rest/v1/rpc/log_income`
- Método `POST`, los tres encabezados, cuerpo **JSON**:

| Clave | Tipo | Valor |
|---|---|---|
| `p_amount` | Número | *variable de la acción 11* |
| `p_category` | Texto | *variable de la acción 10* |
| `p_account` | Texto | *variable de la acción 7* |
| `p_note` | Texto | *variable de la acción 12* |

**14. Obtener valor del diccionario** → clave `saldo`

**15. Mostrar notificación**
```
+L [Monto] · [Categoría] · Saldo L [Valor del diccionario]
```

---

## Rama SALIDA (entre «Si no» y «Finalizar si»)

**16. Texto** — con qué se pagó:
```
Efectivo
BAC Crédito
BAC Débito
Banco Atlántida
```

> Efectivo va primero porque es lo más frecuente y queda bajo el pulgar.

**17. Dividir texto** → **Líneas nuevas**

**18. Elegir de la lista** → Preguntar: `¿Con qué pagó?`

**19. Texto** — categorías de gasto:
```
🍽️ Comida
🛒 Supermercado
🚌 Transporte
⛽ Combustible
💡 Servicios
🏥 Salud
🔁 Suscripciones
🎬 Ocio
🏠 Hogar
📦 Otros
```

**20. Dividir texto** → **Líneas nuevas**

**21. Elegir de la lista** → Preguntar: `¿Categoría?`

**22. Pedir entrada** → tipo **Número** · Preguntar: `¿Cuánto? L`

**23. Pedir entrada** → tipo **Texto** · Preguntar: `¿En qué?`

**24. Obtener contenido de la URL**

- URL: `https://dabvugwhzwkmdmsvrazz.supabase.co/rest/v1/rpc/log_expense`
- Método `POST`, los tres encabezados, cuerpo **JSON**:

| Clave | Tipo | Valor |
|---|---|---|
| `p_amount` | Número | *variable de la acción 22* |
| `p_category` | Texto | *variable de la acción 21* |
| `p_account` | Texto | *variable de la acción 18* |
| `p_note` | Texto | *variable de la acción 23* |

**25. Obtener valor del diccionario** → clave `disponible`

**26. Mostrar notificación**
```
−L [Monto] en [Categoría] · Quedan L [Valor del diccionario]
```

---

## Sobre los emojis

La base guarda `Comida` y el emoji va aparte, en la columna `icon`. Las funciones
**normalizan** antes de comparar: quitan el emoji inicial, las tildes y las
mayúsculas. Por eso el atajo puede mandar `🍽️ Comida`, `Comida` o `comida` y las
tres encuentran lo mismo.

Eso es lo que arregla el error que salió la primera vez, cuando la lista tenía
emoji y la base no.

Si algún día quiere que la lista se mantenga sola, cambie las acciones de **Texto
+ Dividir** por una llamada a `.../rpc/get_lists` y un **Obtener valor del
diccionario** con clave `gastos` o `ingresos` — ya vienen con el emoji puesto.
Cuesta medio segundo de red antes de que aparezca el selector, que es justo el
momento en que no conviene esperar; por eso no viene así por defecto.

---

## Sobre la velocidad

Preguntar «¿entrada o salida?» agrega **un toque a cada captura**, y las salidas
son la enorme mayoría. Si en dos semanas le empieza a estorbar, la alternativa es
partirlo en dos atajos — `Gasto` e `Ingreso` — cada uno sin esa primera pregunta.
Se duplica este y se borra la rama que sobra en cada copia; los encabezados con la
llave se conservan y no hay que volver a pegarlos.

Dos atajos rápidos le ganan a uno lento. Pero empiece por el que pidió y decida
con el uso, no de antemano.

---

## Disparadores

| Método | Dónde | Velocidad |
|---|---|---|
| **Botón de Acción** | Ajustes → Botón de Acción → Atajo → `Registrar` | La más rápida |
| **Centro de Control** | Añadir control → Atajo | Muy rápida |
| **Widget** | Widget de Atajos en la pantalla de inicio | Rápida |
| **Siri** | «Oye Siri, Registrar» | Manos libres |

---

## Los otros dos atajos

**Deshacer** — dos acciones, y el que más va a agradecer:

1. *Obtener contenido de la URL* → `POST .../rpc/undo_last`, los tres encabezados,
   **sin cuerpo**
2. *Mostrar notificación* → `Borrado: L [monto]`

**Transferencia** — para pagar la tarjeta de crédito, que no es un gasto:

- *Elegir de la lista* (cuentas) → `p_from`
- *Elegir de la lista* (cuentas) → `p_to`
- *Pedir entrada*, Número → `p_amount`
- URL: `.../rpc/transfer` · claves de salida `saldo_origen` y `saldo_destino`

---

## Si algo falla

| Síntoma | Causa |
|---|---|
| `Categoría de gasto no encontrada` | El nombre no existe en la base. Con `v5` el emoji y las tildes ya no son el problema; revise que la categoría exista. |
| `Cuenta no encontrada` | El texto no coincide con ninguna cuenta. Las cuentas son `Banco Atlántida`, `BAC Débito`, `BAC Crédito`, `Efectivo`. |
| `401` / `JWT cryptographic operation failed` | El encabezado `Authorization` está mal armado. Es `Bearer`, un espacio, la llave. Sin `+`. |
| `Empty or invalid json` | El cuerpo quedó en «Formulario» en vez de JSON. |
| Todo devuelve `404` | Falta la barra: es `/rest/v1/rpc/`, no `/rest/v1/rpc`. |
| `disponible` sale vacío | Esa categoría no tiene presupuesto. Es correcto. |
| Nada responde tras días sin usarlo | El proyecto se pausó por inactividad. Se reactiva desde el panel de Supabase. |
