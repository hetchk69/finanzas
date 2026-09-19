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
`quanto_v2.sql`.

Si algún día quieres el sitio de verdad tras una puerta: **Cloudflare Pages +
Cloudflare Access** da login por correo gratis hasta 50 usuarios. Es la única vía
gratuita a un sitio realmente privado.

| Archivo | Qué es |
|---|---|
| `index.html` | El tablero. Un solo archivo, instalable en la pantalla de inicio |
| `quanto_v2.sql` | Complemento a pegar en el SQL Editor de Supabase |
| `ATAJOS.md` | Hoja de armado de los atajos de iPhone |
| `.nojekyll` | Que GitHub Pages sirva los archivos tal cual |

**No hay ninguna anon key escrita en esta carpeta**, a propósito: así se puede
publicar entera sin filtrar nada. La llave se pega una vez en cada dispositivo.

---

## Estado

### Funcionando y verificado

El script base está aplicado en el proyecto `dabvugwhzwkmdmsvrazz`. Probé las seis
RPC una por una con la anon key y deshice cada prueba — la base quedó en cero
movimientos:

| RPC | Resultado |
|---|---|
| `get_lists` | 10 categorías de gasto, 2 de ingreso, 4 cuentas |
| `cycle_summary` | ciclo, 5 presupuestos, 4 saldos |
| `log_expense` | insertó y devolvió `disponible` |
| `log_income` | insertó y devolvió `saldo` |
| `transfer` | movió saldo entre cuentas |
| `undo_last` | borró el último; con tabla vacía, `Sin movimientos` |

El blindaje de tablas y vistas es correcto: `anon` recibe `42501 permission denied`
en `transactions`, `accounts`, `settings` y todas las vistas.

### Falta hacer

1. **Aplicar `quanto_v2.sql`** (SQL Editor → pegar → Run)
2. **Armar los atajos** siguiendo `ATAJOS.md`

Publicar el tablero ya está hecho: vive en
<https://hetchk69.github.io/finanzas/> y se verificó contra el proyecto real
(cargó ciclo, presupuestos y saldos). Falta añadirlo a la pantalla de inicio del
teléfono — Safari → Compartir → Añadir a pantalla de inicio.

---

## 1. `quanto_v2.sql`

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

Un archivo sin dependencias salvo las tipografías. Muestra el ciclo con barra de
avance, neto/ingresos/gastos, presupuestos con medidor y estado, gasto por día,
saldos, metas y el libro de movimientos. Tocar un movimiento lo abre para corregir
o eliminar. También registra gasto, ingreso y transferencia, y deshace el último.

Si `quanto_v2.sql` no está aplicado, **no se rompe**: lo detecta, avisa y sigue
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

## 3. Los atajos

Ver `ATAJOS.md`. Resumen de por qué van a mano: desde iOS 15 los archivos
`.shortcut` van firmados y la firma solo se hace desde un Mac, así que un archivo
generado en Windows no se puede importar.

---

## Pendiente de decidir

- **Los saldos iniciales están todos en 0**, así que las cuentas se van a negativo
  con el primer gasto — se vio en la prueba (Efectivo quedó en −175.50).
  `update accounts set initial_balance = 4500 where name = 'Efectivo';`
- **El día de pago sigue en 1.** Con el v2 aplicado: `select set_cycle_day(25);`
- **Presupuestos**: solo cinco categorías tienen límite (Comida 4000, Supermercado
  6000, Transporte 2000, Combustible 3000, Ocio 2500). Las demás devuelven
  `disponible` vacío, que es correcto pero conviene saberlo.
- **El proyecto se pausa a los ~7 días sin actividad** en el tier gratis. Si se
  registra a diario, nunca pasa.

## Descartado por el camino

- **Artifact publicado**: la CSP del visor bloquea todo `fetch` fuera de su lista
  blanca, así que una página publicada ahí no puede hablar con Supabase.
- **Supabase Storage**: devuelve HTML como texto plano a propósito en el plan
  gratis, por abuso de páginas engañosas. No sirve para publicar el tablero.
- **Generar archivos `.shortcut`**: firmados desde iOS 15, no se importarían.
