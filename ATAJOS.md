# Atajo de iPhone — entradas y salidas

> **Requiere los apéndices F e I aplicados** (`supabase/migrations/`).
> Sin F, las cuentas nuevas no existen y las categorías no tienen emoji. Desde
> el I, la anon key sola ya no abre nada: el atajo tiene que iniciar sesión con
> tu correo y tu contraseña antes de cada registro.

## Por qué va a mano

Desde iOS 15 los archivos `.shortcut` van firmados, y la firma solo se hace desde
un Mac. Un archivo generado en Windows no se importaría. Esto es lo que sí sirve:
los valores exactos.

## Antes de empezar

Mándese al teléfono la anon key (Supabase → Settings → API → **anon public**) y
esta URL base, que son lo único largo de teclear:

```
https://dabvugwhzwkmdmsvrazz.supabase.co
```

Además van a hacer falta tu usuario y tu contraseña del libro. El atajo habla
directo con Supabase, que no sabe de usuarios cortos: ahí el usuario va
completo, seguido de `@hetchk69.github.io`.

**Los tres encabezados** van en toda llamada a una función. En *Obtener
contenido de la URL*, método `POST`, sección *Encabezados*:

| Clave | Valor |
|---|---|
| `apikey` | *(la anon key)* |
| `Authorization` | la palabra `Bearer`, **un espacio**, y la variable `token` |
| `Content-Type` | `application/json` |

`token` sale de las acciones 0a–0c de abajo. Antes del apéndice I aquí iba la
anon key; ahora va el token de la sesión, y la anon key se queda solo en
`apikey`. En `Authorization` no va ningún `+`: es `Bearer`, un espacio, y la
variable insertada desde el botón de variables.

Y en *Cuerpo de la solicitud* elija **JSON**, nunca «Formulario» — si queda en
formulario, Supabase responde `Empty or invalid json`.

### Acciones 0a–0c — iniciar sesión

Van **al principio de todo**, antes de la primera pregunta. Así, si no hay señal
o la contraseña cambió, el atajo falla antes de que usted escriba nada.

**0a. Obtener contenido de la URL**

- URL: `https://dabvugwhzwkmdmsvrazz.supabase.co/auth/v1/token?grant_type=password`
- Método `POST`, cuerpo **JSON**, y solo **dos** encabezados:

| Clave | Valor |
|---|---|
| `apikey` | *(la anon key)* |
| `Content-Type` | `application/json` |

| Clave del cuerpo | Tipo | Valor |
|---|---|---|
| `email` | Texto | *tu usuario*`@hetchk69.github.io`, en minúsculas |
| `password` | Texto | *tu contraseña* |

**0b. Obtener valor del diccionario** → clave `access_token`

**0c. Definir variable** → nombre `token`

Cuesta un viaje de red, medio segundo, antes de la primera pregunta. El token
dura una hora, pero el atajo pide uno nuevo en cada corrida: guardarlo entre
corridas exigiría un archivo en iCloud y lógica de vencimiento que no vale la
pena por medio segundo.

> **La contraseña queda escrita en el atajo**, en claro. Es el mismo lugar
> donde antes estaba la anon key, y lo que la protege es lo mismo: el Face ID
> del teléfono. Si algún día cambia la contraseña del libro, hay que cambiarla
> aquí también — y en los otros atajos que tengan este bloque.

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
Banco Atlántida Débito
BAC Débito
Efectivo
```

> BAC Crédito no aparece aquí a propósito: meter dinero a una tarjeta de crédito
> no es un ingreso, es pagar la tarjeta. Eso es una transferencia.

**6. Dividir texto** → **Líneas nuevas**

**7. Elegir de la lista** → Preguntar: `¿A qué cuenta?`

**8. Texto** — categorías de ingreso:
```
🏛️ DIGER
🏢 CCONCASA
💻 Desarrollo
🔧 Instalaciones
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
Banco Atlántida Débito
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
Se duplica este y se borra la rama que sobra en cada copia; el bloque 0a–0c y
los encabezados se conservan y no hay que volver a armarlos.

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

Los dos empiezan con el mismo bloque **0a–0c** para iniciar sesión. Lo más
rápido es duplicar `Registrar` y borrar todo lo que viene después de 0c.

**Deshacer** — el que más va a agradecer:

1. *Obtener contenido de la URL* → `POST .../rest/v1/rpc/undo_last`, los tres
   encabezados, **sin cuerpo**
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
| `Invalid login credentials` en 0a | El usuario o la contraseña del cuerpo no coinciden. Revisa que `email` lleve el `@hetchk69.github.io` y vaya en minúsculas. |
| `Email not confirmed` en 0a | Al crear el usuario faltó marcar «Auto Confirm User». Se confirma desde Authentication → Users. |
| `401` / `JWT cryptographic operation failed` | El encabezado `Authorization` está mal armado. Es `Bearer`, un espacio, la variable `token`. Sin `+`. |
| `401` con `No autorizado.` | En `Authorization` quedó la anon key en vez del token, o el bloque 0a–0c no está antes de la llamada. |
| `401` con `Falta anotar al dueño` | El apéndice I no encontró exactamente un usuario cuando se corrió. Córralo otra vez en el SQL Editor. |
| `Empty or invalid json` | El cuerpo quedó en «Formulario» en vez de JSON. |
| Todo devuelve `404` | La ruta de las funciones es `/rest/v1/rpc/` seguida del nombre; la de 0a es `/auth/v1/token?grant_type=password`. |
| `disponible` sale vacío | Esa categoría no tiene presupuesto. Es correcto. |
| Nada responde tras días sin usarlo | El proyecto se pausó por inactividad. Se reactiva desde el panel de Supabase. |
