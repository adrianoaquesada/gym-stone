/* ═══════════════════════════════════════════════════════════════════════════
   Temporizador libre (cuenta atrás para lo que quieras: descanso, series
   temporizadas, cocina…). No está atado a ninguna rutina ni a ninguna sesión.

   Se abre desde «Rutinas» —la lista o el dashboard de una rutina— o con el
   comando «Abrir el temporizador». Es la suma de tres referencias: el anillo
   circular con la hora a la que sonará, el ajuste a mano de h/m/s y los
   presets de un toque —en carrusel lateral—, más los controles del descanso
   de la sesión guiada (−15 s, ＋15 s…). Ni los presets arrancan: solo fijan
   la duración; la cuenta atrás la pone en marcha el botón principal, que
   mientras corre se convierte en pausa y en reanudar; no hay un botón de
   pausa aparte ni de reiniciar («⏹ Parar» ya vuelve al principio).

   El estado vive en el MÓDULO, no en el modal: se puede cerrar la ventana y
   la cuenta atrás sigue corriendo; al volver se reanuda donde estaba. Al
   llegar a 0 suena un pitido y vibra (el sonido, su volumen y su interruptor
   viven en sonido.ts y en Ajustes → Gym Stone) y sale un aviso. El tiempo
   sale de Date.now() —no de tics—, así que con la pantalla apagada u
   Obsidian en segundo plano, al volver se recalcula solo: la misma lección
   que el descanso de la sesión guiada. Mientras corre (y con el ajuste
   «Mantener la pantalla encendida» activo, por defecto) la pantalla no se
   apaga sola —ver despierta.ts—; en pausa o al parar se suelta.
   ═══════════════════════════════════════════════════════════════════════════ */

import { dos } from "../util";
import { ReclamoDespierta } from "../despierta";
import { conf } from "../estado";
import { el, modal, ponerX, toast } from "./componentes";
import { reiniciarCuentaAtras, sonarCuentaAtras, sonarTemporizador, vibrar } from "./sonido";

/* ── Estado (del módulo: sobrevive al cierre del modal) ─────────────────── */
let totalMs = 5 * 60000;        // la duración elegida (5:00 al empezar)
let finEn: number | null = null;   // cuándo termina (Date.now()); null = no corre
let guardado = totalMs;         // restante mientras no corre (parado o en pausa)
let pausado = false;
let idReloj: number | null = null;
let alPintar: (() => void) | null = null;   // repintado del modal, si está abierto

/* Pantalla despierta: solo mientras la cuenta atrás corre (pausa, parado o
   terminado → se suelta; el ajuste «Mantener la pantalla encendida» manda). */
const pantalla = new ReclamoDespierta();

/* MODO PRUEBAS (reversible a petición): mientras el temporizador corre o está
   en pausa se OCULTAN las secciones «Ajustar» y «Rápidos», y solo quedan el
   anillo, el estado y los controles. Para volver al comportamiento anterior
   basta con poner esto a false: el repintado solo añade/quita .gym-oculto. */
const OCULTAR_SECCIONES_AL_CORRER = true;

const restante = (): number => (finEn != null ? Math.max(0, finEn - Date.now()) : guardado);

/* ── Aviso al terminar: pitido + vibración + toast ───────────────────────── */
/* El pitido y la vibración viven en sonido.ts (compartido con el descanso de
   la sesión guiada): aquí manda el ajuste «Sonido del temporizador» y el de
   «Volumen del sonido». */
const avisar = (): void => {
    sonarTemporizador();
    vibrar();
    toast("⏰ ¡Tiempo! El temporizador ha terminado.");
};

/* ── Reloj: cada 250 ms se mira el reloj del sistema, no se cuentan tics ── */
const tic = (): void => {
    if (finEn != null) {
        const ms = restante();
        if (ms <= 0) { terminar(); return; }
        sonarCuentaAtras("temporizador-libre", "temporizador", ms);
    }
    notificar();
};
const arrancarReloj = (): void => { if (idReloj == null) idReloj = window.setInterval(tic, 250); };
const pararReloj = (): void => {
    if (idReloj == null) return;
    window.clearInterval(idReloj);
    idReloj = null;
};
const notificar = (): void => { alPintar?.(); };

/* ── Acciones ───────────────────────────────────────────────────────────── */
const arrancar = (ms: number): void => {
    totalMs = Math.max(1000, ms);
    finEn = Date.now() + totalMs;
    guardado = totalMs;
    pausado = false;
    reiniciarCuentaAtras("temporizador-libre");
    arrancarReloj();
    pantalla.poner();   // la cuenta atrás corre: la pantalla no se apaga
    notificar();
};

const terminar = (): void => {
    finEn = null;
    pausado = false;
    guardado = 0;
    pararReloj();
    reiniciarCuentaAtras("temporizador-libre");
    pantalla.quitar();   // ya sonó: la pantalla puede dormirse
    avisar();
    notificar();
};

const parar = (): void => {
    finEn = null;
    pausado = false;
    guardado = totalMs;
    pararReloj();
    reiniciarCuentaAtras("temporizador-libre");
    pantalla.quitar();
    notificar();
};

const alternarPausa = (): void => {
    if (finEn != null) { guardado = restante(); finEn = null; pausado = true; pararReloj(); pantalla.quitar(); }
    else if (pausado) { finEn = Date.now() + guardado; pausado = false; arrancarReloj(); pantalla.poner(); }
    notificar();
};

const ajustar = (deltaMs: number): void => {
    const r = Math.max(0, restante() + deltaMs);
    if (finEn != null) {
        finEn = Date.now() + r;          // sigue corriendo desde ese restante
        totalMs = Math.max(totalMs, r);  // el anillo no se sale de su pista
        if (r <= 0) { terminar(); return; }
    } else {
        // Parado (o aún sin empezar): los ± ajustan la duración elegida
        totalMs = Math.max(1000, totalMs + deltaMs);
        guardado = totalMs;
    }
    notificar();
};

/* Detiene el intervalo al descargar el plugin (lo llama main.onunload) */
export const pararTemporizador = (): void => {
    pararReloj();
    reiniciarCuentaAtras("temporizador-libre");
    pantalla.quitar();   // ningún candado de pantalla debe sobrevivir al plugin
    alPintar = null;
};

/* ── Formato ────────────────────────────────────────────────────────────── */
const fmt = (ms: number): string => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return (h ? `${h}:${dos(m)}` : String(m)) + `:${dos(s % 60)}`;
};

const horaDe = (ts: number): string => {
    const d = new Date(ts);
    return `${dos(d.getHours())}:${dos(d.getMinutes())}`;
};

const NS_SVG = "http://www.w3.org/2000/svg";
const svgEl = (tag: string, attrs: Record<string, string>): SVGElement => {
    const n = document.createElementNS(NS_SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
};

/* ═══════════════════════════════════════════════════════════════════════════
   El modal. Se puede cerrar (✕, Escape o clic fuera) sin parar la cuenta
   atrás: al reabrirlo se ve donde iba.
   ═══════════════════════════════════════════════════════════════════════════ */
export function abrirTemporizador(): void {
    const m = modal("⏱ Temporizador", "cuenta atrás libre · al cerrarla sigue corriendo");
    m.caja.classList.add("gym-temp-caja");
    ponerX(m, "Cerrar (la cuenta atrás sigue corriendo)");

    // ── Anillo con el tiempo dentro (arriba el total, abajo la hora del aviso) ──
    const anillo = el("div", "gym-temp-anillo");
    const svg = svgEl("svg", { viewBox: "0 0 200 200", "aria-hidden": "true" });
    const R = 88, C = 2 * Math.PI * R;
    svg.append(
        svgEl("circle", { cx: "100", cy: "100", r: String(R), class: "pista" }),
        svgEl("circle", { cx: "100", cy: "100", r: String(R), class: "barra" }),
    );
    const barra = svg.lastElementChild as SVGElement;
    barra.style.strokeDasharray = String(C);   // perímetro completo: con offset = 0 el anillo está lleno
    barra.setAttribute("transform", "rotate(-90 100 100)");   // empieza arriba
    const cen = el("div", "gym-temp-cen");
    const tTotal = el("div", "gym-temp-sub");
    const tGrande = el("div", "gym-temp-t");
    const tHora = el("div", "gym-temp-sub");
    cen.append(tTotal, tGrande, tHora);
    anillo.append(svg, cen);
    m.caja.appendChild(anillo);

    // ── Estado (el «Running» de la referencia) ──
    const estado = el("div", "gym-temp-estado");
    m.caja.appendChild(estado);

    // ── Ajuste a mano de horas / minutos / segundos (lo PRIMERO: es lo que se
    //    edita; los presets de abajo solo sobrescriben estos campos y arrancan).
    //    Va envuelto en su propia sección para poder ocultarla de golpe mientras
    //    el temporizador corre (modo pruebas, arriba del todo en el módulo). ──
    const secAjustar = el("div", "gym-temp-sec");
    secAjustar.appendChild(el("div", "gym-et gym-temp-tit", "Ajustar"));
    const filaAjuste = el("div", "gym-temp-ajuste");
    const entradas: HTMLInputElement[] = [];
    for (const [etq, max] of [["Horas", 99], ["Minutos", 59], ["Segundos", 59]] as [string, number][]) {
        const campo = el("div", "gym-temp-campo");
        const i = el("input");
        i.type = "number";
        i.min = "0";
        i.max = String(max);
        i.inputMode = "numeric";
        campo.append(el("div", "gym-et", etq), i);
        filaAjuste.appendChild(campo);
        entradas.push(i);
    }
    secAjustar.appendChild(filaAjuste);
    m.caja.appendChild(secAjustar);

    const msDeEntradas = (): number =>
        (Number(entradas[0].value) || 0) * 3600000
        + (Number(entradas[1].value) || 0) * 60000
        + (Number(entradas[2].value) || 0) * 1000;

    // ── Presets de un toque: carrusel lateral (se desliza en horizontal y no
    //    rompe la estrechez del modal). También se oculta al correr. ──
    const secRapidos = el("div", "gym-temp-sec");
    secRapidos.appendChild(el("div", "gym-et gym-temp-tit", "Rápidos"));
    const filaPres = el("div", "gym-temp-presets");
    const chips: HTMLButtonElement[] = [];
    const presets = conf().opcionesRapidasTemporizador.map(ms => [fmt(ms), ms] as const);
    for (const [txt, ms] of presets) {
        const c = el("button", "gym-chip gym-temp-chip", txt);
        c.type = "button";
        c.title = `Elegir una cuenta atrás de ${txt} (no arranca hasta que pulses Empezar)`;
        c.onclick = () => elegirDuracion(ms);
        filaPres.appendChild(c);
        chips.push(c);
    }
    secRapidos.appendChild(filaPres);
    m.caja.appendChild(secRapidos);

    // ── Controles: los ajustes del descanso de la sesión guiada (−15 s,
    //    ＋15 s). El botón principal y «Parar» van debajo, cada uno en su
    //    propia fila: el principal es el de usar y Parar el que se quiere
    //    separar de él para no tocarlo sin querer. (Antes había un «↺
    //    Reiniciar» junto a −15/＋15, pero hacía lo mismo que «⏹ Parar»:
    //    volver al principio, así que se eliminó.) ──
    const controles = el("div", "gym-temp-controles");
    const bMenos = el("button", "gym-btn-g", "−15 s"); bMenos.type = "button";
    bMenos.title = "Restar 15 segundos";
    const bMas = el("button", "gym-btn-g", "＋15 s"); bMas.type = "button";
    bMas.title = "Sumar 15 segundos";
    bMenos.onclick = () => ajustar(-15000);
    bMas.onclick = () => ajustar(15000);
    controles.append(bMenos, bMas);
    m.caja.appendChild(controles);

    // El botón principal lo es TODO: arranca con los campos puestos y, en
    // marcha o en pausa, hace de pausa/reanudar. No hay botón de pausa aparte.
    const bEmpezar = el("button", "gym-btn gym-temp-empezar primario", "▶ Empezar");
    bEmpezar.type = "button";
    bEmpezar.onclick = () => {
        if (finEn != null || pausado) { alternarPausa(); return; }   // en marcha o pausado: es el de pausa
        const ms = msDeEntradas();
        if (ms < 1000) return toast("⚠️ Pon al menos 1 segundo.", false);
        arrancar(ms);
    };
    m.caja.appendChild(bEmpezar);

    const bParar = el("button", "gym-btn-g gym-temp-parar", "⏹ Parar"); bParar.type = "button";
    bParar.title = "Parar la cuenta atrás y volver al principio";
    bParar.onclick = () => parar();
    m.caja.appendChild(bParar);

    // ── Repintado: lee el estado del módulo y lo refleja en pantalla ──
    const pintar = (): void => {
        if (!m.overlay.isConnected) { alPintar = null; return; }   // ya se cerró
        const r = restante();
        const corriendo = finEn != null;
        const listo = !corriendo && !pausado && guardado === 0;
        // Fracción del anillo: lo que queda de la duración elegida
        const base = corriendo ? r : pausado ? guardado : listo ? 0 : totalMs;
        const pct = totalMs > 0 ? Math.min(1, Math.max(0, base / totalMs)) : 0;
        barra.style.strokeDashoffset = String(C * (1 - pct));
        anillo.classList.toggle("listo", listo);
        anillo.classList.toggle("pausa", pausado);
        tTotal.textContent = listo ? "" : `de ${fmt(totalMs)}`;
        tGrande.textContent = listo ? "¡LISTO!" : fmt(r);
        tHora.textContent = corriendo ? `🔔 suena a las ${horaDe(Date.now() + r)}`
            : listo ? "pulsa un preset para volver a empezar" : "";

        estado.textContent = corriendo ? "● En marcha" : listo ? "✔ ¡Terminado!" : pausado ? "⏸ En pausa" : "⏹ Parado";
        estado.className = "gym-temp-estado" + (corriendo ? " on" : listo ? " listo" : "");

        // El botón principal lo es TODO: arranca, pausa y reanuda
        bEmpezar.textContent = corriendo ? "⏸ Pausa" : pausado ? "▶ Reanudar" : "▶ Empezar";
        bEmpezar.classList.toggle("primario", !corriendo);
        bEmpezar.classList.toggle("pausa", corriendo);
        bMenos.disabled = r <= 0;
        bParar.disabled = !corriendo && !pausado;
        // MODO PRUEBAS: mientras corre o está en pausa, Ajustar y Rápidos se
        // ocultan y solo quedan el anillo, el estado y los controles.
        const ocultar = OCULTAR_SECCIONES_AL_CORRER && (corriendo || pausado);
        secAjustar.classList.toggle("gym-oculto", ocultar);
        secRapidos.classList.toggle("gym-oculto", ocultar);
        // El preset elegido se resalta mientras esté vigente esa duración
        // (aunque aún no haya arrancado: elegirlo ya fija el tiempo)
        chips.forEach((c, i) => c.classList.toggle("on", totalMs === presets[i][1]));
    };

    const fijarEntradas = (ms: number): void => {
        const s = Math.round(ms / 1000);
        entradas[0].value = String(Math.floor(s / 3600));
        entradas[1].value = String(Math.floor((s % 3600) / 60));
        entradas[2].value = String(s % 60);
    };

    // Elegir un preset: fija la duración (campos «Ajustar» y anillo a la vez)
    // y deja el temporizador PARADO, a la espera de «▶ Empezar». Si había una
    // cuenta atrás en marcha o en pausa, se detiene.
    const elegirDuracion = (ms: number): void => {
        totalMs = Math.max(1000, ms);
        guardado = totalMs;
        finEn = null;
        pausado = false;
        pararReloj();
        pantalla.quitar();   // elegir preset detiene lo que hubiera en marcha
        fijarEntradas(totalMs);
        notificar();
    };

    fijarEntradas(guardado > 0 ? guardado : totalMs);
    alPintar = pintar;
    pintar();
}
