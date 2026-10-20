/* ============================================================
   Libro de Lempiras — aplicación
   Preact + htm, componentes y hooks. Sin paso de compilación.
   ============================================================ */
const { html, render, useState, useEffect, useMemo, useRef, useCallback } = htmPreact;

/* ---------- conexión ---------- */
const URL_ = "https://dabvugwhzwkmdmsvrazz.supabase.co";

/* La anon key va escrita aquí, a la vista, y eso está bien — pero SOLO
   después de aplicar el apéndice I. Ese apéndice le quita todo a `anon`:
   desde ahí la llave solo sirve para tocar la puerta de Supabase Auth, y la
   credencial real es tu usuario y tu contraseña. Antes del I, publicarla le
   regala el libro entero a quien abra ver-fuente.
   Mientras esté vacía, se usa la que cada dispositivo ya tenía pegada. */
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhYnZ1Z3doendrbWRtc3ZyYXp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3ODQxOTUsImV4cCI6MjEwNTM2MDE5NX0.ZyjeYaM9bLcOQi10rs9m3LK7vephyzT4jfzz9aXJBwk";

const ls = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
const lset = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const ldel = (k) => { try { localStorage.removeItem(k); } catch {} };

const LLAVE = ANON || ls("quanto.key", "");
if (ANON) ldel("quanto.key");
ldel("quanto.url");
ldel("quanto.correo");

/* ---------- sesión ----------
   Supabase Auth por su API REST, sin supabase-js: el proyecto no carga
   librerías en tiempo de ejecución, y lo que hace falta son tres llamadas.
   En localStorage queda la sesión —los dos tokens y cuándo vence el corto—,
   nunca la contraseña. El refresh_token no caduca solo: la sesión dura hasta
   que se cierre a mano, que es justo lo que se pidió para no escribir la
   contraseña cada vez. */
let sesion = null;
try { sesion = JSON.parse(ls("quanto.sesion", "") || "null"); } catch {}

function guardarSesion(x) {
  sesion = x;
  if (x) lset("quanto.sesion", JSON.stringify(x)); else ldel("quanto.sesion");
}

async function auth(ruta, cuerpo, token) {
  const r = await fetch(`${URL_}/auth/v1/${ruta}`, {
    method: "POST",
    headers: { apikey: LLAVE, "Content-Type": "application/json",
               ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const txt = await r.text();
  let j = null;
  try { j = txt ? JSON.parse(txt) : null; } catch {}
  if (!r.ok) {
    const e = new Error(j?.msg || j?.error_description || j?.message || `HTTP ${r.status}`);
    e.status = r.status; e.code = j?.error_code || j?.error;
    throw e;
  }
  return j;
}

const aSesion = (t) => ({
  access_token: t.access_token,
  refresh_token: t.refresh_token,
  /* expires_at viene en segundos; hay versiones que solo mandan expires_in. */
  vence: t.expires_at ? t.expires_at * 1000 : Date.now() + (t.expires_in || 3600) * 1000,
  correo: t.user?.email || sesion?.correo || "",
});

/* Supabase Auth entra con correo, pero aquí se escribe un usuario. Lo que no
   trae @ se completa con el dominio del propio sitio: es de hetchk69, nadie
   más puede recibir correo ahí, y en el panel el usuario se crea como
   <usuario>@hetchk69.github.io. Se pasa a minúsculas porque el teclado del
   iPhone pone mayúscula a la primera letra y Supabase guarda el correo en
   minúsculas. Un correo completo, con @, pasa tal cual. */
const DOMINIO = "hetchk69.github.io";
const aCorreo = (u) => {
  const x = u.trim().toLowerCase();
  return x.includes("@") ? x : `${x}@${DOMINIO}`;
};
const aUsuario = (c) => String(c || "").replace(`@${DOMINIO}`, "");

async function entrar(correo, clave) {
  guardarSesion(aSesion(await auth("token?grant_type=password", { email: correo, password: clave })));
}

/* Un solo refresco en vuelo. Al abrir, el tablero lanza dos o tres llamadas
   a la vez; si cada una refrescara por su cuenta gastarían el mismo
   refresh_token —que Supabase rota en cada uso— y alguna perdería. */
let refrescando = null;
function refrescar() {
  if (!refrescando) {
    refrescando = auth("token?grant_type=refresh_token", { refresh_token: sesion.refresh_token })
      .then((t) => guardarSesion(aSesion(t)))
      .finally(() => { refrescando = null; });
  }
  return refrescando;
}

async function salir() {
  const t = sesion?.access_token;
  guardarSesion(null);
  if (t) { try { await auth("logout", null, t); } catch {} }
}

/* Cuando la sesión se cae del todo —el refresh_token ya no sirve— no hay
   nada que reintentar: la App vuelve a pedir usuario y contraseña. */
let alPerderSesion = () => {};
const sinSesion = () => Object.assign(new Error("La sesión se cerró. Vuelve a entrar."), { status: 401 });

async function asegurarSesion() {
  if (!sesion) { alPerderSesion(); throw sinSesion(); }
  try { await refrescar(); }
  catch (e) {
    /* Sin red no se saca a nadie: el refresh_token sigue sirviendo y el
       próximo intento con señal lo usa. Solo un rechazo del servidor quiere
       decir que la sesión murió. */
    if (!e.status) throw e;
    guardarSesion(null); alPerderSesion(); throw sinSesion();
  }
}

async function rpc(fn, body, reintento = true) {
  if (!sesion) { alPerderSesion(); throw sinSesion(); }
  /* Se refresca con un minuto de margen en vez de esperar al 401: el token
     corto dura una hora y el tablero se queda abierto mucho más. */
  if (sesion.vence - Date.now() < 60000) await asegurarSesion();

  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: LLAVE, Authorization: `Bearer ${sesion.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  /* Un 401 con sesión es casi siempre un token vencido antes de tiempo
     (el teléfono dormido, el reloj corrido): se refresca y se reintenta una
     vez. Si el segundo también es 401, el motivo es otro —por ejemplo "falta
     anotar al dueño"— y se muestra tal cual en vez de sacar al usuario. */
  if (r.status === 401 && reintento) {
    await asegurarSesion();
    return rpc(fn, body, false);
  }
  const txt = await r.text();
  let j = null;
  try { j = txt ? JSON.parse(txt) : null; } catch {}
  if (!r.ok) {
    const e = new Error(j?.message || `HTTP ${r.status}`);
    e.code = j?.code; e.status = r.status;
    throw e;
  }
  return j;
}
const faltaV2 = (e) => e.status === 404 || e.code === "PGRST202";

/* ---------- formato ---------- */
const nf = new Intl.NumberFormat("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("es-HN", { maximumFractionDigits: 0 });
const L = (n) => nf.format(Number(n || 0));

/* get_lists() pega el emoji al nombre para que el atajo lo muestre; dashboard()
   devuelve el nombre pelado. Comparar los dos en crudo dejaba las diez
   categorías listadas como "sin límite" —incluidas las cinco que sí tenían— y
   mandaba el emoji dentro del nombre a set_budget. */
const sinEmoji = (x) => String(x || "").replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "").trim();
const norm = (x) => sinEmoji(x).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/* El folio se lee, no se descifra: el rango ISO es para la base. */
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
               "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function folio(c) {
  const m = Number(String(c.desde).split("-")[1]);
  const restan = Math.max(c.dias_total - c.dia_actual, 0);
  const cola = restan === 0 ? "último día" : restan === 1 ? "queda 1 día" : `quedan ${restan} días`;
  const nombre = MESES[m - 1] || "";
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} · ${cola}`;
}
const pct = (n) => `${nf0.format(Number(n || 0))}%`;
const HOY = new Date().toLocaleDateString("en-CA");
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/* new Date("2026-10-17") lee la fecha en UTC y en Honduras cae el día
   anterior; armándola por partes queda en la hora local. */
const aFecha = (x) => { const [a, m, d] = String(x).split("-").map(Number); return new Date(a, m - 1, d); };
const fechaCorta = (x) => { const f = aFecha(x); return `${f.getDate()} ${MES[f.getMonth()]}`; };
const mesAnio = (x) => { const f = aFecha(x); return `${MESES[f.getMonth()]} ${f.getFullYear()}`; };
function diaHumano(x) {
  const f = aFecha(x), h = aFecha(HOY);
  const dif = Math.round((h - f) / 864e5);
  if (dif === 0) return "Hoy";
  if (dif === 1) return "Ayer";
  const anio = f.getFullYear() !== h.getFullYear() ? ` ${f.getFullYear()}` : "";
  return `${DIAS[f.getDay()]} ${f.getDate()} ${MES[f.getMonth()]}${anio}`;
}

/* ============================================================
   Piezas
   ============================================================ */

function Regla({ etiqueta, children }) {
  return html`
    <div class="regla">
      <h2>${etiqueta}</h2>
      <span class="regla-linea"></span>
      ${children ? html`<span class="regla-dato">${children}</span>` : null}
    </div>`;
}

/* El emoji reemplaza al punto de color cuando existe: identifica igual de
   rápido y evita que diez tonos saturados peleen con el azul del cromo. */
function Marca({ icono, color }) {
  return icono
    ? html`<i class="marca" aria-hidden="true">${icono}</i>`
    : html`<i class="punto" style=${`--c:${color || "var(--ink3)"}`}></i>`;
}

function Cifra({ valor, signo = false, tono = "", tam = "" }) {
  const n = Number(valor || 0);
  const t = tono || (n < 0 ? "rojo" : "");
  return html`<span class=${`cifra ${tam} ${t}`}>
    <i>L</i>${signo && n > 0 ? "+" : ""}${L(n)}
  </span>`;
}

/* Las dos caras del libro: lo que entró y lo que salió en el ciclo, con el
   neto debajo. `dashboard()` ya mandaba los dos totales desde el apéndice B
   y la página solo pintaba el gasto. Las transferencias no cuentan en
   ninguna de las dos: mueven saldo entre cuentas propias, no entra ni sale
   un lempira. */
function Balance({ resumen }) {
  const entro = Number(resumen.ingresos) || 0;
  const salio = Number(resumen.gastos) || 0;
  if (!entro && !salio) return null;
  const n = Number(resumen.movimientos) || 0;

  return html`
    <section>
      <${Regla} etiqueta="Balance del ciclo">
        ${n === 1 ? "1 movimiento" : `${n} movimientos`}
      <//>
      <div class="balance">
        <div class="caras">
          <div class="cara">
            <span class="cara-rotulo">Entró</span>
            <${Cifra} valor=${entro} tam="md" tono=${entro > 0 ? "tinta" : ""} />
          </div>
          <div class="cara salio">
            <span class="cara-rotulo">Salió</span>
            <${Cifra} valor=${salio} tam="md" />
          </div>
        </div>
        <div class="balance-neto">
          <span>Neto</span>
          <${Cifra} valor=${entro - salio} signo=${true} tam="md" />
        </div>
      </div>
    </section>`;
}

/* El elemento firma: dos marcas en una misma escala — dónde va el ciclo
   y dónde va el gasto. Si el gasto adelanta al calendario, tinta roja.
   Una sola cifra grande contesta "cuánto llevo"; lo demás queda subordinado.
   Antes había tres del mismo tamaño y ninguna ganaba. */
function Ritmo({ ciclo, presupuestos, onRegistrar }) {
  const limite = presupuestos.reduce((a, b) => a + Number(b.limite), 0);
  const gastado = presupuestos.reduce((a, b) => a + Number(b.gastado), 0);
  if (!limite) return null;

  /* Con el ciclo en blanco no hay veredicto que dar: "Vas holgado · L 0.00"
     es cierto e inútil. En su lugar, qué va a aparecer aquí y cómo empezar. */
  if (!gastado) {
    return html`
      <section class="ritmo estreno">
        <p class="estreno-titulo">El ciclo está sin estrenar.</p>
        <p class="estreno-queva">Al primer gasto vas a ver aquí cuánto llevas de los <b>L ${L(limite)}</b> que te pusiste, y si vas adelantado al calendario.</p>
        <button class="btn primario" type="button" onClick=${onRegistrar}>Anotar el primero</button>
      </section>`;
  }

  const pGasto = Math.min((100 * gastado) / limite, 100);
  const pCiclo = Math.min((100 * ciclo.dia_actual) / ciclo.dias_total, 100);
  const delta = pGasto - pCiclo;
  const estado = delta > 8 ? "sobre" : delta < -8 ? "holgado" : "a-ritmo";
  const leyenda = { sobre: "Vas sobre el ritmo", holgado: "Vas holgado", "a-ritmo": "Vas a ritmo" }[estado];
  /* La proyección sale de la misma base que la cifra grande —lo gastado en
     categorías con límite—. Antes venía del gasto total del ciclo, así que las
     dos cifras de la tarjeta no hablaban de lo mismo. */
  const proyeccion = (gastado / Math.max(ciclo.dia_actual, 1)) * ciclo.dias_total;

  return html`
    <section class=${`ritmo ${estado}`}>
      <p class="ritmo-rotulo">Llevas gastado</p>
      <${Cifra} valor=${gastado} tam="gr" />
      <p class="ritmo-veredicto"><b>${leyenda}</b> · de L ${L(limite)} presupuestados</p>

      <div class="escala" role="img"
           aria-label=${`Gastado ${pct(pGasto)} del presupuesto, ciclo ${pct(pCiclo)} transcurrido`}>
        <div class="escala-pista">
          <div class="escala-gasto" style=${`width:${pGasto}%`}></div>
          <div class="escala-ciclo" style=${`left:${pCiclo}%`}><span>hoy</span></div>
        </div>
        <div class="escala-pie">
          <span>${pct(pGasto)} gastado</span>
          <span>${pct(pCiclo)} del ciclo</span>
        </div>
      </div>

      <p class="ritmo-cierre">A este paso el ciclo cierra en <b>L ${L(proyeccion)}</b>.</p>
    </section>`;
}

/* Ajuste del límite mensual. set_budget crea el presupuesto si la categoría
   no tenía, y lo desactiva cuando se manda 0 — el CHECK de la tabla no
   admite límite cero, así que "ninguno" se expresa desactivando. */
function AjustarSobre({ cat, onCerrar, onHecho, onError }) {
  const ref = useRef(null);
  const nuevo = cat.limite == null;
  const [limite, setLimite] = useState(nuevo ? "" : String(Number(cat.limite)));
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const d = ref.current;
    d.showModal();
    const cancelar = (e) => { e.preventDefault(); onCerrar(); };
    d.addEventListener("cancel", cancelar);
    return () => d.removeEventListener("cancel", cancelar);
  }, []);

  async function guardar(ev) {
    ev.preventDefault();
    const n = parseFloat(limite);
    if (!(n > 0)) return onError("El límite debe ser mayor que cero");
    setOcupado(true);
    try { await rpc("set_budget", { p_category: cat.categoria, p_limit: n });
          onHecho(`${cat.categoria}: límite L ${L(n)}`); }
    catch (e) { onError(e.message); }
    finally { setOcupado(false); }
  }

  async function quitar() {
    if (!confirm(`¿Quitar el presupuesto de ${cat.categoria}? Los gastos se siguen registrando, pero ya no habrá límite que avisar.`)) return;
    setOcupado(true);
    try { await rpc("set_budget", { p_category: cat.categoria, p_limit: 0 });
          onHecho(`${cat.categoria} ya no tiene presupuesto`); }
    catch (e) { onError(e.message); }
    finally { setOcupado(false); }
  }

  return html`
    <dialog ref=${ref} class="hoja">
      <form onSubmit=${guardar}>
        <h2>${nuevo ? "Nuevo presupuesto para" : "Presupuesto de"} ${cat.categoria}</h2>
        ${!nuevo && Number(cat.gastado) > 0 && html`
          <p class="hoja-nota">Llevas L ${L(cat.gastado)} gastados en este ciclo.</p>`}
        <label class="campo ancho monto">
          <span>Límite mensual</span>
          <div class="monto-caja"><i>L</i>
            <input type="number" step="1" min="1" inputmode="decimal" autofocus
                   value=${limite} onInput=${(e) => setLimite(e.target.value)}
                   placeholder="0" required />
          </div>
        </label>
        <div class="hoja-pie">
          <button class="btn primario" type="submit" disabled=${ocupado}>Guardar</button>
          <button class="btn" type="button" onClick=${onCerrar}>Cancelar</button>
          ${!nuevo && html`
            <button class="btn peligro" type="button" onClick=${quitar} disabled=${ocupado}>Quitar</button>`}
        </div>
      </form>
    </dialog>`;
}

/* "excedido", no "sobre": el elemento ya se llama .sobre y una clase de
   estado con el mismo nombre colapsaría el selector. */
function estadoSobre(b, ciclo) {
  const p = Number(b.pct_usado) || 0;
  const pCiclo = (100 * ciclo.dia_actual) / ciclo.dias_total;
  return p > 100 ? "excedido" : p > pCiclo + 8 ? "adelantado" : "bien";
}

/* Lo que se está pasando va arriba: excedidos, después los que van
   adelantados al calendario, y al final los que van bien; dentro de cada
   grupo, el más gastado primero. En orden fijo, el único excedido podía
   quedar tercero de cinco. */
const URGENCIA = { excedido: 0, adelantado: 1, bien: 2 };
const ordenarSobres = (lista, ciclo) => [...lista].sort((a, b) =>
  URGENCIA[estadoSobre(a, ciclo)] - URGENCIA[estadoSobre(b, ciclo)]
  || Number(b.pct_usado) - Number(a.pct_usado));

/* El color de la barra dice el estado, no la categoría: con un tono de
   azul distinto por categoría parecía que el tono codificaba algo, y no.
   La identidad ya la lleva el emoji. */
function Sobre({ b, ciclo, animar, onAjustar }) {
  const p = Number(b.pct_usado) || 0;
  const disp = Number(b.disponible);
  const pCiclo = (100 * ciclo.dia_actual) / ciclo.dias_total;
  const estado = estadoSobre(b, ciclo);

  return html`
    <li class=${`sobre ${estado}`}>
      <button class="sobre-btn" type="button"
              aria-label=${`Ajustar el presupuesto de ${b.categoria}`}
              onClick=${() => onAjustar({ categoria: b.categoria, limite: b.limite, gastado: b.gastado })}>
      <div class="sobre-cab">
        <span class="sobre-nombre">
          <${Marca} icono=${b.icono} color=${b.color} />${b.categoria}
        </span>
        <span class="sobre-restante">
          ${p > 100 ? "excedido " : "quedan "}
          <${Cifra} valor=${Math.abs(disp)} tono=${p > 100 ? "rojo" : ""} />
        </span>
      </div>
      <div class="barra">
        <div class="barra-relleno" style=${`width:${animar ? Math.min(p, 100) : 0}%`}></div>
        <i class="barra-ritmo" style=${`left:${Math.min(pCiclo, 100)}%`} title="ritmo del ciclo"></i>
      </div>
      <div class="sobre-pie">
        <span>${L(b.gastado)} de ${L(b.limite)}</span>
        <span class="sobre-pct">${pct(p)}${estado === "adelantado" ? " · adelantado" : ""}</span>
      </div>
      </button>
    </li>`;
}

/* La barra mide el gasto del día; el triángulo de arriba marca que ese día
   entró dinero. Marca y no barra a propósito: un salario de cinco cifras en
   la misma escala que un almuerzo de doscientos deja todas las barras de
   gasto pegadas al suelo. La magnitud de las entradas la lleva el balance
   de arriba; acá solo importa cuándo cayeron. */
function Cinta({ serie, ciclo }) {
  const max = Math.max(...serie.map((d) => Number(d.gastos) || 0), 0);
  const conEntrada = serie.filter((d) => Number(d.ingresos) > 0).length;
  if (max <= 0 && !conEntrada) {
    return html`<p class="vacio">Sin movimientos en este ciclo. El primero que registres aparece aquí.</p>`;
  }
  const conGasto = serie.filter((d) => Number(d.gastos) > 0).length;
  const promedio = conGasto
    ? serie.reduce((a, d) => a + Number(d.gastos || 0), 0) / conGasto
    : 0;
  /* Las barras no llevan escala, y sin una cifra no se sabe cuánto mide la
     más alta. Se rotula solo esa —el extremo— y se resalta, en vez de
     poner un número sobre cada día. */
  const pico = max > 0 ? serie.find((d) => Number(d.gastos) === max) : null;

  return html`
    <div class="cinta">
      ${pico && html`
        <p class="cinta-cab">El día más caro: ${diaHumano(pico.dia).toLowerCase()}, <${Cifra} valor=${max} /></p>`}
      <div class="cinta-barras" role="img"
           aria-label=${`Gasto diario, máximo ${L(max)}.` +
                        (conEntrada ? ` ${conEntrada} ${conEntrada === 1 ? "día" : "días"} con entrada.` : "")}>
        ${serie.map((d) => {
          const g = Number(d.gastos) || 0;
          const e = Number(d.ingresos) || 0;
          const h = g > 0 && max > 0 ? Math.max((100 * g) / max, 3) : 0;
          const hoy = d.dia === HOY;
          const esPico = pico && d.dia === pico.dia;
          return html`
            <div class=${`dia ${hoy ? "hoy" : ""} ${g > 0 ? "con" : ""} ${esPico ? "pico" : ""}`} key=${d.dia}
                 title=${`${diaHumano(d.dia)}: L ${L(g)}` + (e ? ` · entró L ${L(e)}` : "")}>
              ${e > 0 ? html`<span class="dia-entrada" aria-hidden="true"></span>` : null}
              <div class="dia-barra" style=${`height:${h}%`}></div>
            </div>`;
        })}
      </div>
      <div class="cinta-pie">
        <span>${fechaCorta(ciclo.desde)}</span>
        <span class="cinta-prom">
          ${conGasto ? `promedio L ${L(promedio)} por día con gasto` : "sin gastos todavía"}
        </span>
        <span>${fechaCorta(ciclo.hasta)}</span>
      </div>
    </div>`;
}

function Asiento({ m, onAbrir }) {
  const titulo = m.tipo === "transferencia"
    ? "Transferencia"
    : `${m.icono ? m.icono + " " : ""}${m.categoria || "—"}`;
  const det = m.tipo === "transferencia"
    ? `${m.cuenta} › ${m.cuenta_destino}`
    : m.cuenta;
  const extra = [m.nota, m.recurrente ? "recurrente" : null].filter(Boolean).join(" · ");

  return html`
    <li class="fila">
      <button class="asiento" type="button" onClick=${() => onAbrir(m)}>
        <span class="asiento-glosa">
          <b>${titulo}</b>
          <small>${det}${extra ? ` · ${extra}` : ""}</small>
        </span>
        <span class=${`asiento-monto ${m.tipo}`}>
          ${m.tipo === "ingreso" ? "+" : m.tipo === "gasto" ? "−" : ""}${L(m.monto)}
        </span>
      </button>
    </li>`;
}

/* Un libro diario se lee por día. Los movimientos ya vienen del más
   nuevo al más viejo, así que basta con cortar donde cambia la fecha. */
function agruparPorDia(movs) {
  const grupos = [];
  for (const m of movs) {
    const g = grupos[grupos.length - 1];
    if (g && g.fecha === m.fecha) g.items.push(m);
    else grupos.push({ fecha: m.fecha, items: [m] });
  }
  return grupos;
}

/* Lo que una meta tiene que contestar es cuánto falta y a qué ritmo. Antes
   mostraba lo ahorrado y una fecha ISO, y el objetivo ni aparecía, aunque
   v_metas lo manda desde el apéndice B. */
function metaPie(m) {
  if (m.falta != null && Number(m.falta) <= 0) return "completa";
  const partes = [];
  if (m.falta != null) partes.push(`faltan L ${L(m.falta)}`);
  if (m.fecha_objetivo) partes.push(`para ${mesAnio(m.fecha_objetivo)}`);
  if (m.cuota_mensual != null) partes.push(`L ${L(m.cuota_mensual)}/mes`);
  return partes.join(" · ") || "sin fecha";
}

function Esqueleto({ filas = 3 }) {
  return html`<div class="esqueleto" aria-hidden="true">
    ${Array.from({ length: filas }, (_, i) => html`<div class="esq-fila" key=${i}></div>`)}
  </div>`;
}

/* ---------- desglose por categoría en un rango ---------- */
const iso = (d) => d.toLocaleDateString("en-CA");
function mes(desplazamiento = 0) {
  const n = new Date();
  return {
    desde: iso(new Date(n.getFullYear(), n.getMonth() + desplazamiento, 1)),
    hasta: iso(new Date(n.getFullYear(), n.getMonth() + desplazamiento + 1, 0)),
  };
}
function ultimosDias(n) {
  const h = new Date();
  const d = new Date(); d.setDate(d.getDate() - (n - 1));
  return { desde: iso(d), hasta: iso(h) };
}

/* Más de seis filas ya no se comparan de un vistazo: la cola se pliega en
   «Resto», que va al final aunque sume más que alguna de arriba. Si la cola
   es de una sola fila, va con su nombre: «Resto (1)» no le dice nada a nadie. */
const TOPE = 6;
function plegar(items, n = TOPE) {
  const vivos = items
    .filter((i) => Number(i.monto) > 0)
    .sort((a, b) => Number(b.monto) - Number(a.monto));
  const cola = vivos.slice(n);
  if (cola.length < 2) return vivos;
  const suma = cola.reduce((a, i) => a + Number(i.monto), 0);
  return [...vivos.slice(0, n), { nombre: `Resto (${cola.length})`, monto: suma, resto: true }];
}

/* Barras horizontales ordenadas, no donas. El ojo compara largos, no
   ángulos, y el nombre con su monto en la misma fila hace de leyenda: ya no
   hay porción que no se sepa qué es. Una sola serie va en un solo color —el
   largo ya dice cuánto, y teñir por monto repetía el dato—. Con una sola fila
   no hay nada que comparar, y una barra entera para decir «todo» es un
   gráfico de adorno: va como frase. */
function Barras({ items, total, frase = "Todo en", vacio }) {
  if (!items.length) return vacio ? html`<p class="vacio">${vacio}</p>` : null;
  if (items.length === 1) {
    const [i] = items;
    return html`
      <p class="barras-uno">${frase} ${i.icono ? `${i.icono} ` : ""}<b>${i.nombre}</b>: <${Cifra} valor=${i.monto} /></p>`;
  }
  const max = Math.max(...items.map((i) => Number(i.monto)));
  return html`
    <ul class="barras">
      ${items.map((i) => {
        const v = Number(i.monto);
        const parte = total ? pct((100 * v) / total) : "—";
        return html`
          <li key=${i.nombre} class=${i.resto ? "resto" : ""} title=${`${i.nombre}: L ${L(v)} · ${parte} del total`}>
            <span class="barras-nombre">
              ${i.icono ? html`<i class="marca" aria-hidden="true">${i.icono}</i>` : null}${i.nombre}
            </span>
            <${Cifra} valor=${v} />
            <span class="barras-pista"><span class="barras-relleno" style=${`width:${(100 * v) / max}%`}></span></span>
            <span class="barras-parte">${parte}</span>
          </li>`;
      })}
    </ul>`;
}

function Tarjeta({ titulo, nota, children }) {
  return html`
    <figure class="grafico">
      <figcaption>
        <b>${titulo}</b>
        ${nota ? html`<span>${nota}</span>` : null}
      </figcaption>
      ${children}
    </figure>`;
}

/* Gráficos contesta adónde se fue la plata en el rango elegido. El
   presupuesto vive en el ciclo, no en el rango: mezclarlo aquí ponía dos
   ventanas de tiempo en la misma pantalla, y ya tiene su lugar en el Libro. */
function Graficos({ des, cargando, onRango }) {
  if (!des) return html`<${Esqueleto} filas=${2} />`;
  /* Cada pieza degrada sola: un desglose sin totales o sin rango avisa, en
     vez de tumbar la pantalla con un error de JavaScript. */
  if (!des.totales || !des.rango || !Array.isArray(des.categorias)) {
    return html`<p class="alerta"><b>El desglose vino incompleto.</b>
      Revisa que el apéndice H esté aplicado.</p>`;
  }
  const total = Number(des.totales.gastos) || 0;
  const r = des.rango;

  const porCategoria = plegar(des.categorias.map((c) =>
    ({ nombre: c.categoria, icono: c.icono, monto: Number(c.total) })));
  const sinGasto = des.categorias.filter((c) => !(Number(c.total) > 0)).map((c) => c.categoria);

  /* Lo que antes era una dona entera para decir «todo»: cuánto del gasto
     cayó donde ningún límite avisa. Es una cifra, así que va como nota. */
  const sinLim = des.categorias.filter((c) => c.limite == null)
                               .reduce((a, c) => a + Number(c.total), 0);
  const notaLimite = !total ? null
    : sinLim > 0 ? `L ${L(sinLim)} en categorías sin límite`
    : "todo en categorías con límite";

  /* Solo si se aplicó el apéndice D; si no, esta tarjeta simplemente no está. */
  const porCuenta = Array.isArray(des.cuentas)
    ? plegar(des.cuentas.map((c) => ({ nombre: c.cuenta, monto: Number(c.total) })))
    : null;

  /* Igual con el apéndice H y las entradas. Viene solo con las categorías
     que tuvieron movimiento, así que una lista vacía significa que en este
     rango no entró nada — no que falte la función. */
  const entro = Number(des.totales.ingresos) || 0;
  const porOrigen = Array.isArray(des.entradas) && des.entradas.length
    ? plegar(des.entradas.map((c) => ({ nombre: c.categoria, icono: c.icono, monto: Number(c.total) })))
    : null;

  const presets = [
    ["Este mes", mes(0)],
    ["Mes pasado", mes(-1)],
    ["30 días", ultimosDias(30)],
    ["Este año", { desde: `${new Date().getFullYear()}-01-01`, hasta: `${new Date().getFullYear()}-12-31` }],
  ];
  const activo = (p) => p.desde === r.desde && p.hasta === r.hasta;

  return html`
    <div class=${`desglose ${cargando ? "cargando" : ""}`}>
      <div class="rangos">
        ${presets.map(([n, p]) => html`
          <button key=${n} type="button" class=${activo(p) ? "sel" : ""}
                  aria-pressed=${activo(p)} onClick=${() => onRango(p)}>${n}</button>`)}
      </div>
      <div class="rango-fechas">
        <label><span>Desde</span>
          <input type="date" value=${r.desde} onChange=${(e) => onRango({ desde: e.target.value, hasta: r.hasta })} />
        </label>
        <label><span>Hasta</span>
          <input type="date" value=${r.hasta} onChange=${(e) => onRango({ desde: r.desde, hasta: e.target.value })} />
        </label>
      </div>

      <p class="rango-resumen">
        <b><${Cifra} valor=${total} tam="gr" /></b>
        <span>en ${r.dias} ${r.dias === 1 ? "día" : "días"} · ${des.totales.movimientos} movimientos
              · promedio L ${L(total / Math.max(r.dias, 1))} por día</span>
        ${entro > 0 ? html`
          <span class="rango-entro">
            entró <${Cifra} valor=${entro} tono="tinta" /> · neto
            <${Cifra} valor=${entro - total} signo=${true} />
          </span>` : null}
      </p>

      <div class="graficos">
        <${Tarjeta} titulo="Gasto por categoría" nota=${notaLimite}>
          <${Barras} items=${porCategoria} total=${total} frase="Todo fue a"
                     vacio="Sin gastos en este rango. Registra uno y aparece aquí." />
          ${total > 0 && sinGasto.length ? html`
            <p class="barras-cero">Sin gasto: ${sinGasto.join(", ")}.</p>` : null}
        <//>

        ${porCuenta && html`
          <${Tarjeta} titulo="Gasto por cuenta">
            <${Barras} items=${porCuenta} total=${total} frase="Todo salió de"
                       vacio="Sin gastos en este rango." />
          <//>`}

        ${porOrigen && html`
          <${Tarjeta} titulo="De dónde entró">
            <${Barras} items=${porOrigen} total=${entro} frase="Todo entró por" />
          <//>`}
      </div>
    </div>`;
}

/* ---------- captura ---------- */
function Captura({ listas, saldos, onHecho, onError, refMonto }) {
  const [tipo, setTipo] = useState("gasto");
  const [monto, setMonto] = useState("");
  const [cat, setCat] = useState("");
  const [cuenta, setCuenta] = useState("");
  const [destino, setDestino] = useState("");
  const [fecha, setFecha] = useState(HOY);
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cats = tipo === "ingreso" ? listas.ingresos : listas.gastos;

  /* `get_lists` solo devuelve nombres de cuenta; el tipo viene en los saldos
     de `dashboard()`. */
  const tipoDe = useMemo(() => {
    const m = {};
    (saldos || []).forEach((x) => { m[x.cuenta] = x.tipo; });
    return m;
  }, [(saldos || []).map((x) => `${x.cuenta}:${x.tipo}`).join("|")]);

  /* Una tarjeta de crédito no recibe ingresos: meterle dinero es pagarla, y
     eso es una transferencia, no una entrada. El atajo del teléfono ya la
     excluye de su lista y lo deja dicho; esto hace que la web concuerde.
     En transferencia sí aparece, porque pagar la tarjeta es exactamente eso. */
  const cuentas = tipo === "ingreso"
    ? listas.cuentas.filter((c) => tipoDe[c] !== "credito")
    : listas.cuentas;

  /* La cuenta preferida depende del tipo: un gasto sale del efectivo, pero una
     quincena cae al banco. Antes la pestaña heredaba la cuenta del movimiento
     anterior, así que pasar de Gasto a Ingreso dejaba "Efectivo" puesto y el
     salario entero podía quedar registrado en la mano. */
  useEffect(() => {
    if (!cuentas.length) return;
    const pref = tipo === "ingreso"
      ? cuentas.find((c) => tipoDe[c] === "debito") || cuentas[0]
      : cuentas.includes("Efectivo") ? "Efectivo" : cuentas[0];
    setCuenta(pref);
  }, [tipo, cuentas.join("|")]);

  useEffect(() => {
    if (!listas.cuentas.length) return;
    const otras = listas.cuentas.filter((c) => c !== "Efectivo");
    setDestino((d) => d || (otras.includes("Ahorros") ? "Ahorros" : otras[0] || ""));
  }, [listas.cuentas.join("|")]);

  useEffect(() => { setCat(cats[0] || ""); }, [tipo, cats.join("|")]);

  async function enviar(ev) {
    ev.preventDefault();
    const n = parseFloat(monto);
    if (!(n > 0)) return onError("El monto debe ser mayor que cero");
    if (tipo === "transferencia" && cuenta === destino) return onError("Origen y destino deben ser distintos");

    const args = tipo === "transferencia"
      ? { p_amount: n, p_from: cuenta, p_to: destino }
      : { p_amount: n, p_category: cat, p_account: cuenta };
    if (nota.trim()) args.p_note = nota.trim();
    if (fecha && fecha !== HOY) args.p_date = fecha;

    const fn = tipo === "gasto" ? "log_expense" : tipo === "ingreso" ? "log_income" : "transfer";
    setEnviando(true);
    try {
      const r = await rpc(fn, args);
      setMonto(""); setNota("");
      onHecho(
        tipo === "gasto"
          ? r.disponible == null ? `L ${L(n)} en ${r.categoria}` : `L ${L(n)} en ${r.categoria} · quedan L ${L(r.disponible)}`
          : tipo === "ingreso" ? `L ${L(n)} en ${r.cuenta} · saldo L ${L(r.saldo)}`
          : `Transferido L ${L(n)} · origen L ${L(r.saldo_origen)}`
      );
    } catch (e) { onError(e.message); }
    finally { setEnviando(false); }
  }

  const esTrans = tipo === "transferencia";
  return html`
    <form class="captura" onSubmit=${enviar}>
      <div class="pestanas" role="tablist">
        ${["gasto", "ingreso", "transferencia"].map((t) => html`
          <button key=${t} type="button" role="tab" aria-selected=${tipo === t}
                  onClick=${() => setTipo(t)}>${t[0].toUpperCase() + t.slice(1)}</button>`)}
      </div>

      <div class="campos">
        <label class="campo monto">
          <span>Monto</span>
          <div class="monto-caja">
            <i>L</i>
            <input ref=${refMonto} type="number" step="0.01" min="0.01" inputmode="decimal"
                   value=${monto} onInput=${(e) => setMonto(e.target.value)}
                   placeholder="0.00" required />
          </div>
        </label>

        ${/* El `value` explícito en cada <option> no es decorativo: sin él Preact
             deja el atributo en blanco, el <select> no encuentra con qué casar
             su valor y se queda en selectedIndex -1. Se veía como un selector
             vacío al cargar, y al enviar sin tocarlo viajaba categoría y cuenta
             en blanco. */ ""}
        ${!esTrans && html`
          <label class="campo">
            <span>Categoría</span>
            <select value=${cat} onChange=${(e) => setCat(e.target.value)}>
              ${cats.map((c) => html`<option key=${c} value=${c}>${c}</option>`)}
            </select>
          </label>`}

        <label class="campo">
          <span>${esTrans ? "Desde" : "Cuenta"}</span>
          <select value=${cuenta} onChange=${(e) => setCuenta(e.target.value)}>
            ${cuentas.map((c) => html`<option key=${c} value=${c}>${c}</option>`)}
          </select>
        </label>

        ${esTrans && html`
          <label class="campo">
            <span>Hacia</span>
            <select value=${destino} onChange=${(e) => setDestino(e.target.value)}>
              ${listas.cuentas.map((c) => html`<option key=${c} value=${c}>${c}</option>`)}
            </select>
          </label>`}

        <label class="campo">
          <span>Fecha</span>
          <input type="date" value=${fecha} onInput=${(e) => setFecha(e.target.value)} />
        </label>

        <label class="campo ancho">
          <span>Nota</span>
          <input type="text" value=${nota} onInput=${(e) => setNota(e.target.value)} placeholder="opcional" />
        </label>
      </div>

      <button class="btn primario" type="submit" disabled=${enviando}>
        ${enviando ? "Registrando…" : "Registrar"}
      </button>
    </form>`;
}

/* ---------- corregir un asiento ---------- */
function Corregir({ mov, listas, onCerrar, onHecho, onError }) {
  const ref = useRef(null);
  const [monto, setMonto] = useState(String(Number(mov.monto)));
  const [cat, setCat] = useState(mov.categoria || "");
  const [cuenta, setCuenta] = useState(mov.cuenta || "");
  const [fecha, setFecha] = useState(mov.fecha);
  const [nota, setNota] = useState(mov.nota || "");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const d = ref.current;
    d.showModal();
    const esc = (e) => { if (e.key === "Escape") { e.preventDefault(); onCerrar(); } };
    d.addEventListener("cancel", (e) => { e.preventDefault(); onCerrar(); });
    d.addEventListener("keydown", esc);
    return () => d.removeEventListener("keydown", esc);
  }, []);

  const cats = mov.tipo === "ingreso" ? listas.ingresos : listas.gastos;

  async function guardar(ev) {
    ev.preventDefault();
    const n = parseFloat(monto);
    if (!(n > 0)) return onError("El monto debe ser mayor que cero");
    const args = { p_id: mov.id, p_amount: n, p_account: cuenta, p_date: fecha, p_note: nota.trim() };
    if (mov.tipo !== "transferencia") args.p_category = cat;
    setOcupado(true);
    try { await rpc("edit_transaction", args); onHecho("Asiento corregido"); }
    catch (e) { onError(e.message); }
    finally { setOcupado(false); }
  }

  async function borrar() {
    if (!confirm(`¿Eliminar este movimiento de L ${L(mov.monto)}? No se puede deshacer.`)) return;
    setOcupado(true);
    try { await rpc("delete_transaction", { p_id: mov.id }); onHecho("Asiento eliminado"); }
    catch (e) { onError(e.message); }
    finally { setOcupado(false); }
  }

  return html`
    <dialog ref=${ref} class="hoja">
      <form onSubmit=${guardar}>
        <h2>Corregir asiento</h2>
        <div class="campos">
          <label class="campo monto">
            <span>Monto</span>
            <div class="monto-caja"><i>L</i>
              <input type="number" step="0.01" min="0.01" inputmode="decimal" autofocus
                     value=${monto} onInput=${(e) => setMonto(e.target.value)} required />
            </div>
          </label>
          <label class="campo">
            <span>Fecha</span>
            <input type="date" value=${fecha} onInput=${(e) => setFecha(e.target.value)} />
          </label>
          ${mov.tipo !== "transferencia" && html`
            <label class="campo">
              <span>Categoría</span>
              <select value=${cat} onChange=${(e) => setCat(e.target.value)}>
                ${cats.map((c) => html`<option key=${c} value=${c}>${c}</option>`)}
              </select>
            </label>`}
          <label class="campo">
            <span>Cuenta</span>
            <select value=${cuenta} onChange=${(e) => setCuenta(e.target.value)}>
              ${listas.cuentas.map((c) => html`<option key=${c} value=${c}>${c}</option>`)}
            </select>
          </label>
          <label class="campo ancho">
            <span>Nota</span>
            <input type="text" value=${nota} onInput=${(e) => setNota(e.target.value)} placeholder="opcional" />
          </label>
        </div>
        <div class="hoja-pie">
          <button class="btn primario" type="submit" disabled=${ocupado}>Guardar</button>
          <button class="btn" type="button" onClick=${onCerrar}>Cancelar</button>
          <button class="btn peligro" type="button" onClick=${borrar} disabled=${ocupado}>Eliminar</button>
        </div>
      </form>
    </dialog>`;
}

/* ---------- entrar ----------
   Los autocomplete username / current-password no son adorno: con ellos el
   llavero de iCloud ofrece guardar la contraseña y la rellena con Face ID,
   así que en el teléfono entrar termina siendo un toque. */
function Entrar({ onListo }) {
  const [usuario, setUsuario] = useState(ls("quanto.usuario", ""));
  const [clave, setClave] = useState("");
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const refUsuario = useRef(null);
  const refClave = useRef(null);
  useEffect(() => { (usuario ? refClave : refUsuario).current?.focus(); }, []);

  if (!LLAVE) return html`
    <main class="alta">
      <h1>Libro de Lempiras</h1>
      <p class="alerta"><b>Falta la anon key.</b> Va en la constante <code>ANON</code> al
        principio de <code>app.js</code>, y solo después de aplicar el apéndice I.</p>
    </main>`;

  async function enviar(ev) {
    ev.preventDefault();
    setOcupado(true); setError(null);
    try {
      await entrar(aCorreo(usuario), clave);
      lset("quanto.usuario", usuario.trim().toLowerCase());
      onListo();
    } catch (e) {
      /* Supabase contesta 400 tanto si el usuario no existe como si la
         contraseña está mal, a propósito: no confirma qué usuarios hay. */
      setError(e.status === 400 ? "Usuario o contraseña incorrectos." : e.message);
      setClave("");
      setOcupado(false);
      refClave.current?.focus();
    }
  }

  return html`
    <main class="alta">
      <h1>Libro de Lempiras</h1>
      <form onSubmit=${enviar}>
        <label class="campo ancho"><span>Usuario</span>
          <input ref=${refUsuario} type="text" value=${usuario} autocomplete="username"
                 autocorrect="off" autocapitalize="off" spellcheck="false" required
                 onInput=${(e) => { setUsuario(e.target.value); setError(null); }} /></label>
        <label class="campo ancho"><span>Contraseña</span>
          <input ref=${refClave} type="password" value=${clave} autocomplete="current-password" required
                 onInput=${(e) => { setClave(e.target.value); setError(null); }} /></label>
        ${error && html`<p class="alerta" role="alert">${error}</p>`}
        <button class="btn primario" type="submit" disabled=${ocupado}>
          ${ocupado ? "Entrando…" : "Entrar"}</button>
      </form>
    </main>`;
}

/* ============================================================
   App
   ============================================================ */
function App() {
  const [fase, setFase] = useState(sesion ? "listo" : "entrar");
  const listo = fase === "listo";
  alPerderSesion = () => setFase("entrar");
  const [datos, setDatos] = useState(null);
  const [listas, setListas] = useState({ gastos: [], ingresos: [], cuentas: [] });
  const [v2, setV2] = useState(true);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [editando, setEditando] = useState(null);
  const [ajustando, setAjustando] = useState(null);
  const [des, setDes] = useState(null);
  const [rango, setRango] = useState(mes(0));
  const [v3, setV3] = useState(true);
  const [cargandoDes, setCargandoDes] = useState(false);
  const [vista, setVista] = useState(ls("quanto.vista", "libro"));
  const [animar, setAnimar] = useState(false);
  const [enRegistrar, setEnRegistrar] = useState(false);
  const refMonto = useRef(null);

  const irARegistrar = useCallback(() => {
    document.getElementById("registrar")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => refMonto.current?.focus(), 400);
  }, []);

  const notificar = useCallback((m) => {
    setAviso(m);
    setTimeout(() => setAviso((a) => (a === m ? null : a)), 4000);
  }, []);

  const cargar = useCallback(async () => {
    try {
      const d = await rpc("dashboard", { p_limit: 40 });
      setV2(true); setDatos(d); setError(null);
    } catch (e) {
      if (!faltaV2(e)) { setError(e.message); return; }
      setV2(false);
      try {
        const c = await rpc("cycle_summary");
        const hoy = new Date(HOY + "T00:00:00"), d0 = new Date(c.resumen.desde + "T00:00:00");
        const d1 = new Date(c.resumen.hasta + "T00:00:00");
        const dias_total = Math.round((d1 - d0) / 864e5) + 1;
        setDatos({
          ciclo: { desde: c.resumen.desde, hasta: c.resumen.hasta, hoy: HOY,
                   dia_actual: Math.min(Math.max(Math.round((hoy - d0) / 864e5) + 1, 1), dias_total),
                   dias_total },
          resumen: c.resumen, presupuestos: c.presupuestos, saldos: c.saldos,
          serie: [], metas: [], movimientos: [],
        });
        setError(null);
      } catch (e2) { setError(e2.message); }
    }
  }, []);

  useEffect(() => {
    if (!listo) return;
    (async () => {
      try { setListas(await rpc("get_lists")); } catch (e) { setError(e.message); }
      await cargar();
      requestAnimationFrame(() => setAnimar(true));
    })();
  }, [listo]);

  useEffect(() => { lset("quanto.vista", vista); }, [vista]);

  /* El botón fijo se aparta cuando el formulario ya está a la vista: si no,
     tapa la cifra del sobre que queda justo debajo. Se mide la posición en
     cada scroll en lugar de usar IntersectionObserver, para no depender de
     un nodo concreto — Preact lo reemplaza al re-renderizar. */
  useEffect(() => {
    if (!listo) return;
    const medir = () => {
      const el = document.getElementById("registrar");
      if (el) setEnRegistrar(el.getBoundingClientRect().top < innerHeight - 90);
    };
    medir();
    addEventListener("scroll", medir, { passive: true });
    addEventListener("resize", medir);
    return () => { removeEventListener("scroll", medir); removeEventListener("resize", medir); };
    /* `datos` va en las dependencias a propósito: al montar la página aún
       muestra el esqueleto y es corta, así que la primera medición da un
       falso positivo y el botón arrancaría oculto hasta el primer scroll. */
  }, [listo, datos]);

  const cargarDesglose = useCallback(async (r) => {
    setCargandoDes(true);
    try {
      setDes(await rpc("desglose", { p_desde: r.desde, p_hasta: r.hasta }));
      setV3(true);
    } catch (e) {
      if (faltaV2(e)) setV3(false); else notificar(`Error: ${e.message}`);
    } finally { setCargandoDes(false); }
  }, [notificar]);

  useEffect(() => { if (listo) cargarDesglose(rango); }, [listo, rango.desde, rango.hasta]);

  const tras = useCallback(async (msg) => {
    notificar(msg);
    await Promise.all([cargar(), cargarDesglose(rango)]);
  }, [cargar, cargarDesglose, rango.desde, rango.hasta]);

  async function deshacer() {
    try {
      const r = await rpc("undo_last");
      await tras(r.ok ? `Deshecho: L ${L(r.monto)} (${r.tipo})` : "No hay movimientos que deshacer");
    } catch (e) { notificar(`Error: ${e.message}`) }
  }

  if (fase === "entrar") return html`<${Entrar} onListo=${() => setFase("listo")} />`;

  const c = datos?.ciclo;

  return html`
    <div class="hoja-libro">
      <header class="cabecera">
        <div>
          <h1>Libro de Lempiras</h1>
          ${c
            ? html`<p class="folio">${folio(c)}</p>`
            : html`<p class="folio">Abriendo el libro…</p>`}
        </div>
      </header>

      <nav class="vistas" role="tablist">
        ${[["libro", "Libro"], ["graficos", "Gráficos"]].map(([id, n]) => html`
          <button key=${id} type="button" role="tab" aria-selected=${vista === id}
                  onClick=${() => setVista(id)}>${n}</button>`)}
      </nav>

      ${error && html`<p class="alerta" role="alert"><b>No se pudo leer el libro.</b> ${error}</p>`}
      ${!v2 && html`<p class="alerta">
        <b>Falta aplicar el apéndice B.</b> Sin él no hay asientos, metas ni gasto diario.</p>`}

      ${vista === "graficos" && (v3
        ? html`<${Graficos} des=${des} cargando=${cargandoDes} onRango=${setRango} />`
        : html`<p class="alerta"><b>Falta aplicar el apéndice C.</b>
            Los gráficos por rango necesitan la función <code>desglose()</code>.</p>`)}

      ${vista === "libro" && (!datos
        ? html`<${Esqueleto} filas=${4} />`
        : html`
          <div class="columnas">
          <div class="col col-a">
          <${Ritmo} ciclo=${c} presupuestos=${datos.presupuestos} onRegistrar=${irARegistrar} />

          <${Balance} resumen=${datos.resumen} />

          <section>
            <${Regla} etiqueta="Presupuestos">
              ${(() => {
                const ex = datos.presupuestos.filter((b) => Number(b.pct_usado) > 100).length;
                if (ex) return ex === 1 ? "1 excedido" : `${ex} excedidos`;
                return "toca para ajustar";
              })()}
            <//>
            ${datos.presupuestos.length
              ? html`<div class="pliego"><ul class="sobres">
                  ${ordenarSobres(datos.presupuestos, c).map((b) => html`
                    <${Sobre} key=${b.categoria} b=${b} ciclo=${c} animar=${animar} onAjustar=${setAjustando} />`)}
                </ul></div>`
              : html`<p class="vacio">Ninguna categoría tiene límite todavía.</p>`}

            ${(() => {
              const sin = listas.gastos.filter(
                (g) => !datos.presupuestos.some((b) => norm(b.categoria) === norm(g)));
              if (!sin.length) return null;
              return html`
                <div class="sin-limite">
                  <p>Estas se anotan, pero no avisan cuánto queda:</p>
                  <ul>
                    ${sin.map((g) => html`
                      <li key=${g}>
                        <button type="button"
                                onClick=${() => setAjustando({ categoria: sinEmoji(g), limite: null })}>
                          ${g}<i>+</i>
                        </button>
                      </li>`)}
                  </ul>
                </div>`;
            })()}
          </section>

          ${v2 && html`
            <section>
              <${Regla} etiqueta="Día por día">▲ entró<//>
              <${Cinta} serie=${datos.serie} ciclo=${c} />
            </section>`}
          </div>

          <div class="col col-b">
          <section>
            <${Regla} etiqueta="Cuentas">
              ${datos.saldos.length === 1 ? "1 cuenta" : `${datos.saldos.length} cuentas`}
            <//>
            <div class="pliego"><ul class="cuentas">
              ${datos.saldos.map((s) => html`
                <li key=${s.cuenta}>
                  <span><b>${s.cuenta}</b>${norm(s.cuenta).includes(norm(s.tipo))
                    ? null : html`<small>${s.tipo}</small>`}</span>
                  <${Cifra} valor=${s.saldo} />
                </li>`)}
              <!-- La fila de cierre del libro: el total de todas las cuentas es de
                   los datos que más importan, y estaba en letra de 11px en un rincón. -->
              <li class="cierre">
                <span>Total</span>
                <${Cifra} valor=${datos.saldos.reduce((a, s) => a + Number(s.saldo), 0)} tam="md" />
              </li>
            </ul></div>
          </section>

          ${datos.metas.length > 0 && html`
            <section>
              <${Regla} etiqueta="Metas" />
              <div class="pliego"><ul class="sobres">
                ${datos.metas.map((m) => html`
                  <li class="sobre estatico" key=${m.meta}>
                    <div class="sobre-cab">
                      <span class="sobre-nombre">${m.meta}</span>
                      <span class="sobre-restante"><${Cifra} valor=${m.ahorrado} />${m.objetivo != null ? html`<span class="meta-de"> de ${L(m.objetivo)}</span>` : null}</span>
                    </div>
                    <div class="barra">
                      <div class="barra-relleno meta" style=${`width:${animar ? Math.min(Number(m.pct), 100) : 0}%`}></div>
                    </div>
                    <div class="sobre-pie">
                      <span>${metaPie(m)}</span>
                      <span class="sobre-pct">${pct(m.pct)}</span>
                    </div>
                  </li>`)}
              </ul></div>
            </section>`}

          ${v2 && html`
            <section>
              <${Regla} etiqueta="Asientos">toca uno para corregirlo<//>
              ${datos.movimientos.length
                ? html`<div class="pliego"><ul class="asientos">
                    ${agruparPorDia(datos.movimientos).map((g) => {
                      const suma = (tipo) => g.items.filter((m) => m.tipo === tipo)
                                                    .reduce((a, m) => a + Number(m.monto), 0);
                      const salio = suma("gasto"), entro = suma("ingreso");
                      return [
                        html`<li class="dia-cab" key=${`d${g.fecha}`}>
                          <span>${diaHumano(g.fecha)}</span>
                          ${salio > 0 ? html`<span class="dia-salio">salió L ${L(salio)}</span>`
                            : entro > 0 ? html`<span class="dia-salio">entró L ${L(entro)}</span>` : null}
                        </li>`,
                        ...g.items.map((m) => html`<${Asiento} key=${m.id} m=${m} onAbrir=${setEditando} />`),
                      ];
                    })}
                  </ul></div>`
                : html`<p class="vacio">El libro está en blanco. Registra el primer movimiento abajo.</p>`}
            </section>`}

          <section id="registrar">
            <${Regla} etiqueta="Registrar" />
            <${Captura} listas=${listas} saldos=${datos.saldos} refMonto=${refMonto}
                        onHecho=${tras} onError=${(m) => notificar(`Error: ${m}`)} />
            <button class="btn sutil" type="button" onClick=${deshacer}>Deshacer el último</button>
          </section>
          </div>
          </div>
        `)}

      <details class="conexion">
        <summary>Sesión</summary>
        <p>Entraste como <b>${aUsuario(sesion?.correo) || "—"}</b>. La sesión queda abierta en
           este navegador hasta que la cierres; tu contraseña no se guarda aquí.</p>
        <button class="btn" type="button" onClick=${async () => {
          await salir(); setDatos(null); setDes(null); setFase("entrar");
        }}>Cerrar sesión</button>
      </details>

      ${vista === "libro" && html`
      <button class=${`fab ${enRegistrar ? "oculto" : ""}`} type="button"
              onClick=${irARegistrar}>Registrar</button>`}

      ${editando && html`
        <${Corregir} mov=${editando} listas=${listas} onCerrar=${() => setEditando(null)}
                     onError=${(m) => notificar(`Error: ${m}`)}
                     onHecho=${async (m) => { setEditando(null); await tras(m); }} />`}

      ${ajustando && html`
        <${AjustarSobre} cat=${ajustando} onCerrar=${() => setAjustando(null)}
                         onError=${(m) => notificar(`Error: ${m}`)}
                         onHecho=${async (m) => { setAjustando(null); await tras(m); }} />`}

      ${aviso && html`<div class="aviso" role="status">${aviso}</div>`}
    </div>`;
}

render(html`<${App} />`, document.getElementById("app"));
