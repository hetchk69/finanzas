---
name: libro-de-lempiras
description: Reglas de diseño e interfaz del tablero Libro de Lempiras (hetchk69/finanzas). Úsala siempre que vayas a tocar index.html o app.js, o cuando se hable de cómo se ve el tablero, de una pantalla, una tabla, una gráfica, un color, un estado vacío, una tarjeta o la portada — aunque no se mencionen ni el diseño ni esta skill. También antes de agregar una sección nueva al Libro o a Gráficos, o de escribir un apéndice SQL que alimente la pantalla. Sin ella, el tablero deriva hacia la plantilla genérica que este proyecto lleva meses esquivando.
---

# Libro de Lempiras

Tracker de gastos personal de un solo usuario, en lempiras. Una página sin
compilación —`index.html` con los estilos y Preact+htm incrustados, más
`app.js`— publicada en GitHub Pages contra Supabase por funciones RPC. Se abre
veinte veces al día desde la pantalla de inicio de un iPhone, casi siempre
justo después de registrar un gasto desde el atajo. **La página no registra**:
desde octubre de 2026 todo entra por el atajo, y el tablero es para mirar,
corregir un asiento y ajustar límites. No vuelvas a agregar un formulario de
captura, un botón flotante de «Registrar» ni «Deshacer el último».

Eso último manda sobre todo lo demás: **es una app de teléfono que se consulta
en segundos**, no un panel de control que se estudia.

## El problema que estas reglas resuelven

La deriva por defecto de cualquier tablero es la misma: tarjetas blancas con el
mismo radio y la misma sombra, apiladas en una columna, todas pesando igual. Se
ve ordenado y no dice nada. El dueño de este proyecto lo nombró con precisión —
«no me gusta que parezca IA»— y tenía razón.

La salida no es decorar más, es **tomar prestado el oficio**: un libro de
contabilidad de verdad tiene renglones alternos, reglas de columna, cifras
alineadas y una fila de cierre. Cada regla de abajo sale de ahí.

## Lo visual

**Tinta azul sobre papel, tema único claro.** La metáfora la sostienen el papel
y los renglones reglados, no el color. El azul `--accent` es el de la tinta.
`color-scheme:light` en `:root` no es opcional: sin él, un teléfono en modo
oscuro pinta los controles nativos —`date`, `select`— en oscuro sobre este
papel, y el navegador puede invertir la página entera por su cuenta. No hay
variante oscura, por decisión.

**El rojo está reservado.** `--over` se usa para el sobregiro y el déficit, y
para nada más. Si todo puede ponerse rojo, el rojo deja de avisar.

**Tipografía: Archivo para texto, Manrope para cifras**, con
`font-variant-numeric:tabular-nums` en cualquier columna de números — si no
alinean, el ojo no puede comparar. Manrope es proporcional: sin `tabular-nums`
los montos de una lista no quedan uno debajo del otro. La excepción es la cifra
que va sola, sin columna (la grande del medidor, el total de Gráficos): ahí van
cifras proporcionales, porque con las tabulares los «1» quedan con hueco. Hasta
octubre de 2026 las cifras iban en JetBrains Mono, y se cambió porque parecían
una terminal. El signo de lempira va subordinado al número: más chico, en
`--ink3`, nunca del tamaño de la cifra.

**Las listas son pliegos.** Presupuestos, cuentas, metas y asientos van
dentro de `.pliego`: una hoja blanca con su borde y su sombra
corta, puesta sobre un fondo `--hundido` con margen de papel alrededor.
Renglones alternos (`li:nth-child(odd)`) y separación punteada. La banda va en
la fila, no en el botón interior: si va en el botón, termina donde termina su
relleno y deja un filo blanco contra el canto de la hoja. Sobre una fila ya
teñida, el hover tiene que bajar a `--hundido` para verse.

**Cada lista se lee como en el papel.** Los asientos van por día, con
encabezados «Hoy», «Ayer», «sáb 17 oct» y lo que salió ese día; la banda alterna
cuenta solo los asientos (`:nth-child(odd of .fila)`), no los encabezados. Las
cuentas cierran con una fila de total bajo doble raya, porque es de los datos
que más importan. Los presupuestos van del más gastado al menos: arriba el
porcentaje, abajo «gastado de límite» y la diferencia sola, sin la palabra
«quedan» (negativa y en rojo si se pasó). Una meta dice cuánto falta, no solo
cuánto hay.

**Semáforo: verde, amarillo, rojo, con una sola regla.** Verde hasta 59 %,
amarillo de 60 a 99 %, rojo desde 100 %, igual para la tarjeta principal y para
cada presupuesto, así nunca se contradicen. El color va en la barra y en el filo
de la tarjeta, nunca en la categoría; el texto queda en tinta, salvo el rojo.
El amarillo es `--amarillo` (#B08600), el más claro que llega a 3:1 contra la
pista de la barra: uno más brillante baja a 2:1 y la barra casi no se ve. El
rojo sigue reservado para el límite alcanzado.

**Usa la tarjeta con criterio.** Borde, relleno, radio y sombra marcan un
elemento como objeto aparte. Aplicarlos a todo aplana la jerarquía. Hoy el
medidor de ritmo y el balance del ciclo son tarjetas; las listas son pliegos; el
resto vive sobre el papel.

## Las gráficas

**Barras horizontales ordenadas, no donas.** Hasta octubre de 2026 Gráficos eran
cinco donas apiladas; se cambiaron porque el ojo compara largos y no ángulos,
porque la lista que decía qué porción era cuál quedaba cuatro tarjetas más
abajo, y porque tres repetían la misma cifra en el centro. Cada fila lleva el
nombre con su emoji, el monto y, debajo, la barra con su parte del total: la
fila misma hace de leyenda.

**Una sola serie, un solo color.** Todas las barras van en `--accent`; el largo
ya dice cuánto. La rampa por monto que usaban las donas teñía categorías sin
orden según su tamaño, y repetía el dato que el largo ya daba. La cola pasa de
seis filas a «Resto (n)», al final y en tinta apagada; si la cola es de una sola
fila, va con su nombre.

**Un gráfico de una sola porción es un número.** Con una sola fila no hay nada
que comparar: va como frase («Todo entró por 💼 Salario: L 29,000.00»). Lo que
antes era una dona entera para decir «todo en categorías con límite» ahora es la
nota de la tarjeta.

**Gráficos no mezcla ventanas de tiempo.** Contesta adónde se fue la plata en el
rango elegido. El presupuesto vive en el ciclo y tiene su lugar en el Libro; por
eso Gráficos no muestra límites ni porcentajes contra el límite.

**Dos series con órdenes de magnitud distintos no comparten escala.** Un salario
de cinco cifras junto a almuerzos de doscientos deja las barras de gasto pegadas
al suelo. Por eso la cinta diaria marca las entradas con un triángulo —presencia,
no magnitud— y la magnitud la lleva el balance de arriba. La cinta no tiene eje:
rotula solo el día más caro, y lo resalta.

## La pantalla

**Primero el teléfono.** Se diseña a 375px; el escritorio es el caso secundario.
Nada de desbordamiento horizontal: tablas, código y diagramas van cada uno en su
propio contenedor con `overflow-x:auto`.

**Una pantalla, una pregunta, un número.** La portada contesta «cuánto llevo
hoy». Lo demás baja a 13px. Si tres cifras compiten por el mismo tamaño, ninguna
gana.

**La tarjeta principal, en este orden:** «Llevas gastado» con la cifra
grande; el comentario con su porcentaje; lo gastado de lo presupuestado; y la
barra con la marca de «hoy». Nada más: la proyección al cierre se quitó a pedido
del dueño. Los diez comentarios son suyos, uno por décimo del presupuesto y
leídos «al llegar a»: por debajo de 20 % «No has gastado», 20 % «Bueno, algo has
gastado», 30 % «Mmm seguís», 40 % «Vamo' a Calmarlo», 50 % «Holdup», 60 % «Ya
casi se te va», 70 % «Calmaaaaa», 80 % «Muerto», 90 % «Muerto X2», desde 100 %
«Muerto X3». El tono es suyo y no se corrige.

**El vacío invita, no informa.** Con el libro en cero, «No has gastado · 0 %»
es cierto e inútil. Un estado vacío dice qué va a aparecer ahí y cómo
poner lo primero.

**Las fechas se escriben como habla la gente.** `lun 19 oct · quedan 12 días`,
no `2026-10-01 — 2026-10-31 · día 19 de 31`. El formato ISO es para la base.

## Los datos

**El emoji vive en `categories.icon`, nunca dentro del nombre.** El nombre es el
dato; el emoji es presentación, y cambiarlo no debe romper nada. `get_lists()`
los pega al vuelo para el atajo. La función `norm()` compara ignorando emoji,
tildes y mayúsculas — pero no el número gramatical: «Instalaciones» nunca va a
encontrar «Instalación».

**Los días se cuentan en hora de Honduras.** Supabase vive en UTC; desde el
apéndice J la base está en `America/Tegucigalpa`. Antes, todo lo registrado
desde las 6 de la tarde quedaba con la fecha del día siguiente, porque el atajo
no manda fecha y las funciones toman `current_date`. Si alguna vez la fecha de
un movimiento sale corrida un día, lo primero es revisar
`select current_setting('TimeZone')`.

**Dinero en `numeric(12,2)`, nunca `float`.** En el front se formatea, no se
redondea.

**Las transferencias no son ni entrada ni salida.** Mueven saldo entre cuentas
propias. No entran en el balance del ciclo, ni en el gasto por categoría, ni en
las barras de Gráficos.

**Cada pieza degrada sola.** Si el apéndice que la alimenta no está aplicado, la
sección no se dibuja y el resto sigue sirviendo. Nunca una pantalla en blanco
por una clave que no vino: `Array.isArray(des.entradas) && …`.

## Cómo trabajar aquí

**Verifica en navegador antes de dar algo por bueno**, a 375px y con datos
falsos si la base está vacía. Sirve una copia con `fetch` interceptado en vez de
tocar datos reales. Este proyecto encontró así un `<option>` sin `value` que
dejaba los tres selectores sin selección y mandaba categoría y cuenta vacías: en
el código se veía correcto, en el DOM era `selectedIndex: -1`.

**El SQL va en apéndices idempotentes**, en `supabase/migrations/`, numerados en
orden de aplicación y con el porqué escrito en comentarios. El orden importa.

**Desde el apéndice I, toda función se otorga a `authenticated`, nunca a
`anon`.** El I le quitó todo a `anon` y se lo dio a quien inició sesión; la
anon key quedó pública en `app.js` y no abre nada. Un apéndice nuevo que
otorgue algo a `anon` se lo regala a cualquiera que abra ver-fuente.

Por la misma razón, **no se vuelven a correr B, C, D, F ni H**: todos otorgan a
`anon`. B y F además revocan en bloque y le quitarían todo a `authenticated`,
dejando al dueño sin libro y al público con él. Si pasa por accidente, correr
el I otra vez lo deshace: recorre el catálogo y mueve lo que encuentre.

**Nombres de dominio en español** —`gastos`, `categorias`, `monto`, `asientos`,
`sobres`, `pliego`—; los términos técnicos quedan en inglés cuando ya lo son.
Los comentarios explican por qué, no qué.

**Componentes chicos.** Si uno pasa de 150 líneas, se parte.

## Qué no hacer

- No agregues librerías: Preact y htm van incrustados, sin build y sin CDN en
  tiempo de ejecución. La única dependencia externa son las tipografías.
- No metas modo oscuro, ni siquiera «por completitud».
- No uses `localStorage` para datos de gastos. La fuente de verdad es Postgres;
  `localStorage` es solo para la sesión, el correo recordado y la pestaña.
- No guardes la contraseña en ningún lado: la página solo guarda los tokens de
  la sesión de Supabase Auth.
- La anon key va en la constante `ANON` de `app.js` y es pública a propósito.
  Lo que no puede ir en el repo es nada que abra el libro: la contraseña, la
  `service_role` key, ni el correo del dueño (el apéndice I lo adopta solo).
- No agregues clasificación automática ni IA. El usuario elige la categoría.
- No edites un apéndice ya aplicado; escribe el siguiente.
- No uses emoji como viñeta de sección ni centres todo. Ese es justo el aspecto
  que este proyecto está evitando.
