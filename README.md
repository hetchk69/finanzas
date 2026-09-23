# Quanto DIY — tracker de gastos personal

Réplica casera de [Quanto](https://quanto.app/) sobre Supabase, en lempiras.
Captura por Apple Shortcuts, lectura por un tablero web.

**En vivo:** <https://hetchk69.github.io/finanzas/>

**Este proyecto es independiente del portal de DIGER.** Carpeta hermana, git
propio, cero archivos compartidos.

## Por qué el repo es público

Porque en GitHub «privado» no compra privacidad aquí:

- **Pages sobre repo privado exige GitHub Pro** ($4/mes). En plan gratis, solo
  repos públicos.
- Y aun pagando, **el sitio publicado sigue siendo público**: restringir el acceso
  al sitio de Pages es exclusivo de Enterprise Cloud. El repo privado solo
  escondería el código fuente, no la URL.

Como el código no lleva ninguna anon key, esconderlo no protege nada. Lo que
protege de verdad son los permisos de las funciones RPC — por eso importa aplicar
el apéndice B.

Si algún día quieres el sitio de verdad tras una puerta: **Cloudflare Pages +
Cloudflare Access** da login por correo gratis hasta 50 usuarios. Es la única vía
gratuita a un sitio realmente privado.

| Archivo | Qué es |
|---|---|
| `index.html` | El tablero: estilos, Preact+htm incrustados y el punto de montaje |
| `app.js` | La aplicación: componentes, hooks y las llamadas RPC |
| `supabase/migrations/` | Los apéndices, versionados y en orden de aplicación |
| `supabase/config.toml` | Apunta el CLI al proyecto de la nube |
| `ATAJOS.md` | Hoja de armado de los atajos de iPhone |
| `.nojekyll` | Que GitHub Pages sirva los archivos tal cual |

**No hay ninguna anon key escrita en esta carpeta**, a propósito: así se puede
publicar entera sin filtrar nada. La llave se pega una vez en cada dispositivo.

---

## Estado

### Funcionando y verificado

**Los apéndices B, C, D y F están aplicados en `dabvugwhzwkmdmsvrazz`.** El E
no — quedó superado antes de correrlo (ver su archivo y la sección 4).

| RPC | Resultado |
|---|---|
| `get_lists` | 10 categorías de gasto (con emoji), 4 de ingreso (con emoji), 5 cuentas |
| `cycle_summary` | ciclo, presupuestos, saldos |
| `dashboard` | ciclo, ritmo, presupuestos, saldos, metas, serie diaria, asientos — todo con icono |
| `desglose` | total y desglose por categoría y cuenta en cualquier rango |
| `log_expense` / `log_income` | aceptan `"🍽️ Comida"`, `"comida"` o `"Comida"` por igual (`norm()`) |
| `transfer` | movió saldo entre cuentas |
| `undo_last` | borra el último; con tabla vacía, `Sin movimientos` |

Probadas una por una con la anon key, deshechas después. El blindaje de tablas y
vistas es correcto: `anon` recibe `42501 permission denied` en `transactions`,
`accounts`, `settings`, `goals` y todas las vistas; `run_recurring()` sigue
rechazando con 401.

**Cuentas reales**: Banco Atlántida (solo débito), BAC Débito, BAC Crédito,
Efectivo, Ahorros. **Categorías de ingreso**: Salario, Instalación, Desarrollo,
Otros.

### Falta hacer

1. **Armar los atajos** siguiendo `ATAJOS.md` — es lo único pendiente

El tablero ya está publicado en <https://hetchk69.github.io/finanzas/> y
verificado contra el proyecto real, con los emojis puestos. Falta añadirlo a la
pantalla de inicio del teléfono — Safari → Compartir → Añadir a pantalla de
inicio.

---

## 0. El esquema y las migraciones

Los apéndices viven en `supabase/migrations/`, con el nombre en orden de
aplicación. Se aplican con el CLI, sin Docker y sin la contraseña de Postgres —
el CLI se aprovisiona un rol de login temporal con el token de la API:

```bash
npx supabase@latest link --project-ref dabvugwhzwkmdmsvrazz
npx supabase@latest db push
```

**El orden no es decorativo.** El apéndice B revoca `execute` en bloque y después
otorga una lista explícita donde `desglose` no aparece, porque nació en el C. En
orden B → C → D → F todo queda bien, porque C, D y F otorgan su propio permiso al
final — F además vuelve a revocar y otorgar todo, así que re-aplicarlo solo ya
deja los permisos completos. Re-aplicar el B **solo**, después de los demás, deja
`desglose` (y las funciones del F) sin permiso y el tablero deja de cargar. Si
pasa, basta re-aplicar el F: revoca y otorga la lista completa.

**El E es un no-op.** Se escribió, se decidió un diseño distinto antes de
correrlo, y el archivo quedó como constancia — `select 1;` y nada más. `db push`
lo ejecuta sin efecto. El apéndice F es el que reemplaza su función.

**Lo que no está aquí es el script base.** La base se construyó pegando SQL en el
SQL Editor y el historial de migraciones remoto está vacío, así que estas tres no
reconstruyen el proyecto desde cero: dan por hecho que las tablas ya existen.
Extraer el base con `db pull` o `db dump` exige Docker, que esta máquina no tiene.

`db push` sí funciona sin Docker, porque no necesita base sombra.

---

## 1. El apéndice B

Idempotente, no toca nada de lo existente. Cuatro cosas:

### a. Un hueco de seguridad real

El script base hace `revoke all on all functions in schema public from anon,
authenticated`, y **eso no cierra nada**: Postgres concede `EXECUTE` a `PUBLIC` por
defecto en cada función nueva, y `anon` hereda de `PUBLIC`. Revocarle a `anon` su
permiso directo lo deja igual de habilitado por herencia.

Comprobado: `POST /rest/v1/rpc/run_recurring` con la anon key devolvió `0`
— ejecución exitosa, cuando debía ser 401. Hoy el daño es nulo porque no hay reglas
recurrentes activas; en cuanto exista una, cualquiera con la llave puede adelantar
sus inserciones. La línea que sí cierra es el `revoke ... from public`.

Después de correrlo, esta llamada debe fallar con 401/403:

```bash
curl -X POST "https://dabvugwhzwkmdmsvrazz.supabase.co/rest/v1/rpc/run_recurring" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
```

### b. Metas de ahorro

Tabla `goals` + vista `v_metas`. Lo ahorrado *es* el saldo de la cuenta de tipo
`ahorro`, no un contador paralelo: una transferencia a Ahorros mueve la meta sin
pasos extra. Calcula cuánto falta, días restantes y la cuota mensual para llegar
a tiempo.

### c. Edición de movimientos

`edit_transaction(p_id, ...)` y `delete_transaction(p_id)`. `undo_last` solo
alcanza el último; esto cubre el monto mal tecleado de hace tres días.

### d. `dashboard()`

Una sola llamada con ciclo, resumen, presupuestos, saldos, categorías, metas,
serie diaria y últimos movimientos. `cycle_summary()` se dejó intacta porque los
atajos dependen de su forma exacta.

Extras: `set_budget`, `set_cycle_day`, `set_goal`, `delete_goal` — para no volver
al SQL Editor por un presupuesto o el día de pago.

---

## 2. El tablero

`index.html` + `app.js`, construido con **Preact + htm incrustados** (12 KB, sin
paso de compilación y sin CDN en tiempo de ejecución). Componentes, hooks y listas
con key; la única dependencia externa son las tipografías.

**Tinta azul sobre papel, tema único y claro.** La idea de libro de cuentas la
sostienen el papel y los renglones reglados, no el color; el azul es el de la
tinta y el rojo queda reservado para el sobregiro. No hay variante oscura por
decisión: `color-scheme:light` en `:root` es obligatorio para que un teléfono en
modo oscuro no pinte los controles nativos en oscuro sobre este papel.

**El elemento firma es el medidor de ritmo.** Pone dos marcas en una misma escala:
dónde va el ciclo y dónde va el gasto. Si el gasto adelanta al calendario, pasa a
tinta roja. Cada sobre de presupuesto lleva además su propia marca de ritmo, así
que no solo dice cuánto queda sino si vas adelantado. Esa es la pregunta que un
presupuesto debe responder, y la primera versión no la respondía nunca.

Tipografías: **Archivo** y **JetBrains Mono**, con cifras tabulares y el signo de
lempira subordinado al número.

### Dos vistas

**Libro** — el ciclo, el ritmo, los presupuestos, el gasto por día, los saldos,
las metas y el libro de asientos. Tocar un asiento lo abre para corregir o
eliminar; tocar un sobre abre su límite. También registra gasto, ingreso y
transferencia, y deshace el último.

**Gráficos** — un rango de fechas (por defecto el mes calendario) y cuatro donas:
gasto por categoría, presupuesto del ciclo usado contra disponible, cuánto del
gasto cae en categorías vigiladas, y gasto por cuenta. Abajo, el desglose por
categoría donde cada fila abre su límite.

### Por qué las donas no usan el color de cada categoría

Se validó la paleta con herramienta en vez de a ojo. La de la base **falla**:
Combustible y Transporte dan ΔE 11.3 en visión normal — por debajo de 15, difíciles
de distinguir incluso sin daltonismo. Y no hay reemplazo: diez tonos categóricos
mutuamente separables no existen; ni siete equiespaciados en el espacio perceptual
lo logran.

Así que las donas **codifican magnitud, no identidad**: una rampa secuencial de un
solo azul, de oscuro a claro según el monto, monótona por construcción (verificada,
no supuesta). Va con el rango recortado a propósito: estirarla hasta el azul pálido
deja el paso más claro en 1.35 de contraste sobre tarjeta blanca, o sea invisible.
Debajo de los arcos hay una pista teñida para que los pasos claros tengan borde. La
identidad la llevan la leyenda y las etiquetas, donde cada categoría sí conserva su
color. El sobrante va tramado en vez de gris, porque un neutro de baja saturación
siempre queda cerca de algún tono.

Si el apéndice B no está aplicado, **no se rompe**: lo detecta, avisa y sigue
sirviendo con lo que expone el script base.

**Verificado en navegador**: registró un gasto de L 175.50 en Comida (notificación
`quedan L 3,824.50`, saldo actualizado) y lo deshizo.

### Primer arranque en un dispositivo

La página arranca sin llave y la pide. Dos formas de dárselas:

- **Enlace de alta**: abrir la URL con `#k=<anon key>` al final. La guarda y borra
  el fragmento de la barra de direcciones en el acto. El fragmento (`#`) nunca
  viaja al servidor, así que la llave no queda en ningún registro de acceso.
- **A mano**: desplegar «Conexión» al final de la página y pegarla.

Queda en el navegador de ese dispositivo. Para borrarla, vaciar los datos del sitio.

### Pantalla de inicio

En Safari: **Compartir → Añadir a pantalla de inicio**. Queda como app «Lempiras»
con su icono, a pantalla completa y sin barra de Safari.

---

## 3. El apéndice F

Reemplaza al E antes de que este llegara a correr. Cuatro cosas:

### a. Cuentas que existen de verdad

Banco Atlántida solo tiene débito; BAC tiene débito y crédito. Por eso «débito»
a secas es ambiguo, y las cuentas se nombran por banco e instrumento juntos:
`Banco Atlántida`, `BAC Débito`, `BAC Crédito`, `Efectivo`. Una sola lista sirve
a entradas y salidas — si fueran dos listas distintas, el dinero entraría a un
banco y saldría de otro lado, y los saldos no significarían nada. `BAC Crédito`
no aparece como destino de un ingreso a propósito: meter dinero a una tarjeta de
crédito no es un ingreso, es pagarla, y eso es una transferencia.

Las cuentas viejas (`Débito`, `Crédito`) se renombraron a `BAC Débito` / `BAC
Crédito` en vez de borrarse, para no soltar los movimientos que ya tenían
colgando.

### b. Categorías de ingreso y el choque de «Otros»

Salario, Instalación, Desarrollo, Otros. Como «Otros» necesita existir en gasto
*y* en ingreso, el `UNIQUE` de `categories` pasó de ser sobre `name` a ser sobre
`(name, kind)`. Eso destapó un bug latente: `log_expense` buscaba la categoría
solo por nombre, sin filtrar por tipo, así que con «Otros» en ambos lados podía
agarrar la equivocada. Ya filtra por `kind`.

### c. Emojis con `norm()`

Los emojis van en la columna `icon`, que estaba sin usar — el nombre sigue
siendo el dato, el emoji la presentación. `norm()` quita el emoji inicial, las
tildes y las mayúsculas antes de comparar, así que el atajo puede mandar
`"🍽️ Comida"`, `"Comida"` o `"comida"` y las tres encuentran lo mismo. Sin esto,
la captura fallaba con «Categoría no encontrada» sin decir por qué — es lo que
pasó la primera vez que el atajo mandó el emoji y la base no lo esperaba.

### d. El tablero pinta el emoji en vez del punto de color

`dashboard()` y `desglose()` devuelven `icono` junto a cada categoría. En la
interfaz, el emoji reemplaza al punto de color cuando existe: identifica igual
de rápido y evita que diez tonos saturados peleen con el azul del cromo.

---

## 4. Los atajos

Ver `ATAJOS.md`. Resumen de por qué van a mano: desde iOS 15 los archivos
`.shortcut` van firmados y la firma solo se hace desde un Mac, así que un archivo
generado en Windows no se puede importar.

---

## Pendiente de decidir

- **Los saldos iniciales de las cuentas nuevas están en 0.** `Banco Atlántida`
  se creó así; las viejas `BAC Débito`/`BAC Crédito` heredaron el saldo que ya
  tenían. Se corrige con
  `update accounts set initial_balance = <monto real> where name = '<cuenta>';`
- **El día de pago sigue en 1.** `select set_cycle_day(<día>);`
- **Presupuestos**: solo las categorías de gasto originales tienen límite; ni
  Salario ni las demás categorías de ingreso lo necesitan (los ingresos no se
  presupuestan en este diseño). Ver «Ajustar Sobre» en el tablero, o
  `select set_budget('<categoría>', <monto>);`
- **El proyecto se pausa a los ~7 días sin actividad** en el tier gratis. Si se
  registra a diario, nunca pasa.

## Descartado por el camino

- **Artifact publicado**: la CSP del visor bloquea todo `fetch` fuera de su lista
  blanca, así que una página publicada ahí no puede hablar con Supabase.
- **Supabase Storage**: devuelve HTML como texto plano a propósito en el plan
  gratis, por abuso de páginas engañosas. No sirve para publicar el tablero.
- **Generar archivos `.shortcut`**: firmados desde iOS 15, no se importarían.
