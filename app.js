/* ============================================================
   Libro de Lempiras — aplicación
   Preact + htm, componentes y hooks. Sin paso de compilación.
   ============================================================ */
const { html, render, useState, useEffect, useMemo, useRef, useCallback } = htmPreact;

/* ---------- conexión ---------- */
const DEF_URL = "https://dabvugwhzwkmdmsvrazz.supabase.co";

const ls = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
const lset = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

/* Alta por enlace: #k=<llave>&u=<url>. El fragmento no viaja al servidor,
   así que la llave no queda en ningún registro de acceso. */
(function bootstrap() {
  const h = location.hash;
  if (!h) return;
  const k = h.match(/[#&]k=([^&]*)/), u = h.match(/[#&]u=([^&]*)/);
  let toco = false;
  if (k?.[1]) { lset("quanto.key", decodeURIComponent(k[1])); toco = true; }
  if (u?.[1]) { lset("quanto.url", decodeURIComponent(u[1])); toco = true; }
  if (toco) {
    try { history.replaceState(null, "", location.pathname + location.search); }
    catch { location.hash = ""; }
  }
})();

let URL_ = ls("quanto.url", DEF_URL).replace(/\/+$/, "");
let KEY_ = ls("quanto.key", "");

async function rpc(fn, body) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: KEY_, Authorization: `Bearer ${KEY_}`, "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
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
const pct = (n) => `${nf0.format(Number(n || 0))}%`;
const HOY = new Date().toLocaleDateString("en-CA");
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

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

/* El elemento firma: dos marcas en una misma escala — dónde va el ciclo
   y dónde va el gasto. Si el gasto adelanta al calendario, tinta roja. */
function Ritmo({ ciclo, presupuestos, gastos }) {
  const limite = presupuestos.reduce((a, b) => a + Number(b.limite), 0);
  const gastado = presupuestos.reduce((a, b) => a + Number(b.gastado), 0);
  if (!limite) return null;

  const pGasto = Math.min((100 * gastado) / limite, 100);
  const pCiclo = Math.min((100 * ciclo.dia_actual) / ciclo.dias_total, 100);
  const delta = pGasto - pCiclo;
  const estado = delta > 8 ? "sobre" : delta < -8 ? "holgado" : "a-ritmo";
  const leyenda = { sobre: "Vas sobre el ritmo", holgado: "Vas holgado", "a-ritmo": "Vas a ritmo" }[estado];
  const proyeccion = (Number(gastos) / Math.max(ciclo.dia_actual, 1)) * ciclo.dias_total;

  return html`
    <section class=${`ritmo ${estado}`}>
      <div class="ritmo-cab">
        <span class="ritmo-estado">${leyenda}</span>
        <span class="ritmo-dias">quedan ${ciclo.dias_total - ciclo.dia_actual} días</span>
      </div>

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

      <dl class="ritmo-datos">
        <div><dt>Gastado</dt><dd><${Cifra} valor=${gastado} /></dd></div>
        <div><dt>Presupuesto</dt><dd><${Cifra} valor=${limite} /></dd></div>
        <div><dt>Proyección al cierre</dt><dd><${Cifra} valor=${proyeccion} /></dd></div>
      </dl>
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

function Sobre({ b, ciclo, animar, onAjustar }) {
  const p = Number(b.pct_usado) || 0;
  const disp = Number(b.disponible);
  const pCiclo = (100 * ciclo.dia_actual) / ciclo.dias_total;
  /* "excedido", no "sobre": el elemento ya se llama .sobre y una clase
     de estado con el mismo nombre colapsaría el selector. */
  const estado = p > 100 ? "excedido" : p > pCiclo + 8 ? "adelantado" : "bien";

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
        <div class="barra-relleno" style=${`width:${animar ? Math.min(p, 100) : 0}%; --c:${b.color || "var(--accent)"}`}></div>
        <i class="barra-ritmo" style=${`left:${Math.min(pCiclo, 100)}%`} title="ritmo del ciclo"></i>
      </div>
      <div class="sobre-pie">
        <span>${L(b.gastado)} de ${L(b.limite)}</span>
        <span class="sobre-pct">${pct(p)}</span>
      </div>
      </button>
    </li>`;
}

function Cinta({ serie, ciclo }) {
  const max = Math.max(...serie.map((d) => Number(d.gastos) || 0), 0);
  if (max <= 0) {
    return html`<p class="vacio">Sin gastos en este ciclo. El primero que registres aparece aquí.</p>`;
  }
  const conGasto = serie.filter((d) => Number(d.gastos) > 0).length;
  const promedio = serie.reduce((a, d) => a + Number(d.gastos || 0), 0) / Math.max(conGasto, 1);

  return html`
    <div class="cinta">
      <div class="cinta-barras" role="img" aria-label=${`Gasto diario, máximo ${L(max)}`}>
        ${serie.map((d) => {
          const g = Number(d.gastos) || 0;
          const h = g > 0 ? Math.max((100 * g) / max, 3) : 0;
          const hoy = d.dia === HOY;
          return html`
            <div class=${`dia ${hoy ? "hoy" : ""} ${g > 0 ? "con" : ""}`} key=${d.dia}
                 title=${`${d.dia}: L ${L(g)}`}>
              <div class="dia-barra" style=${`height:${h}%`}></div>
            </div>`;
        })}
      </div>
      <div class="cinta-pie">
        <span>${ciclo.desde.slice(8)}/${ciclo.desde.slice(5, 7)}</span>
        <span class="cinta-prom">promedio L ${L(promedio)} por día con gasto</span>
        <span>${ciclo.hasta.slice(8)}/${ciclo.hasta.slice(5, 7)}</span>
      </div>
    </div>`;
}

function Asiento({ m, onAbrir }) {
  const [, mm, dd] = String(m.fecha).split("-");
  const titulo = m.tipo === "transferencia"
    ? "Transferencia"
    : `${m.icono ? m.icono + " " : ""}${m.categoria || "—"}`;
  const det = m.tipo === "transferencia"
    ? `${m.cuenta} › ${m.cuenta_destino}`
    : m.cuenta;
  const extra = [m.nota, m.recurrente ? "recurrente" : null].filter(Boolean).join(" · ");

  return html`
    <li>
      <button class="asiento" type="button" onClick=${() => onAbrir(m)}>
        <span class="asiento-fecha"><b>${Number(dd)}</b>${MES[Number(mm) - 1]}</span>
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

/* La dona codifica MAGNITUD, no identidad: una rampa secuencial de un solo
   tono, de oscuro a claro según el monto. Es la codificación correcta para
   magnitud, es monótona por construcción y no tiene el problema de
   distinguir diez matices. La identidad la llevan la leyenda y las
   etiquetas, donde cada categoría conserva su color propio. */
const RAMPA = 6;

/* Pliega la cola en "Resto": más allá de seis porciones la dona deja de
   leerse, y ningún juego de tonos separa tantas categorías. */
function plegar(items, n = RAMPA) {
  const vivos = items
    .filter((i) => Number(i.monto) > 0)
    .sort((a, b) => Number(b.monto) - Number(a.monto));
  const cola = vivos.slice(n);
  const suma = cola.reduce((a, i) => a + Number(i.monto), 0);
  return suma > 0
    ? [...vivos.slice(0, n), { nombre: `Resto (${cola.length})`, monto: suma, resto: true }]
    : vivos;
}

function Dona({ segmentos, etiqueta, pie, vacio = "Sin datos en este rango." }) {
  const total = segmentos.reduce((a, s) => a + Number(s.monto), 0);
  if (!total) return html`<p class="vacio">${vacio}</p>`;

  const R = 68, GROSOR = 26, CIRC = 2 * Math.PI * R, HUECO = 3;
  let acumulado = 0;
  const arcos = segmentos.map((s, i) => {
    const frac = Number(s.monto) / total;
    const largo = Math.max(CIRC * frac - HUECO, 0.8);
    const trazo = s.resto ? "url(#tramado)" : s.color || `var(--d${Math.min(i + 1, RAMPA)})`;
    const arco = html`
      <circle key=${s.nombre} cx="100" cy="100" r=${R} fill="none"
              stroke=${trazo} stroke-width=${GROSOR}
              stroke-dasharray=${`${largo} ${CIRC - largo}`}
              stroke-dashoffset=${-acumulado}>
        <title>${s.nombre}: L ${L(s.monto)} · ${pct((100 * s.monto) / total)}</title>
      </circle>`;
    acumulado += CIRC * frac;
    return arco;
  });

  const mayor = segmentos.reduce((a, s) => (Number(s.monto) > Number(a.monto) ? s : a));
  return html`
    <div class="dona">
      <svg viewBox="0 0 200 200" role="img"
           aria-label=${`${pie}. Total L ${L(total)}. Mayor: ${mayor.nombre}, ${pct((100 * mayor.monto) / total)}`}>
        <g transform="rotate(-90 100 100)">
          <!-- Pista teñida: los pasos claros de la rampa apenas contrastan
               contra blanco, y sobre esta pista sí quedan definidos. -->
          <circle cx="100" cy="100" r=${R} fill="none" stroke="var(--hundido)" stroke-width=${GROSOR}></circle>
          ${arcos}
        </g>
        <text x="100" y="94" text-anchor="middle" class="dona-cifra">L ${nf0.format(etiqueta ?? total)}</text>
        <text x="100" y="112" text-anchor="middle" class="dona-pie">${pie}</text>
      </svg>
    </div>`;
}

/* Una sola definición del tramado para toda la página: los id de SVG son
   globales del documento y repetirlos en cada dona los duplica. */
function DefsSVG() {
  return html`
    <svg width="0" height="0" aria-hidden="true" style="position:absolute">
      <defs>
        <pattern id="tramado" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="7" height="7" fill="var(--hundido)"></rect>
          <line x1="0" y1="0" x2="0" y2="7" stroke="var(--ink3)" stroke-width="2.5"></line>
        </pattern>
      </defs>
    </svg>`;
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

function Graficos({ des, presupuestos, cargando, onRango, onAjustar }) {
  if (!des) return html`<${Esqueleto} filas=${2} />`;
  const total = Number(des.totales.gastos) || 0;
  const r = des.rango;

  const porCategoria = plegar(
    des.categorias.map((c) => ({ nombre: c.categoria, monto: Number(c.total) }))
  );

  /* El presupuesto vive en el ciclo, no en el rango elegido: se rotula
     así para no mezclar dos ventanas de tiempo en la misma pantalla. */
  const limTotal = presupuestos.reduce((a, b) => a + Number(b.limite), 0);
  const usado = presupuestos.reduce((a, b) => a + Number(b.gastado), 0);
  const excedido = usado > limTotal;
  const segPresupuesto = limTotal
    ? [
        { nombre: "Gastado", monto: Math.min(usado, limTotal),
          color: excedido ? "var(--over)" : "var(--d2)" },
        { nombre: "Disponible", monto: Math.max(limTotal - usado, 0), color: "var(--d6)" },
      ]
    : [];

  const conLim = des.categorias.filter((c) => c.limite != null)
                               .reduce((a, c) => a + Number(c.total), 0);
  const sinLim = des.categorias.filter((c) => c.limite == null)
                               .reduce((a, c) => a + Number(c.total), 0);
  const segVigilado = [
    { nombre: "Con límite", monto: conLim, color: "var(--d2)" },
    { nombre: "Sin límite", monto: sinLim, resto: true },
  ];

  /* Solo si se aplicó quanto_v4.sql; si no, esta dona simplemente no está. */
  const porCuenta = Array.isArray(des.cuentas)
    ? plegar(des.cuentas.map((c) => ({ nombre: c.cuenta, monto: Number(c.total) })))
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
      </p>

      <div class="graficos">
        <${Tarjeta} titulo="Gasto por categoría" nota=${`${r.desde} a ${r.hasta}`}>
          <${Dona} segmentos=${porCategoria} pie="gastado"
                   vacio="Sin gastos en este rango. Registra uno y aparece aquí." />
        <//>

        <${Tarjeta} titulo="Presupuesto del ciclo"
                    nota=${excedido ? "excedido" : `de L ${L(limTotal)}`}>
          <${Dona} segmentos=${segPresupuesto} etiqueta=${Math.max(limTotal - usado, 0)}
                   pie="disponible"
                   vacio="Ninguna categoría tiene límite." />
        <//>

        <${Tarjeta} titulo="¿Cuánto se está vigilando?"
                    nota="gasto en categorías con límite">
          <${Dona} segmentos=${segVigilado} pie="gastado"
                   vacio="Sin gastos en este rango." />
        <//>

        ${porCuenta && html`
          <${Tarjeta} titulo="Gasto por cuenta" nota=${`${r.desde} a ${r.hasta}`}>
            <${Dona} segmentos=${porCuenta} pie="gastado"
                     vacio="Sin gastos en este rango." />
          <//>`}
      </div>

      <${Regla} etiqueta="Por categoría">toca para ajustar el límite<//>
      <ul class="leyenda">
        ${des.categorias.map((c) => {
          const t = Number(c.total);
          const p = total ? (100 * t) / total : 0;
          const lim = c.limite == null ? null : Number(c.limite);
          return html`
            <li key=${c.categoria} class=${t > 0 ? "" : "cero"}>
              <button type="button"
                      aria-label=${`Ajustar el límite de ${c.categoria}`}
                      onClick=${() => onAjustar({ categoria: c.categoria, limite: c.limite, gastado: c.total })}>
                <${Marca} icono=${c.icono} color=${c.color} />
                <span class="leyenda-nombre">${c.categoria}</span>
                <span class="leyenda-lim">
                  ${lim == null ? "sin límite" : `de ${L(lim)}`}
                  ${lim != null && t > lim ? html`<b class="exceso">excedido</b>` : null}
                </span>
                <span class="leyenda-monto num">${L(t)}</span>
                <span class="leyenda-pct num">${total ? pct(p) : "—"}</span>
              </button>
            </li>`;
        })}
      </ul>
    </div>`;
}

/* ---------- captura ---------- */
function Captura({ listas, onHecho, onError, refMonto }) {
  const [tipo, setTipo] = useState("gasto");
  const [monto, setMonto] = useState("");
  const [cat, setCat] = useState("");
  const [cuenta, setCuenta] = useState("");
  const [destino, setDestino] = useState("");
  const [fecha, setFecha] = useState(HOY);
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cats = tipo === "ingreso" ? listas.ingresos : listas.gastos;

  useEffect(() => {
    if (!listas.cuentas.length) return;
    const pref = listas.cuentas.includes("Efectivo") ? "Efectivo" : listas.cuentas[0];
    setCuenta((c) => c || pref);
    const otras = listas.cuentas.filter((c) => c !== pref);
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

        ${!esTrans && html`
          <label class="campo">
            <span>Categoría</span>
            <select value=${cat} onChange=${(e) => setCat(e.target.value)}>
              ${cats.map((c) => html`<option key=${c}>${c}</option>`)}
            </select>
          </label>`}

        <label class="campo">
          <span>${esTrans ? "Desde" : "Cuenta"}</span>
          <select value=${cuenta} onChange=${(e) => setCuenta(e.target.value)}>
            ${listas.cuentas.map((c) => html`<option key=${c}>${c}</option>`)}
          </select>
        </label>

        ${esTrans && html`
          <label class="campo">
            <span>Hacia</span>
            <select value=${destino} onChange=${(e) => setDestino(e.target.value)}>
              ${listas.cuentas.map((c) => html`<option key=${c}>${c}</option>`)}
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
                ${cats.map((c) => html`<option key=${c}>${c}</option>`)}
              </select>
            </label>`}
          <label class="campo">
            <span>Cuenta</span>
            <select value=${cuenta} onChange=${(e) => setCuenta(e.target.value)}>
              ${listas.cuentas.map((c) => html`<option key=${c}>${c}</option>`)}
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

/* ---------- alta de la llave ---------- */
function Alta({ onListo }) {
  const [url, setUrl] = useState(URL_ || DEF_URL);
  const [key, setKey] = useState("");
  return html`
    <main class="alta">
      <h1>Libro de Lempiras</h1>
      <p>Este dispositivo todavía no tiene la llave de acceso. Pégala una vez y queda
         guardada aquí; no se envía a ningún otro lado.</p>
      <form onSubmit=${(e) => { e.preventDefault();
        lset("quanto.url", url.trim().replace(/\/+$/, "")); lset("quanto.key", key.trim());
        URL_ = url.trim().replace(/\/+$/, ""); KEY_ = key.trim(); onListo(); }}>
        <label class="campo ancho"><span>Project URL</span>
          <input type="url" value=${url} onInput=${(e) => setUrl(e.target.value)} spellcheck="false" required />
        </label>
        <label class="campo ancho"><span>anon key</span>
          <input type="password" value=${key} onInput=${(e) => setKey(e.target.value)}
                 spellcheck="false" required placeholder="eyJhbGciOi…" />
        </label>
        <button class="btn primario" type="submit">Entrar</button>
      </form>
    </main>`;
}

/* ============================================================
   App
   ============================================================ */
function App() {
  const [listo, setListo] = useState(Boolean(KEY_));
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

  if (!listo) return html`<${Alta} onListo=${() => setListo(true)} />`;

  const c = datos?.ciclo;

  return html`
    <div class="hoja-libro">
      <${DefsSVG} />
      <header class="cabecera">
        <div>
          <h1>Libro de Lempiras</h1>
          ${c
            ? html`<p class="folio">
                ${c.desde} <i>—</i> ${c.hasta} · día ${c.dia_actual} de ${c.dias_total}
              </p>`
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
        <b>Falta aplicar quanto_v2.sql.</b> Sin él no hay asientos, metas ni gasto diario.</p>`}

      ${vista === "graficos" && (v3
        ? html`<${Graficos} des=${des} presupuestos=${datos ? datos.presupuestos : []}
                            cargando=${cargandoDes} onRango=${setRango} onAjustar=${setAjustando} />`
        : html`<p class="alerta"><b>Falta aplicar quanto_v3.sql.</b>
            Los gráficos por rango necesitan la función <code>desglose()</code>.</p>`)}

      ${vista === "libro" && (!datos
        ? html`<${Esqueleto} filas=${4} />`
        : html`
          <${Ritmo} ciclo=${c} presupuestos=${datos.presupuestos} gastos=${datos.resumen.gastos} />

          <section>
            <${Regla} etiqueta="Presupuestos">
              ${(() => {
                const ex = datos.presupuestos.filter((b) => Number(b.pct_usado) > 100).length;
                if (ex) return ex === 1 ? "1 excedido" : `${ex} excedidos`;
                return "toca para ajustar";
              })()}
            <//>
            ${datos.presupuestos.length
              ? html`<ul class="sobres">
                  ${datos.presupuestos.map((b) => html`
                    <${Sobre} key=${b.categoria} b=${b} ciclo=${c} animar=${animar} onAjustar=${setAjustando} />`)}
                </ul>`
              : html`<p class="vacio">Ninguna categoría tiene límite todavía.</p>`}

            ${(() => {
              const sin = listas.gastos.filter((g) => !datos.presupuestos.some((b) => b.categoria === g));
              if (!sin.length) return null;
              return html`
                <div class="sin-limite">
                  <p>Sin límite — estas categorías se registran pero no avisan cuánto queda:</p>
                  <ul>
                    ${sin.map((g) => html`
                      <li key=${g}>
                        <button type="button" onClick=${() => setAjustando({ categoria: g, limite: null })}>
                          ${g}<i>+</i>
                        </button>
                      </li>`)}
                  </ul>
                </div>`;
            })()}
          </section>

          ${v2 && html`
            <section>
              <${Regla} etiqueta="Gasto diario" /><${Cinta} serie=${datos.serie} ciclo=${c} />
            </section>`}

          <section>
            <${Regla} etiqueta="Cuentas">
              ${(() => { const t = datos.saldos.reduce((a, s) => a + Number(s.saldo), 0);
                         return html`total <${Cifra} valor=${t} />`; })()}
            <//>
            <ul class="cuentas">
              ${datos.saldos.map((s) => html`
                <li key=${s.cuenta}>
                  <span><b>${s.cuenta}</b><small>${s.tipo}</small></span>
                  <${Cifra} valor=${s.saldo} />
                </li>`)}
            </ul>
          </section>

          ${datos.metas.length > 0 && html`
            <section>
              <${Regla} etiqueta="Metas" />
              <ul class="sobres">
                ${datos.metas.map((m) => html`
                  <li class="sobre estatico" key=${m.meta}>
                    <div class="sobre-cab">
                      <span class="sobre-nombre">${m.meta}</span>
                      <span class="sobre-restante"><${Cifra} valor=${m.ahorrado} /></span>
                    </div>
                    <div class="barra">
                      <div class="barra-relleno meta" style=${`width:${animar ? Math.min(Number(m.pct), 100) : 0}%`}></div>
                    </div>
                    <div class="sobre-pie">
                      <span>${[m.fecha_objetivo && `para ${m.fecha_objetivo}`,
                                m.cuota_mensual != null && `L ${L(m.cuota_mensual)}/mes`]
                                .filter(Boolean).join(" · ") || "sin fecha"}</span>
                      <span class="sobre-pct">${pct(m.pct)}</span>
                    </div>
                  </li>`)}
              </ul>
            </section>`}

          ${v2 && html`
            <section>
              <${Regla} etiqueta="Asientos">toca uno para corregirlo<//>
              ${datos.movimientos.length
                ? html`<ul class="asientos">
                    ${datos.movimientos.map((m) => html`<${Asiento} key=${m.id} m=${m} onAbrir=${setEditando} />`)}
                  </ul>`
                : html`<p class="vacio">El libro está en blanco. Registra el primer movimiento abajo.</p>`}
            </section>`}

          <section id="registrar">
            <${Regla} etiqueta="Registrar" />
            <${Captura} listas=${listas} refMonto=${refMonto}
                        onHecho=${tras} onError=${(m) => notificar(`Error: ${m}`)} />
            <button class="btn sutil" type="button" onClick=${deshacer}>Deshacer el último</button>
          </section>
        `)}

      <details class="conexion">
        <summary>Conexión</summary>
        <p>La llave vive solo en este navegador y únicamente puede ejecutar las
           funciones otorgadas: no lee tablas ni las borra.</p>
        <button class="btn" type="button" onClick=${() => {
          if (!confirm("¿Olvidar la llave en este dispositivo?")) return;
          lset("quanto.key", ""); KEY_ = ""; setListo(false);
        }}>Olvidar la llave</button>
      </details>

      ${vista === "libro" && html`
      <button class=${`fab ${enRegistrar ? "oculto" : ""}`} type="button" onClick=${() => {
        document.getElementById("registrar").scrollIntoView({ behavior: "smooth", block: "start" });
        setTimeout(() => refMonto.current?.focus(), 400);
      }}>Registrar</button>`}

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
