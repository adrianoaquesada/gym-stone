/* ═══════════════════════════════════════════════════════════════════════════
   Modo sesión guiada (teléfono): un ejercicio a la vez.

   Pantalla completa (overlay en document.body, clase .gym-modo; el CSS vive
   en styles.css). Un ejercicio cada vez, serie hecha/saltada, reloj de
   sesión, descanso con temporizador (al terminar pitido + vibración, si sus
   ajustes están encendidos —ver sonido.ts—) y guardado/reanudación a mitad
   de sesión. Al cerrar se retiran el intervalo del reloj, el listener de
   teclado y el reclamo de pantalla despierta, para no dejar fugas.
   ═══════════════════════════════════════════════════════════════════════════ */

import { CONFIG } from "../config";
import { ReclamoDespierta } from "../despierta";
import {
    descansoDe, diaPorId, diaProgramado, esLibre, esSaltada, esSinRegistrar,
    escribirRutina, repsObjetivoDe, seriesHechas, textoRepsObjetivo,
    tipoEjercicioDe, tipoSerieDe, tipoSerieDeRutina, ultimosValores,
} from "../datos";
import type { EjercicioDef, EjercicioSesion, Rutina, SerieSesion, Sesion, TipoSerie } from "../tipos";
import { pesoACampo, pesoAKg, pesoTexto } from "../unidades";
import { aNumero, dos, esc, fechaLegible, hoy, msgError } from "../util";
import { btn, confirmar, el, modal, pedirTexto, ponerX, toast } from "./componentes";
import { controlDescanso, elegirEjercicio, pedirDescanso } from "./ejercicios-ui";
import { reiniciarCuentaAtras, sonarCuentaAtras, sonarDescanso, sonarTemporizador, vibrar } from "./sonido";
import type { Pintar } from "./pintar";

/* ── Cierre de emergencia (main.onunload) ──────────────────────────────────
   Todo lo de una sesión abierta —el intervalo del reloj, el listener de
   teclado y el reclamo de pantalla despierta— vive en EL CLOSURE de
   modoSesion, fuera del alcance de limpiarOverlays(), que solo se lleva el
   overlay del DOM. Así la sesión se cierra de verdad al descargar el
   plugin (si no, el intervalo seguiría corriendo y el Escape abriría un
   diálogo sobre una sesión ya inexistente). */
const sesionesAbiertas = new Set<() => void>();

export const cerrarSesionesAbiertas = (): void => {
    for (const cierre of [...sesionesAbiertas]) cierre();
};

/* ── Tipos locales del modo ────────────────────────────────────────────────
   `objetivo` es el EjercicioDef del plan (o un equivalente local cuando el
   ejercicio viene de una sesión guardada en la rutina libre): solo se leen
   estos campos, así que aquí basta ese subconjunto. Los campos de tiempo
   viajan para poder reanudar un hold o un ciclo (decisión 18). */
type ObjetivoSesion = Pick<EjercicioDef,
    "series" | "repsObjetivo" | "tipoSerie" | "pesoObjetivo" | "descansoSeg" | "notas"
    | "tipoEjercicio" | "duracionObjetivo" | "trabajoSeg" | "transicionSeg">;

interface DefSesion {
    id: string;
    nombre: string;
    objetivo: ObjetivoSesion;
    plan: number;
    planOrigen: number;   // las filas ≥ planOrigen son series extra («＋1 serie»)
    series: SerieSesion[];   // completadas: [{ reps, peso }] o [{ saltada: true }]
    tipoSiguiente?: TipoSerie | null;   // etiqueta elegida para la serie que toca; ausente = la del plan
    notas: string;
}

/* ── Tipo de serie de cada serie ───────────────────────────────────────────
   El plan fija el tipo por defecto (EjercicioDef.tipoSerie; ausente =
   «trabajo») y cada serie puede cambiarlo al registrarse. La etiqueta se
   guarda en la propia serie (SerieSesion.tipoSerie) para que el historial no
   dependa de cambios posteriores del plan. */
const TIPOS_SERIE: [TipoSerie, string][] = [
    ["calentamiento", "Calentamiento"], ["trabajo", "Trabajo"],
    ["descenso", "Descenso"], ["fallo", "Fallo"],
];

const etiquetaTipoSerie = (t: TipoSerie): string =>
    TIPOS_SERIE.find(([v]) => v === t)?.[1] ?? "Trabajo";

// Selector compacto del tipo de serie (mismo patrón que el de la cabecera).
const selectorTipoSerie = (valor: TipoSerie, alCambiar: (v: TipoSerie) => void): HTMLSelectElement => {
    const sel = el("select", "font-size:.9em;font-family:inherit;background:var(--background-secondary);" +
        "border:1px solid var(--background-modifier-border);border-radius:8px;padding:4px 8px;" +
        "color:inherit;min-height:38px;");
    for (const [v, t] of TIPOS_SERIE) {
        const o = el("option", null, t);
        o.value = v;
        sel.appendChild(o);
    }
    sel.value = valor;
    sel.onchange = () => alCambiar(sel.value as TipoSerie);
    return sel;
};

// Etiqueta de la serie que toca: la elegida a mano o, si no hay, la del plan.
const tipoSerieSiguiente = (d: DefSesion): TipoSerie =>
    d.tipoSiguiente ?? tipoSerieDe(d.objetivo);

// Ejercicio del plan de ESTA rutina (en cualquier día), o null si no consta
// (huérfano o de otra rutina): su tipo de ejercicio respeta el plan y no se
// puede cambiar desde la sesión.
const enPlanDe = (rutina: Rutina, id: string): EjercicioDef | null =>
    (rutina.dias ?? []).flatMap(d => d.ejercicios ?? []).find(e => e.id === id) ?? null;

/* Fijar trabajo y transición de los ciclos de un «intervalo» SIN plan: los del
   plan traen sus campos del creador, pero un huérfano o de otra rutina no tiene
   de dónde cogerlos y la sesión no puede arrancar su ciclo (decisión 26). Mismo
   control compartido que el descanso. Devuelve null si se cierra sin guardar. */
const pedirCiclo = (trabajo: number | null, transicion: number | null):
    Promise<{ trabajo: number; transicion: number } | null> => new Promise(resolve => {
    const m = modal("⏱ Ciclo de intervalo", "segundos de trabajo y de transición de cada ciclo", true);
    let resuelto = false;
    const listo = (v: { trabajo: number; transicion: number } | null) => {
        if (resuelto) return;
        resuelto = true;
        document.removeEventListener("keydown", onKey);
        m.cerrar();
        resolve(v);
    };
    const onKey = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        if (document.getElementById("gym-confirm-activo")) return;
        listo(null);
    };
    m.overlay.onclick = e => { if (e.target === m.overlay) listo(null); };
    document.addEventListener("keydown", onKey);
    ponerX(m, "Cerrar sin cambiar").onclick = () => listo(null);
    const cTrab = controlDescanso(trabajo, { etiqueta: "Trabajo de cada ciclo (segundos)" });
    const cTrans = controlDescanso(transicion, { etiqueta: "Transición entre lados (segundos, 0 = ninguna)" });
    m.caja.appendChild(cTrab.raiz);
    m.caja.appendChild(cTrans.raiz);
    const ok = el("button", "gym-btn primario gym-btn-ancho gym-mt12", "✔ Guardar ciclo");
    ok.type = "button";
    ok.onclick = () => listo({ trabajo: cTrab.seg(), transicion: cTrans.seg() });
    m.caja.appendChild(ok);
});

interface AjustePlan { d: DefSesion; maxHoy: number }

export function elegirDiaGuiada(rutina: Rutina, pintar: Pintar): void {
    // Rutina libre: no hay días que elegir, se entra directo y los ejercicios
    // se van añadiendo dentro de la sesión. Si queda progreso sin terminar
    // (sesión en curso), se entra por SU día: el nombre con el que se bautizó
    // al empezar ES el id del día y la reanudación lo busca por ahí
    // (s.diaId === dia.id). Sin nombre guardado (diaId "") se entra igual que
    // siempre, en el día sintético de toda la vida.
    if (esLibre(rutina)) {
        const enCurso = (rutina.sesiones ?? []).find(s => s.enCurso);
        void modoSesion(rutina, enCurso?.diaId || null, pintar);
        return;
    }
    const prog = diaProgramado(rutina, hoy());
    if (prog) { void modoSesion(rutina, prog.id, pintar); return; }
    // Hoy no está programado: elegir a mano (una sesión en día no programado es válido)
    const m = modal("🎯 ¿Qué día vas a hacer?", `${fechaLegible(hoy())} · hoy no estaba programado`);
    const filaD = el("div", "gym-botones");
    for (const d of rutina.dias ?? []) {
        filaD.appendChild(btn(d.nombre, "primario", () => { m.cerrar(); void modoSesion(rutina, d.id, pintar); }));
    }
    m.caja.appendChild(filaD);
    m.caja.appendChild(btn("Cancelar", "", () => m.cerrar()));
}

// Medida de las áreas seguras de la pantalla (barra de estado con reloj y
// batería arriba, navegación de Android abajo). .gym-modo usa inset:0, que
// llega hasta el borde físico, así que sin este ajuste el contenido queda
// DETRÁS de las barras del sistema y los botones no se pueden tocar.
// env() solo devuelve un valor si el viewport trae viewport-fit=cover; si no,
// da 0 y hay que estimar. Se mide con una sonda y se publica en --gym-safe-*,
// que es lo que usa el CSS de .gym-modo.
const medirAreasSeguras = (): void => {
    const lee = (lado: string): number => {
        const s = createDiv();
        s.style.cssText = `position:absolute;top:-9999px;left:-9999px;visibility:hidden;`
            + `padding-${lado}:env(safe-area-inset-${lado},0px);`;
        document.body.appendChild(s);
        const v = (lado === "top" || lado === "bottom") ? s.offsetHeight : s.offsetWidth;
        s.remove();
        return v;
    };
    const t = lee("top"), b = lee("bottom"), iz = lee("left"), de = lee("right");
    // Si las cuatro salen 0 el viewport no expone las barras: en escritorio no
    // pasa nada (no las hay), pero en móvil hace falta una estimación.
    const tactil = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
    const valor = (medida: number, reserva: number): number => (medida > 0 ? medida : (tactil ? reserva : 0));
    const r = document.documentElement.style;
    // RESERVA = lo que se deja libre cuando el viewport no expone las barras
    // (que es lo normal en Obsidian). Si al cambiarla los botones se te quedan
    // muy pegados o muy metidos, es este número el que hay que tocar.
    r.setProperty("--gym-safe-top", `${valor(t, 20)}px`);      // barra de estado (reloj/batería)
    r.setProperty("--gym-safe-bottom", `${valor(b, 38)}px`);   // navegación de Android
    r.setProperty("--gym-safe-left", `${valor(iz, 0)}px`);
    r.setProperty("--gym-safe-right", `${valor(de, 0)}px`);
};

/* Copia de una serie para GUARDAR o REANUDAR: conserva su tiempo «t» (ms
   activos desde el inicio de la sesión) y su desglose descanso/ejecución si
   lo tiene, así los tiempos del detalle del día sobreviven a las idas y
   vueltas del progreso. En tiempo/intervalo viaja su `duracionSeg` (sin él,
   el registro se perdería al Guardar/Terminar). */
const aSerieGuardada = (s: SerieSesion): SerieSesion => ({
    ...(esSaltada(s) ? { saltada: true } : { reps: s.reps ?? null, peso: s.peso ?? null }),
    ...(s.duracionSeg != null ? { duracionSeg: s.duracionSeg } : {}),
    ...(s.tipoSerie ? { tipoSerie: s.tipoSerie } : {}),   // etiqueta puesta al registrarla
    ...(s.t != null ? { t: s.t } : {}),
    ...(s.descansoMs != null ? { descansoMs: s.descansoMs } : {}),
    ...(s.ejecMs != null ? { ejecMs: s.ejecMs } : {}),
});

/* Ejercicio a GUARDAR o REANUDAR: el registro queda autocontenido (decisión
   18) —tipo y campos de tiempo del plan—, así que al reanudar (o leerlo más
   adelante) no hace falta volver a mirar el plan, que puede haber cambiado.
   Los campos que no consten quedan ausentes (lectura defensiva de datos
   previos a este cambio). */
const aEjercicioGuardado = (d: DefSesion): EjercicioSesion => {
    const ej: EjercicioSesion = {
        ejercicioId: d.id,
        nombre: d.nombre,
        notas: d.notas || "",
        series: d.series.map(aSerieGuardada),
    };
    // El descanso viaja con el registro: si no, al reanudar o al
    // reabrirlo en el formulario se volvería a los 90 s. En intervalo el
    // 0 es un dato («sin descanso en el ciclo») y también viaja.
    const descSeg = d.objetivo?.descansoSeg;
    const desc = Number(descSeg);
    if (descSeg != null && (desc > 0 || tipoEjercicioDe(d.objetivo) === "intervalo"))
        ej.descansoSeg = Math.round(desc);
    ej.tipoEjercicio = tipoEjercicioDe(d.objetivo);
    const num = (v: number | null | undefined): number | null => {
        const n = Number(v);
        return n > 0 ? Math.round(n) : null;
    };
    const dur = num(d.objetivo?.duracionObjetivo);
    if (dur != null) ej.duracionObjetivo = dur;
    const trb = num(d.objetivo?.trabajoSeg);
    if (trb != null) ej.trabajoSeg = trb;
    const tra = num(d.objetivo?.transicionSeg);
    if (tra != null) ej.transicionSeg = tra;
    if (!ej.series.length && !ej.notas) ej.sinRegistrar = true;
    return ej;
};

export async function modoSesion(rutina: Rutina, diaId: string | null, pintar: Pintar): Promise<void> {
    medirAreasSeguras();   // antes de montar la pantalla: el padding sale de aquí
    // En la rutina libre no hay día al que afiliarse: la sesión se apoya en un
    // día sintético. Si viene un diaId con nombre (una sesión en curso de un
    // día bautizado, o una reanudación tras nombrarlo) ese nombre ES el id del
    // día, igual que en el formulario «＋ Registrar sesión»; sin nombre se
    // conserva el id vacío de siempre (los registros guardan diaId ""). El
    // null del llamador no casa con ningún id (comparación estricta, como en
    // el motor).
    const dia = diaPorId(rutina, diaId as string)
        ?? (esLibre(rutina) ? { id: diaId ?? "", nombre: diaId || "Sesión libre", ejercicios: [] } : null)
        ?? rutina.dias?.[0];
    if (!dia) return toast("⚠️ La rutina no tiene días definidos.", false);
    const defs: DefSesion[] = (dia.ejercicios ?? []).map(e => {
        const plan0 = Math.max(1, Number(e.series) || 1);
        return {
            id: e.id,
            nombre: e.nombre,
            objetivo: e,
            plan: plan0,
            planOrigen: plan0, // las filas ≥ planOrigen son series extra («＋1 serie»): se marcan y se pueden quitar
            series: [],          // completadas: [{ reps, peso }]
            notas: "",
        };
    });
    if (!defs.length && !esLibre(rutina)) return toast("⚠️ Ese día no tiene ejercicios.", false);
    // En la libre no: la sesión empieza VACÍA y se van añadiendo ejercicios
    // con «＋ Añadir ejercicio» (es lo que permite alternar variantes).

    let idx = 0, pausado = false;
    // Descanso: { restanteMs, totalMs, ej } — ej = ejercicio AL QUE PERTENECE.
    // Viaja al navegar (mirar otro ejercicio no lo quita): mientras esté en
    // curso no se registra nada en ningún otro ejercicio (✔ y ⏭ bloqueados).
    let descanso: { restanteMs: number; totalMs: number; ej: number } | null = null;
    // ── Hold (tipo «tiempo»): cronómetro de cuenta arriba. Viaja al navegar
    // como el descanso (ej = dueño); ms = tiempo acumulado (el reloj suma dt,
    // así que en pausa se congela y con la pantalla apagada no se atrasa).
    let hold: { ms: number; ej: number } | null = null;
    // ── Ciclo (tipo «intervalo»): fase trabajo/descanso de UN ciclo, también
    // con su dueño. Cada trabajo terminado registra SU serie solo y el
    // descanso del ciclo es interno (no usa `descanso`): decisiones 16-17.
    let ciclo: { fase: "trabajo" | "descanso"; n: number; ej: number; restanteMs: number; totalMs: number; trabajoSeg: number } | null = null;
    let iniciada = false, inicio = 0;   // la sesión no arranca hasta pulsar Iniciar
    // ── Pausa: el reloj mide TIEMPO ACTIVO — lo que dure una pausa no cuenta
    // ni en el reloj ni en los «t» de las series. Cada pausa se apunta (cuándo
    // y cuánto) para marcarla luego en la línea de tiempo del día.
    let pausaAcum = 0, pausaPend: number | null = null, pausaT0 = 0;
    const pausas: { t: number; ms: number }[] = [];
    // Último tic del reloj: de aquí sale el tiempo REAL que descuenta el
    // descanso (ver el intervalo del reloj, abajo del todo).
    let ultimoTick = Date.now();
    // ── Fin del descanso pendiente de ejecutar: el «¡Listo!» (o ⏭/-15 s)
    // marca cuándo empiezas la serie; al registrarla se reparte el «entre
    // series» en descanso REAL + ejecución. Viaja al navegar (como el
    // descanso) y se consume al registrar.
    let ejecDesde: number | null = null, ejecDesdeEj = -1;

    /* ── Pantalla despierta: mientras la sesión corre y no está en pausa, la
          pantalla no se apaga (el descanso y el cronómetro son la lección de
          despierta.ts; el ajuste del mismo nombre la puede apagar). ── */
    const pantalla = new ReclamoDespierta();
    const sincronizaPantalla = (): void => pantalla.fijar(iniciada && !pausado);

    // Progreso guardado a mitad de sesión (botón «Guardar» o cierre inesperado): se ofrece continuarlo.
    // El registro también sirve de hueco si se empieza de cero: Guardar lo actualiza y Terminar lo reemplaza.
    let parcialGuard: Sesion | null = (rutina.sesiones ?? []).find(s => s.enCurso && s.diaId === dia.id) || null;
    if (parcialGuard) {
        const nSeriesParcial = (parcialGuard.ejercicios ?? []).reduce(
            (t, x) => t + seriesHechas({ series: x.series }).length, 0);
        const nSinRegParcial = (parcialGuard.ejercicios ?? []).filter(esSinRegistrar).length;
        if (await confirmar("🔄 Progreso guardado",
            `Hay progreso guardado de «${dia.nombre}» · ${nSeriesParcial} series · ~${Number(parcialGuard.duracionMin) || 0} min.` +
            (nSinRegParcial ? ` · ${nSinRegParcial} ejercicio${nSinRegParcial > 1 ? "s" : ""} sin registrar` : "") +
            `\n\n¿Continuar desde donde lo dejaste?`,
            "Continuar", "Empezar desde cero")) {
            // Rutina libre: el día no aporta ejercicios, así que el plan se
            // reconstruye desde lo que había guardado en esa propia sesión.
            if (esLibre(rutina) && !defs.length) {
                for (const g of parcialGuard.ejercicios ?? []) {
                    const hechas = Math.max(1, (g.series ?? []).length);
                    // El descanso se eligió al añadir el ejercicio: se recupera
                    // del guardado (el 0 de intervalo es «sin descanso» y no cae
                    // al fallback) y, si no consta, del último registro conocido.
                    const descG = Number(g.descansoSeg);
                    const desc = g.descansoSeg != null
                        && (descG > 0 || tipoEjercicioDe(g) === "intervalo")
                        ? Math.round(descG)
                        : (descansoDe(rutina, g.ejercicioId) ?? 90);
                    defs.push({
                        id: g.ejercicioId,
                        nombre: g.nombre ?? g.ejercicioId,
                        objetivo: {
                            series: hechas, repsObjetivo: null, pesoObjetivo: null,
                            // Sin plan del que traerlo (rutina libre): el tipo de
                            // serie de cada serie se etiqueta al registrarla (3a)
                            tipoSerie: null,
                            descansoSeg: desc, notas: "",
                            // Tipo y campos de tiempo, del propio guardado
                            // (decisión 18; en datos previos quedan ausentes
                            // y la lectura defensiva da «peso»)
                            tipoEjercicio: g.tipoEjercicio ?? null,
                            duracionObjetivo: g.duracionObjetivo ?? null,
                            trabajoSeg: g.trabajoSeg ?? null,
                            transicionSeg: g.transicionSeg ?? null,
                        },
                        plan: hechas, planOrigen: hechas,   // todo lo guardado ya estaba en plan
                        series: (g.series ?? []).map(aSerieGuardada),
                        notas: g.notas || "",
                    });
                }
            }
            for (const d of defs) {
                const g = (parcialGuard.ejercicios ?? []).find(x => x.ejercicioId === d.id);
                if (g && Array.isArray(g.series)) {
                    d.series = g.series.map(aSerieGuardada);
                    if (g.notas) d.notas = g.notas;
                }
            }
            // Con 0 ejercicios el Math.min daría -1 y defs[-1] no existe: se acota a 0
            idx = Math.min(Math.max(0, Number(parcialGuard.idx) || 0), Math.max(0, defs.length - 1));
            const msParcial = Number(parcialGuard.transcurridoMs) || 0;
            if (msParcial > 0) { iniciada = true; inicio = Date.now() - msParcial; }   // el reloj sigue desde donde estaba
        }
    }

    const transcurridoMs = (): number => {
        // Tiempo ACTIVO de sesión: la pausa (pendiente o ya sumada) no cuenta
        if (!iniciada) return 0;
        const ahora = Date.now();
        return ahora - inicio - pausaAcum - (pausaPend != null ? ahora - pausaPend : 0);
    };
    const relojTexto = (ms: number): string => {
        const s = Math.max(0, Math.floor(ms / 1000));
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
        return (h ? `${h}:${dos(m)}` : String(m)) + `:${dos(s % 60)}`;
    };

    // ── Estructura ──
    const overlay = el("div", "gym-modo");
    overlay.id = "gym-modo-activo";
    const cajaM = el("div", "gym-modo-caja");
    overlay.appendChild(cajaM);

    const cab = el("div", "gym-modo-cab");
    const titCab = el("div", "flex:1;min-width:0;");
    const titDia = el("b", "gym-naranja", `🎯 ${dia.nombre}`);   // se refresca si se bautiza el día (libre)
    titCab.append(
        titDia,
        el("div", "gym-modo-fecha", fechaLegible(hoy())),
    );
    // El reloj lleva el mismo cuerpo que los botones de al lado (54 px, mismo estilo)
    const relojEl = el("span", "gym-btn-g");
    relojEl.style.cssText = "min-height:54px;padding:0 14px;display:inline-flex;align-items:center;" +
        "font-size:1.2em;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap;cursor:default;";
    const btnPausa = el("button", "gym-btn-g gym-btn-pausa", "⏸ Pausa"); btnPausa.type = "button";
    btnPausa.title = "Pausa: congela el cronómetro y el descanso";
    const btnCerrar = el("button", "gym-btn-g gym-cerrar-x gym-x54", "✕"); btnCerrar.type = "button";
    btnCerrar.title = "Salir sin guardar";
    cab.appendChild(titCab); cab.appendChild(relojEl);
    cab.appendChild(btnCerrar);
    cajaM.appendChild(cab);

    const cuerpo = el("div", "gym-modo-cuerpo");
    const progreso = el("div", "gym-modo-progreso");
    const etiquetaProgreso = el("div", "gym-et");
    const actualProgreso = el("span", "gym-modo-progreso-actual");
    const totalProgreso = el("span");
    etiquetaProgreso.append("Ejercicio ", actualProgreso, " de ", totalProgreso);
    const pasosProgreso = el("div", "gym-modo-pasos");
    pasosProgreso.setAttribute("role", "group");
    const indicadoresProgreso: HTMLSpanElement[] = [];
    progreso.append(etiquetaProgreso, pasosProgreso);
    cuerpo.appendChild(progreso);
    const contEj = el("div");
    cuerpo.appendChild(contEj);
    cajaM.appendChild(cuerpo);

    const barraAccion = el("div", "gym-modo-accion");   // pausa + Hecho: fija abajo, encima del pie
    cajaM.appendChild(barraAccion);

    const pie = el("div", "gym-modo-pie");
    cajaM.appendChild(pie);

    // ── Pintado del ejercicio actual ──
    let inReps: (HTMLInputElement | undefined)[] = [], inPeso: (HTMLInputElement | undefined)[] = [];
    let cajaDescanso: HTMLDivElement | null = null, tDescanso: HTMLDivElement | null = null;
    let barraDescanso: HTMLDivElement | null = null, btnAccion: HTMLButtonElement | null = null;
    // Cajas del hold y del ciclo (mutuamente excluyentes con la del descanso)
    let cajaCiclo: HTMLDivElement | null = null, tCiclo: HTMLDivElement | null = null;
    let barraCiclo: HTMLDivElement | null = null;
    let cajaHold: HTMLDivElement | null = null, tHold: HTMLDivElement | null = null;
    let barraHold: HTMLDivElement | null = null;

    const pintarDescanso = () => {
        // cajaDescanso, tDescanso y barraDescanso se montan juntos (o ninguno)
        if (!cajaDescanso || !tDescanso || !barraDescanso) return;
        const seg = Math.ceil((descanso?.restanteMs ?? 0) / 1000);
        const listo = descanso && descanso.restanteMs <= 0;
        cajaDescanso.classList.toggle("listo", Boolean(listo));
        tDescanso.textContent = listo ? "¡Listo!" : `${Math.floor(seg / 60)}:${dos(seg % 60)}`;
        const pct = descanso && descanso.totalMs > 0 ? Math.max(0, Math.min(100, descanso.restanteMs / descanso.totalMs * 100)) : 0;
        barraDescanso.style.width = pct.toFixed(1) + "%";
    };

    // Cuenta atrás de la fase del ciclo (el reloj la descuenta con dt real)
    const pintarCiclo = () => {
        if (!cajaCiclo || !tCiclo || !barraCiclo) return;
        const seg = Math.ceil((ciclo?.restanteMs ?? 0) / 1000);
        tCiclo.textContent = `${Math.floor(seg / 60)}:${dos(seg % 60)}`;
        const pct = ciclo && ciclo.totalMs > 0 ? Math.max(0, Math.min(100, ciclo.restanteMs / ciclo.totalMs * 100)) : 0;
        barraCiclo.style.width = pct.toFixed(1) + "%";
    };

    // Cuenta arriba del hold: en su caja y, en vivo, en el input de la serie
    // pendiente (los segundos que se registrarán al pulsar Terminar/✔)
    const pintarHold = () => {
        if (!cajaHold || !tHold) return;
        tHold.textContent = relojTexto(hold?.ms ?? 0);
        if (barraHold && hold) {
            const obj = Math.round(Number(defs[hold.ej]?.objetivo.duracionObjetivo) || 0);
            barraHold.style.width = obj > 0 ? Math.min(100, hold.ms / (obj * 1000) * 100).toFixed(1) + "%" : "100%";
        }
        if (hold && hold.ej === idx) {
            const inp = inReps[defs[idx].series.length];
            if (inp) inp.value = String(Math.floor(hold.ms / 1000));
        }
    };

    // La sesión empieza al pulsar «▶ Iniciar sesión»: hasta entonces no se puede
    // registrar nada en las series (ni ✔ ni ⏭).
    const iniciar = () => {
        if (iniciada || pausado) return;
        iniciada = true;
        inicio = Date.now();
        sincronizaPantalla();   // la sesión corre: la pantalla no se apaga
        pintarEjercicio();
    };

    const arrancarDescanso = (seg: number) => {
        ejecDesde = null;   // descanso nuevo: el «¡Listo!» anterior queda obsoleto
        descanso = { restanteMs: Math.max(5, seg) * 1000, totalMs: Math.max(5, seg) * 1000, ej: idx };
        pintarEjercicio();
    };

    /* ── Hold (tipo «tiempo»): cuenta arriba que se detiene a mano ──
       El cronómetro acumula ms en el reloj (pausa y pantalla apagada no le
       hacen daño) y pinta en vivo el tiempo en su caja y en el input de la
       serie pendiente: al pulsar ✔ (fila o «Terminar hold») esos segundos son
       los que se registran. */
    const empezarHold = (): void => {
        // Un descanso ACTIVO bloquea; el «¡Listo!» (cumplido) se consuma aquí,
        // como hace completarSerie al arrancar el siguiente
        if (!iniciada || pausado || (descanso && descanso.restanteMs > 0) || ciclo || hold) return;
        descanso = null;
        ejecDesde = transcurridoMs();   // la ejecución empieza AHÍ (desglose al registrar)
        ejecDesdeEj = idx;
        hold = { ms: 0, ej: idx };
        pintarEjercicio();
    };
    const cancelarHold = (): void => {
        if (!hold) return;
        if (ejecDesdeEj === hold.ej) ejecDesde = null;   // no queda un arranque huérfano
        // El tiempo cancelado no se queda precargado en el input (al repintar,
        // prev conservaría lo último pintado): se vacía y vuelve el objetivo)
        if (hold.ej === idx) {
            const inp = inReps[defs[idx].series.length];
            if (inp) inp.value = "";
        }
        hold = null;
        pintarEjercicio();
    };

    /* ── Ciclo (tipo «intervalo»): trabajo → descanso interno → siguiente ──
       Semiautomático (decisión 17): el usuario inicia cada ciclo; el trabajo
       corre solo y, al terminar, registra SU serie y arranca el descanso del
       ciclo (transición en los ciclos impares si la hay, y sin descanso tras
       el último — decisión 16, como la fuente liftoff). */
    const iniciarCiclo = (): void => {
        // Igual que empezarHold: el descanso activo bloquea y el «¡Listo!» se consuma
        if (!iniciada || pausado || (descanso && descanso.restanteMs > 0) || hold || ciclo) return;
        descanso = null;
        const ej = defs[idx];
        const trabajo = Math.round(Number(ej.objetivo.trabajoSeg) || 0);
        if (trabajo <= 0) {
            // Con plan, donde se fija es el creador; sin él, la cabecera trae
            // el control «· ciclo …» (decisión 26)
            toast(enPlanDe(rutina, ej.id)
                ? "⚠️ Este ejercicio no tiene tiempo de trabajo definido: pónlo en el creador."
                : "⚠️ Sin tiempo de trabajo: tócalo en «· ciclo …» de la cabecera.", false);
            return;
        }
        ejecDesde = transcurridoMs();   // la ejecución del ciclo empieza AHÍ
        ejecDesdeEj = idx;
        ciclo = { fase: "trabajo", n: ej.series.length + 1, ej: idx,
                  restanteMs: trabajo * 1000, totalMs: trabajo * 1000, trabajoSeg: trabajo };
        pintarEjercicio();
    };
    const cancelarCiclo = (): void => {
        if (!ciclo) return;
        if (ejecDesdeEj === ciclo.ej) ejecDesde = null;
        ciclo = null;   // el ciclo queda pendiente: se repite o se salta con ⏭
        pintarEjercicio();
    };

    // Fin del TRABAJO de un ciclo: registra la serie (sola) y pasa al descanso
    const finTrabajoCiclo = (): void => {
        if (!ciclo || ciclo.fase !== "trabajo") return;
        const c = ciclo;
        const ej = defs[c.ej];
        const t0 = transcurridoMs();
        const serie: SerieSesion = { duracionSeg: c.trabajoSeg, t: t0, tipoSerie: tipoSerieSiguiente(ej) };
        const previa = ej.series.length ? ej.series[ej.series.length - 1] : null;
        if (previa?.t != null && ejecDesde != null && ejecDesdeEj === c.ej
            && ejecDesde > previa.t && ejecDesde <= t0) {
            serie.descansoMs = ejecDesde - previa.t;
            serie.ejecMs = t0 - ejecDesde;
        }
        ej.series.push(serie);
        ej.tipoSiguiente = null;   // el siguiente ciclo vuelve al tipo del plan
        ejecDesde = null;
        sonarTemporizador();   // fin de la fase (mismo aviso del ⏱ libre)
        vibrar();
        // Tras el último ciclo no hay descanso (decisión 16)
        const ultimo = ej.series.length >= ej.plan;
        const trans = Math.max(0, Math.round(Number(ej.objetivo.transicionSeg) || 0));
        const cambiar = trans > 0 && c.n % 2 === 1;   // «cambiar de lado» en los impares
        const resto = ultimo ? 0 : (cambiar ? trans : Math.max(0, Math.round(Number(ej.objetivo.descansoSeg) || 0)));
        ciclo = resto > 0
            ? { fase: "descanso", n: c.n, ej: c.ej, restanteMs: resto * 1000, totalMs: resto * 1000, trabajoSeg: c.trabajoSeg }
            : null;
        // Como al «¡Listo!» del descanso: si estabas mirando otro ejercicio,
        // se vuelve DESLIZANDO al dueño del ciclo
        const due = c.ej;
        if (due !== idx && due >= 0 && due < defs.length && !animando) deslizarA(due);
        else pintarEjercicio();
    };

    // Fin del DESCANSO de un ciclo: avisa y queda listo el siguiente
    const finDescansoCiclo = (): void => {
        if (!ciclo) return;
        const due = ciclo.ej;
        ciclo = null;
        sonarTemporizador();
        vibrar();
        if (due !== idx && due >= 0 && due < defs.length && !animando) deslizarA(due);
        else pintarEjercicio();
    };

    // ⏭ Saltar el descanso de un ciclo: acción tuya, SIN aviso (como el
    // ⏭ Saltar descanso del descanso de siempre — ver finDescanso)
    const saltarDescansoCiclo = (): void => {
        if (!ciclo || ciclo.fase !== "descanso") return;
        const due = ciclo.ej;
        ciclo = null;
        if (due >= 0 && due !== idx && due < defs.length && !animando) deslizarA(due);
        else pintarEjercicio();
    };

    const completarSerie = (iSet: number) => {
        if (!iniciada || pausado) return;   // sin sesión iniciada (o en pausa) no se completan series
        if ((descanso?.restanteMs ?? 0) > 0) return;   // durante el descanso tampoco: hay que esperar (o ⏭ Saltar descanso)
        if (ciclo) return;   // un ciclo registra SU serie solo al terminar el trabajo (decisión 17)
        if (hold && hold.ej !== idx) return;   // hold de OTRO ejercicio: aquí solo miras
        const ej = defs[idx];
        if (iSet !== ej.series.length) return;   // solo la serie que toca, en orden: evita huecos que rompen la lista
        const tipo = tipoEjercicioDe(ej.objetivo);
        if (tipo === "intervalo") return;   // sin registro manual: cada ciclo se registra solo
        const etiqueta = tipoSerieSiguiente(ej);   // etiqueta de ESTA serie (default: la del plan)
        const t0 = transcurridoMs();   // «t» = cuándo pasó (tiempo activo, sin pausas)
        let serie: SerieSesion;
        if (tipo === "peso") {
            const escritas = aNumero(inReps[iSet]?.value);
            if (escritas == null && etiqueta === "fallo") {
                // En «al fallo» no hay número de reserva que poner en su sitio: sin
                // las reps escritas no se registra la serie (volumen y gráficas
                // saldrían a cero). Escribe lo que has hecho y vuelve a pulsar ✔.
                toast("✏️ Escribe las repeticiones que has hecho en esta serie.", false);
                return;
            }
            const reps = escritas ?? repsObjetivoDe(ej.objetivo) ?? null;
            const peso = pesoAKg(inPeso[iSet]?.value) ?? ej.objetivo.pesoObjetivo ?? null;
            serie = { reps, peso, t: t0 };
        } else {
            // «tiempo»: los segundos del input (el cronómetro los escribe en
            // vivo mientras haces el hold) o, sin valor, el objetivo del plan
            const dur = aNumero(inReps[iSet]?.value) ?? ej.objetivo.duracionObjetivo ?? null;
            if (dur == null || dur <= 0) {
                toast(hold ? "⏳ Hold demasiado corto: no se registra."
                           : "✏️ Escribe los segundos mantenidos (o usa el cronómetro).", false);
                if (hold) cancelarHold();   // retira su caja y el arranque huérfano (ejecDesde)
                return;
            }
            serie = { duracionSeg: Math.round(dur), t: t0 };
        }
        serie.tipoSerie = etiqueta;   // la etiqueta viaja con la serie (historial estable)
        // Si el descanso ya cumplió («¡Listo!» o salto: ejecDesde), sabemos
        // cuándo empezaste la serie → se desglosa descanso real + ejecución
        const previa = iSet > 0 ? ej.series[iSet - 1] : null;
        if (previa?.t != null && ejecDesde != null && ejecDesdeEj === idx
            && ejecDesde > previa.t && ejecDesde <= t0) {
            serie.descansoMs = ejecDesde - previa.t;
            serie.ejecMs = t0 - ejecDesde;
        }
        ej.series[iSet] = serie;
        ej.tipoSiguiente = null;   // la siguiente vuelve al tipo del plan
        ejecDesde = null;   // consumido por esta serie
        if (hold?.ej === idx) hold = null;   // Terminar del hold: su tiempo ya está en la serie
        arrancarDescanso(Number(ej.objetivo.descansoSeg) || 90);   // descanso tras cada serie
    };

    // Saltar la serie que toca: se MARCA como saltada (ocupa su hueco en el plan)
    // en vez de saltársela en silencio, para que el registro cuadre con la rutina.
    const saltarSerie = (iSet: number) => {
        if (!iniciada || pausado) return;   // antes de iniciar (o en pausa) no se registra nada
        // Descanso de OTRO ejercicio: aquí solo se mira (saltar también registra).
        // El descanso PROPIO sí se puede saltar: es lo que hace ⏭ en su fila.
        if ((descanso?.restanteMs ?? 0) > 0 && descanso!.ej !== idx) return;
        if (ciclo) return;   // un ciclo no se salta desde la fila: cancelalo (o espera a su fin)
        if (hold && hold.ej !== idx) return;   // hold de OTRO ejercicio: aquí solo miras
        const ej = defs[idx];
        if (iSet !== ej.series.length) return;   // solo la serie que toca
        // También la saltada deja constancia de cuándo y de la etiqueta que
        // tocaba (decisión 24): al reabrir o reeditar no se pierde
        ej.series[iSet] = { saltada: true, t: transcurridoMs(), tipoSerie: tipoSerieSiguiente(ej) };
        ej.tipoSiguiente = null;   // la etiqueta elegida no pasa a la siguiente
        ejecDesde = null;   // no hay ejecución que medir (y el descanso propio se cancela abajo)
        descanso = null;
        if (hold?.ej === idx) hold = null;   // al saltar la serie del hold, se cancela su cronómetro
        pintarEjercicio();
    };

    const deshacerSerie = (iSet: number) => {
        const ej = defs[idx];
        // Con un hold o un ciclo PROPIO en marcha, la serie que registren al
        // terminar se apilaría sobre la deshecha: primero cancela (o espera).
        if (hold?.ej === idx || ciclo?.ej === idx) return;
        const eraUltima = iSet === ej.series.length - 1;
        const etiqueta = ej.series[iSet]?.tipoSerie ?? null;
        ej.series.splice(iSet, 1);
        // Si la deshecha era la que tocaba, vuelve a serlo y recupera su
        // etiqueta; si era intermedia, la etiqueta de la próxima no cambia.
        if (eraUltima) ej.tipoSiguiente = etiqueta;
        // Si era una serie extra, además se retira la fila (sin borrar otras series extra añadidas)
        if (iSet >= ej.planOrigen) ej.plan = Math.max(ej.planOrigen, ej.plan - 1, ej.series.length);
        if (descanso && descanso.ej === idx) descanso = null;   // solo el descanso propio: no se cancela un descanso ajeno
        if (ejecDesdeEj === idx) ejecDesde = null;   // el «¡Listo!» deja de ser el arranque de nada
        pintarEjercicio();
    };

    const irAEjercicio = (n: number) => {
        // Navegar NO quita el descanso: si estás descansando puedes ir a ver
        // otro ejercicio y el reloj sigue corriendo (se ve con su dueño en la
        // caja). Solo se retira «¡Listo!»: ese descanso ya cumplió.
        if (descanso && descanso.restanteMs <= 0) descanso = null;
        idx = n;
        inReps = []; inPeso = [];   // no arrastrar los inputs del ejercicio anterior
        pintarEjercicio();
    };
    const siguiente = () => {
        if (idx + 1 >= defs.length) return terminar();
        irAEjercicio(idx + 1);
    };

    // Añade un ejercicio a la sesión en curso. Solo se puede añadir desde el
    // ÚLTIMO ejercicio (los que faltan por recorrer se completan o se saltan
    // antes) y, si el ejercicio en curso está sin terminar, el nuevo queda al
    // final SIN llevarte a él: no se interrumpe lo que estás haciendo.
    const anadirEjercicioBoton = (): HTMLButtonElement => {
        const b = el("button", "gym-btn-g", "＋ Añadir ejercicio");
        b.type = "button";
        const noUltimo = defs.length > 0 && idx < defs.length - 1;
        if (noUltimo) {
            b.disabled = true;
            b.title = "Solo se pueden añadir ejercicios desde el último: avanza (⏭ siguiente) hasta llegar a él";
        } else {
            b.title = "Añadir otro ejercicio a esta sesión: cada variante cuenta aparte en el historial";
        }
        b.onclick = async () => {
            if (noUltimo) return;
            const r = await elegirEjercicio(rutina, { excluir: defs.map(d => d.id) });
            if (!r) return;
            const u = ultimosValores(rutina, r.id);
            const plan0 = Math.max(1, Math.min(10, Number(u?.series) || 3));
            const actual = defs[idx];
            const sinTerminar = actual ? actual.series.length < actual.plan : false;
            // Tipo y campos de tiempo: del plan de ESTA rutina si el ejercicio
            // está en él; si no (huérfano o de otra rutina), el del ÚLTIMO
            // REGISTRO y, en su defecto, «peso» (decisión 18; en la cabecera
            // el tipo se puede cambiar luego, decisión 26).
            const enPlan = enPlanDe(rutina, r.id);
            // En el plan manda su tipo (ausente = «peso» del contrato); fuera
            // de él, el del último registro y, en su defecto, «peso» (26)
            const tipoIni = enPlan ? enPlan.tipoEjercicio ?? null : u?.tipoEjercicio ?? null;
            defs.push({
                id: r.id, nombre: r.nombre,
                // Aquí SÍ se precarga lo último, porque en la guiada nada se guarda
                // hasta que el usuario pulsa ✔ en cada serie: no puede haber datos
                // inventados, solo el valor inicial del campo. En tiempo e
                // intervalo no hay reps ni peso que traer.
                objetivo: {
                    series: plan0,
                    repsObjetivo: tipoIni == null || tipoIni === "peso" ? u?.reps ?? null : null,
                    pesoObjetivo: tipoIni == null || tipoIni === "peso" ? u?.peso ?? null : null,
                    // El descanso viene del selector (con el del último registro ya
                    // precargado); si no se puso ninguno, los 90 s de siempre (en
                    // intervalo el 0 es «sin descanso en el ciclo» y se respeta).
                    // El tipo de serie, del plan del ejercicio (si lo hay).
                    tipoSerie: tipoSerieDeRutina(rutina, r.id),
                    descansoSeg: r.descansoSeg > 0 || tipoIni === "intervalo" ? Math.round(r.descansoSeg) : 90,
                    notas: "",
                    tipoEjercicio: tipoIni,
                    duracionObjetivo: enPlan?.duracionObjetivo ?? null,
                    trabajoSeg: enPlan?.trabajoSeg ?? null,
                    transicionSeg: enPlan?.transicionSeg ?? null,
                },
                plan: plan0, planOrigen: plan0,
                series: [], notas: "",
            });
            if (sinTerminar) {
                // Se sigue en el ejercicio de siempre (el descanso también): el
                // nuevo aparece en «Ejercicio X de Y» y tocará más adelante.
                toast(`＋ ${r.nombre} añadido: tocará cuando termines «${actual.nombre}»`);
            } else {
                if (descanso && descanso.ej === idx) descanso = null;   // solo el descanso propio
                if (ejecDesdeEj === idx) ejecDesde = null;
                idx = defs.length - 1;   // el anterior estaba hecho: el nuevo es el que toca
                inReps = []; inPeso = [];
                toast(`＋ ${r.nombre} añadido a la sesión`);
            }
            pintarEjercicio();
        };
        return b;
    };

    /* ── Nombre del día (solo rutinas libres) ──
       En la libre el nombre del día ES su identificador (como en el formulario
       «＋ Registrar sesión»): lo que se teclea se usa como id/nombre del día
       sintético, de modo que al guardar la sesión queda diaId = ese nombre y
       nombreDia() lo muestra después en tablas, estadísticas e historial.
       Con el campo vacío se conserva el comportamiento de siempre: id "" y
       «Sesión libre» (nombreDia muestra «Libre») — es lo que menos rompe,
       porque los guardados antiguos ya usan diaId "" y la reanudación sigue
       buscando ese mismo valor. Las rutinas planificadas no se tocan: ahí el
       día viene del plan. */
    const aplicarNombreDia = (texto: string): void => {
        if (!esLibre(rutina)) return;
        const nombre = texto.trim();
        dia.id = nombre;
        dia.nombre = nombre || "Sesión libre";
        titDia.textContent = `🎯 ${dia.nombre}`;
    };

    const pintarProgreso = (): void => {
        const ej = defs[idx];
        progreso.hidden = !ej;
        if (!ej) return;
        actualProgreso.textContent = String(idx + 1);
        totalProgreso.textContent = String(defs.length);
        pasosProgreso.setAttribute("aria-label", `Progreso de ejercicios: ${idx + 1} de ${defs.length}`);
        while (indicadoresProgreso.length < defs.length) {
            const paso = el("span", "gym-modo-paso");
            paso.setAttribute("role", "img");
            indicadoresProgreso.push(paso);
            pasosProgreso.appendChild(paso);
        }
        while (indicadoresProgreso.length > defs.length) {
            indicadoresProgreso.pop()?.remove();
        }
        defs.forEach((def, i) => {
            const completadas = def.series.filter(s => !s.saltada).length;
            const saltadas = def.series.filter(s => s.saltada).length;
            const terminado = def.series.length >= def.plan;
            const estado = i === idx ? "actual"
                : completadas >= def.plan ? "completado"
                    : terminado && completadas === 0 && saltadas > 0 ? "omitido"
                        : completadas + saltadas > 0 ? "parcial" : "pendiente";
            const descripcion = estado === "actual" ? "ejercicio actual"
                : estado === "completado" ? "completado"
                    : estado === "omitido" ? "omitido"
                        : estado === "parcial" ? "en curso" : "pendiente";
            const paso = indicadoresProgreso[i];
            paso.className = `gym-modo-paso ${estado}`;
            paso.title = `${def.nombre}: ${descripcion}`;
            paso.setAttribute("aria-label", `${def.nombre}: ${descripcion}`);
            if (i === idx) paso.setAttribute("aria-current", "step");
            else paso.removeAttribute("aria-current");
        });
    };

    const pintarEjercicio = () => {
        const ej = defs[idx];
        pintarProgreso();
        relojEl.textContent = `⏱ ${relojTexto(transcurridoMs())}`;   // el reloj se refresca también en cada repintado
        // Conservar lo escrito a mano en reps/peso al repintar (p. ej. al pulsar Iniciar o ＋1 serie)
        const prev: Partial<Record<number, { reps: string; peso: string }>> = {};
        inReps.forEach((inp, i) => { if (inp) prev[i] = { reps: inp.value, peso: inPeso[i]?.value ?? "" }; });
        inReps = []; inPeso = [];
        contEj.empty();

        // ── Sesión sin ejercicios (rutina libre recién abierta) ──
        // Sin nada que recorrer no tiene sentido el pie de navegación ni la
        // acción principal: la única salida es añadir el primer ejercicio.
        pie.style.display = defs.length ? "" : "none";
        if (!ej) {
            contEj.appendChild(el("div", "gym-et", "Sesión libre"));
            contEj.appendChild(el("div", "gym-modo-ej", "Añade tu primer ejercicio"));
            contEj.appendChild(el("div", "font-size:.92em;opacity:.8;line-height:1.5;",
                "Aquí no hay plan previo: elige o escribe lo que vas a hacer y registra cada serie " +
                "con sus repeticiones y su peso. Puedes alternar variantes de un día para otro."));
            // ── Nombre del día: se pide ANTES del primer ejercicio, que es el
            // momento en que se sabe cómo se va a llamar esta sesión. Se aplica
            // AL ESCRIBIR (oninput), así que el nombre sobrevive a cualquier
            // repintado (p. ej. al pulsar «＋ Añadir ejercicio») sin que nadie
            // tenga que recordárselo a la hora de guardar (diaId: dia.id).
            if (esLibre(rutina)) {
                const cNombre = el("div", "gym-fila");
                cNombre.appendChild(el("div", "gym-et", "Nombre del día"));
                const inNombre = el("input");
                inNombre.type = "text";
                inNombre.value = dia.nombre;
                inNombre.placeholder = "Sesión libre";
                inNombre.setAttribute("aria-label", "Nombre del día");
                // Mismo aire que los inputs de los modales (styles.css no tiene
                // una clase para esto dentro de .gym-modo): estilos en línea.
                inNombre.style.cssText = "width:100%;min-height:48px;padding:10px 11px;border-radius:8px;" +
                    "font-size:1em;border:1px solid var(--background-modifier-border);" +
                    "background:var(--background-secondary);color:var(--text-normal);";
                inNombre.oninput = () => aplicarNombreDia(inNombre.value);
                cNombre.appendChild(inNombre);
                contEj.appendChild(cNombre);
            }
            const bAnadir0 = anadirEjercicioBoton();
            bAnadir0.classList.add("gym-btn-anadir0");   // ancho/alto completo (CSS)
            contEj.appendChild(bAnadir0);
            barraAccion.replaceChildren();
            bVolver.disabled = true;
            return;
        }

        contEj.appendChild(el("div", "gym-modo-ej", ej.nombre));
        const cMeta = el("div", "font-size:.9em;opacity:.8;");
        const tipo = tipoEjercicioDe(ej.objetivo);
        // Texto del objetivo según el tipo de ejercicio: reps+peso, hold o ciclos
        let meta: string;
        if (tipo === "peso") {
            // Las reps según el tipo de serie: «10 reps» o «al fallo» (sin número)
            const repsTxt = textoRepsObjetivo(ej.objetivo);
            const fallo = tipoSerieDe(ej.objetivo) === "fallo";
            meta = `${ej.plan} × ${fallo ? repsTxt : `${repsTxt} reps`} @ ${ej.objetivo.pesoObjetivo != null ? pesoTexto(ej.objetivo.pesoObjetivo) : "sin peso"}`;
        } else if (tipo === "tiempo") {
            const dur = Math.round(Number(ej.objetivo.duracionObjetivo) || 0);
            meta = `${ej.plan} × hold${dur > 0 ? ` de ${dur} s` : ""}`;
        } else {
            const trab = Math.round(Number(ej.objetivo.trabajoSeg) || 0);
            const trans = Math.round(Number(ej.objetivo.transicionSeg) || 0);
            const descC = Math.round(Number(ej.objetivo.descansoSeg) || 0);
            meta = `${ej.plan} ciclos × ${trab} s de trabajo` +
                (trans > 0 ? ` · ${trans} s de transición` : "") +
                (descC > 0 ? ` · ${descC} s de descanso` : " · sin descanso");
        }
        cMeta.appendChild(el("span", "", meta));
        // El descanso se puede cambiar en caliente desde aquí (subrayado a
        // puntos: no es texto, es un control). 0 o vacío vuelve a 90 s (en
        // intervalo el 0 es de verdad: significa «sin descanso en el ciclo»).
        const dSeg = tipo === "intervalo"
            ? Math.max(0, Math.round(Number(ej.objetivo.descansoSeg) || 0))
            : Number(ej.objetivo.descansoSeg) || 90;
        const bDesc = el("button", "", ` · descanso ${dSeg} s`);
        bDesc.type = "button";
        bDesc.title = tipo === "intervalo" ? "Tocar para cambiar el descanso de cada ciclo"
                                           : "Tocar para cambiar el descanso entre series";
        // Enlace subrayado de la cabecera: controles de la cabecera, no texto
        const estiloEnlace = "font-size:1em;font-family:inherit;background:none;border:none;" +
            "padding:0 2px;cursor:pointer;color:inherit;opacity:.9;text-decoration:underline dotted;";
        bDesc.style.cssText = estiloEnlace;
        bDesc.onclick = async () => {
            const v = await pedirDescanso(dSeg);
            if (v == null) return;
            ej.objetivo.descansoSeg = tipo === "intervalo" ? Math.max(0, Math.round(v))
                                                           : (v > 0 ? Math.round(v) : 90);
            pintarEjercicio();
        };
        cMeta.appendChild(bDesc);
        // Un «intervalo» SIN plan no trae trabajo ni transición del creador y la
        // sesión no podría arrancar ningún ciclo: aquí se fijan (decisión 26).
        if (tipo === "intervalo" && !enPlanDe(rutina, ej.id)) {
            const trab = Math.round(Number(ej.objetivo.trabajoSeg) || 0);
            const trans = Math.round(Number(ej.objetivo.transicionSeg) || 0);
            const bCiclo = el("button", "", ` · ciclo ${trab > 0 ? `${trab} s` : "＋"}`);
            bCiclo.type = "button";
            bCiclo.title = `Tocar para fijar los ciclos: trabajo${trans > 0 ? ` y transición (${trans} s)` : ""}`;
            bCiclo.style.cssText = estiloEnlace;
            bCiclo.onclick = async () => {
                const v = await pedirCiclo(ej.objetivo.trabajoSeg ?? null, ej.objetivo.transicionSeg ?? null);
                if (v == null) return;
                ej.objetivo.trabajoSeg = v.trabajo > 0 ? Math.round(v.trabajo) : null;
                ej.objetivo.transicionSeg = v.transicion > 0 ? Math.round(v.transicion) : null;
                pintarEjercicio();
            };
            cMeta.appendChild(bCiclo);
        }
        // El tipo de serie también se cambia aquí, igual que el descanso: en la
        // rutina libre no hay plan del que traerlo, así que esta cabecera es el
        // único sitio donde configurarlo. Si el ejercicio viene del plan, el
        // cambio se aplica a ESE ejercicio (se guarda con la rutina, como el
        // descanso hecho en caliente).
        const selTipo = el("select");
        for (const [v, t] of [["", "Trabajo"], ["calentamiento", "Calentamiento"], ["descenso", "Descenso"], ["fallo", "Fallo"]] as const) {
            const o = el("option", null, t); o.value = v; selTipo.appendChild(o);
        }
        selTipo.value = ej.objetivo.tipoSerie ?? "";
        selTipo.title = "Tipo de serie del plan: cómo se leen las reps (en «fallo» se anotan al fallo, sin número objetivo).";
        selTipo.style.cssText = "font-size:.95em;font-family:inherit;background:var(--background-secondary);" +
            "border:1px solid var(--background-modifier-border);border-radius:6px;padding:1px 5px;" +
            "cursor:pointer;color:inherit;margin-left:6px;max-width:140px;";
        selTipo.onchange = () => {
            const v = selTipo.value;
            ej.objetivo.tipoSerie = v === "calentamiento" || v === "descenso" || v === "fallo" ? v : null;
            // Las reps pendientes dejan de seguir el número anterior: se vacían
            // y pintarEjercicio vuelve a precargar las que toquen según el tipo
            inReps.forEach(i => { if (i) i.value = ""; });
            pintarEjercicio();
        };
        cMeta.appendChild(selTipo);
        // El tipo de ejercicio también se elige aquí cuando NO viene del plan
        // (recién añadido, huérfano o de otra rutina; decisión 26): los del
        // plan respetan el suyo. Cambiarlo vacía los datos del tipo anterior
        // (mismo criterio que la decisión 13 del creador).
        if (!enPlanDe(rutina, ej.id)) {
            const selTipoEj = el("select", "font-size:.95em;font-family:inherit;background:var(--background-secondary);" +
                "border:1px solid var(--background-modifier-border);border-radius:6px;padding:1px 5px;" +
                "cursor:pointer;color:inherit;margin-left:6px;max-width:120px;");
            for (const [v, t] of [["peso", "Peso"], ["tiempo", "Tiempo"], ["intervalo", "Intervalo"]] as const) {
                const o = el("option", null, t); o.value = v; selTipoEj.appendChild(o);
            }
            selTipoEj.value = tipo;
            // Con un hold o un ciclo activo el tipo no se toca: cambiarlo en
            // caliente metería los segundos de un tipo en los campos del otro
            const bloqueado = hold?.ej === idx || ciclo?.ej === idx;
            selTipoEj.disabled = bloqueado;
            selTipoEj.title = bloqueado
                ? "Termina o cancela el hold o el ciclo en marcha para cambiar el tipo"
                : "Tipo de ejercicio: reps y peso, hold por tiempo o ciclos de intervalo.";
            selTipoEj.onchange = () => {
                const v = selTipoEj.value === "tiempo" || selTipoEj.value === "intervalo" ? selTipoEj.value : "peso";
                ej.objetivo.tipoEjercicio = v;
                // Los datos del tipo anterior dejan de servir: se vacían y
                // pintarEjercicio vuelve a precargar lo que toque según el nuevo
                ej.objetivo.repsObjetivo = null;
                ej.objetivo.pesoObjetivo = null;
                ej.objetivo.duracionObjetivo = null;
                ej.objetivo.trabajoSeg = null;
                ej.objetivo.transicionSeg = null;
                inReps.forEach(i => { if (i) i.value = ""; });
                inPeso.forEach(i => { if (i) i.value = ""; });
                pintarEjercicio();
            };
            cMeta.appendChild(selTipoEj);
        }
        contEj.appendChild(cMeta);
        if (ej.objetivo.notas) contEj.appendChild(el("div", "font-size:.82em;opacity:.65;font-style:italic;", `💡 ${ej.objetivo.notas}`));
        if (ej.notas) contEj.appendChild(el("div", "font-size:.85em;margin-top:4px;", `📝 ${esc(ej.notas)}`));

        // Los temporizadores se montan después de las series para separarlos
        // de la información del ejercicio y mantenerlos bajo los controles.
        const zonaTemporizador = el("div", "gym-modo-temporizador");
        // Descanso / ciclo / hold son mutuamente excluyentes. Sus refs se
        // limpian aquí para que el reloj no pinte sobre una caja desmontada.
        cajaDescanso = null; tDescanso = null; barraDescanso = null;
        cajaCiclo = null; tCiclo = null; barraCiclo = null;
        cajaHold = null; tHold = null; barraHold = null;
        if (descanso) {
            cajaDescanso = el("div", "gym-descanso");
            tDescanso = el("div", "t");
            const barraWrap = el("div", "height:6px;border-radius:4px;background:var(--background-secondary);overflow:hidden;margin:8px 0;");
            barraDescanso = el("div", `height:100%;width:100%;background:${CONFIG.NARANJA};`);
            barraWrap.appendChild(barraDescanso);
            cajaDescanso.appendChild(el("div", "gym-et", "⏳ Descanso"));
            cajaDescanso.appendChild(tDescanso);
            cajaDescanso.appendChild(barraWrap);
            const fDesc = el("div", "display:flex;gap:8px;justify-content:center;flex-wrap:wrap;");
            const bMenos = el("button", "gym-btn-g", "−15 s"); bMenos.type = "button";
            bMenos.title = "Restar 15 segundos al descanso";
            if ((descanso?.restanteMs ?? 0) <= 0) bMenos.disabled = true;   // «¡Listo!»: no hay tiempo que restar
            bMenos.onclick = () => {
                if (!descanso) return;
                descanso.restanteMs = Math.max(0, descanso.restanteMs - 15000);
                // Al llegar a 0, el MISMO fin que si lo marcara el reloj
                // («¡Listo!» o devolución al dueño si estábamos mirando otro)
                if (descanso.restanteMs <= 0) finDescanso();
                else pintarDescanso();
            };
            const bMas = el("button", "gym-btn-g", "＋15 s"); bMas.type = "button";
            bMas.title = "Añadir 15 segundos al descanso";
            bMas.onclick = () => { descanso!.restanteMs += 15000; descanso!.totalMs = Math.max(descanso!.totalMs, descanso!.restanteMs); pintarDescanso(); };
            const bSaltar = el("button", "gym-btn-g verde", "⏭ Saltar descanso"); bSaltar.type = "button";
            bSaltar.onclick = () => {
                // Si estás mirando otro ejercicio, saltar el descanso te DEVUELVE
                // al que toca (el dueño): no se saltan descansos mirando de lejos
                const due = descanso?.ej ?? -1;
                ejecDesde = transcurridoMs();   // el descanso acaba AHÍ: empieza la serie
                ejecDesdeEj = due;
                descanso = null;
                if (due >= 0 && due !== idx && due < defs.length && !animando) deslizarA(due);
                else pintarEjercicio();
            };
            if (!pausado) fDesc.appendChild(btnPausa);   // en pausa no hay botón aparte: el botón rojo reanuda
            fDesc.appendChild(bMenos); fDesc.appendChild(bMas); fDesc.appendChild(bSaltar);
            cajaDescanso.appendChild(fDesc);
            // Si estás viendo OTRO ejercicio, la caja dice de quién es el descanso
            cajaDescanso.appendChild(el("div", "font-size:.78em;opacity:.7;margin-top:2px;",
                descanso.ej !== idx ? `de «${defs[descanso.ej].nombre}» — aquí solo miras` : ""));
            zonaTemporizador.appendChild(cajaDescanso);
            pintarDescanso();
        } else if (ciclo) {
            // Caja del ciclo (intervalo): fase actual con su cuenta atrás
            const cEj = defs[ciclo.ej];
            const nTotal = Math.max(cEj.plan, cEj.series.length);
            const transC = Math.max(0, Math.round(Number(cEj.objetivo.transicionSeg) || 0));
            const faseC = ciclo.fase === "trabajo" ? "Trabajo"
                : (transC > 0 && ciclo.n % 2 === 1 ? "Transición" : "Descanso");
            cajaCiclo = el("div", "gym-descanso");
            tCiclo = el("div", "t");
            const barraWrapC = el("div", "height:6px;border-radius:4px;background:var(--background-secondary);overflow:hidden;margin:8px 0;");
            barraCiclo = el("div", `height:100%;width:100%;background:${CONFIG.NARANJA};`);
            barraWrapC.appendChild(barraCiclo);
            cajaCiclo.appendChild(el("div", "gym-et",
                `${ciclo.fase === "trabajo" ? "⚡" : "⏳"} Ciclo ${ciclo.n} de ${nTotal} · ${faseC}`));
            cajaCiclo.appendChild(tCiclo);
            cajaCiclo.appendChild(barraWrapC);
            const fC = el("div", "display:flex;gap:8px;justify-content:center;flex-wrap:wrap;");
            if (ciclo.fase === "trabajo") {
                const bCancelC = el("button", "gym-btn-g", "⏹ Cancelar ciclo"); bCancelC.type = "button";
                bCancelC.title = "Cancelar el ciclo en curso: la serie queda pendiente (se repite o se salta con ⏭)";
                bCancelC.onclick = () => cancelarCiclo();
                fC.appendChild(bCancelC);
            } else {
                const bSaltarC = el("button", "gym-btn-g verde", "⏭ Saltar descanso"); bSaltarC.type = "button";
                bSaltarC.title = "Terminar ya el descanso del ciclo: sin aviso, es cosa tuya";
                bSaltarC.onclick = () => saltarDescansoCiclo();
                fC.appendChild(bSaltarC);
            }
            cajaCiclo.appendChild(fC);
            cajaCiclo.appendChild(el("div", "font-size:.78em;opacity:.7;margin-top:2px;",
                ciclo.ej !== idx ? `de «${cEj.nombre}» — aquí solo miras` : ""));
            zonaTemporizador.appendChild(cajaCiclo);
            pintarCiclo();
        } else if (hold) {
            // Caja del hold (tiempo): cuenta arriba con su objetivo
            const hEj = defs[hold.ej];
            const objH = Math.max(0, Math.round(Number(hEj.objetivo.duracionObjetivo) || 0));
            cajaHold = el("div", "gym-descanso");
            tHold = el("div", "t");
            cajaHold.appendChild(el("div", "gym-et", objH > 0 ? `⏱ Hold · objetivo ${objH} s` : "⏱ Hold"));
            cajaHold.appendChild(tHold);
            if (objH > 0) {
                const barraWrapH = el("div", "height:6px;border-radius:4px;background:var(--background-secondary);overflow:hidden;margin:8px 0;");
                barraHold = el("div", `height:100%;width:100%;background:${CONFIG.NARANJA};`);
                barraWrapH.appendChild(barraHold);
                cajaHold.appendChild(barraWrapH);
            }
            const fH = el("div", "display:flex;gap:8px;justify-content:center;flex-wrap:wrap;");
            const bCancelH = el("button", "gym-btn-g", "⏹ Cancelar hold"); bCancelH.type = "button";
            bCancelH.title = "Descartar el cronómetro: no se registra nada";
            bCancelH.onclick = () => cancelarHold();
            fH.appendChild(bCancelH);
            cajaHold.appendChild(fH);
            cajaHold.appendChild(el("div", "font-size:.78em;opacity:.7;margin-top:2px;",
                hold.ej !== idx ? `de «${hEj.nombre}» — aquí solo miras` : ""));
            zonaTemporizador.appendChild(cajaHold);
            pintarHold();
        }

        // Series
        contEj.appendChild(el("div", "gym-modo-seccion", tipo === "intervalo" ? "Ciclos" : "Series"));
        const total = Math.max(ej.plan, ej.series.length);
        for (let i = 0; i < total; i++) {
            const registrada = i < ej.series.length;   // hecha o saltada: ambas ocupan su hueco
            const s: SerieSesion | null = ej.series[i] ?? null;
            const saltada = Boolean(s?.saltada);
            const esActual = i === ej.series.length;   // solo se resalta la serie que toca
            const esExtra = i >= ej.planOrigen;   // serie fuera del plan: se marca y se puede retirar
            const fila = el("div", "gym-modo-set" + (saltada ? " saltada" : registrada ? " hecha" : esActual ? " actual" : "") + (esExtra ? " extra" : ""));
            const cN = el("div", "n");
            if (esExtra) {
                cN.append(String(i + 1), el("span", "ext", "extra"));
                fila.title = "Serie extra — fuera del plan";
            } else cN.textContent = String(i + 1);
            fila.appendChild(cN);
            if (saltada) {
                // Su etiqueta también se ve en la saltada (la conserva, decisión 24)
                const txtS = el("div", "font-size:.92em;font-style:italic;");
                txtS.appendChild(el("span", "gym-chip gym-chip-mini", etiquetaTipoSerie(tipoSerieDe(ej.objetivo, s))));
                txtS.append(" ⏭ Saltada");
                fila.appendChild(txtS);
                fila.appendChild(el("div"));
                const cierreS = el("div", "cierre");
                const bUndoS = el("button", "gym-btn-g", "↩"); bUndoS.type = "button";
                bUndoS.title = "Rehacer: vuelve a estar pendiente";
                bUndoS.onclick = () => deshacerSerie(i);
                cierreS.appendChild(bUndoS);
                fila.appendChild(cierreS);
            } else if (registrada) {
                // En tiempo/intervalo lo registrado son segundos (duracionSeg);
                // en peso, el de siempre reps × peso. Delante, su tipo de serie.
                const txt = el("div", "font-size:.95em;");
                txt.appendChild(el("span", "gym-chip gym-chip-mini", etiquetaTipoSerie(tipoSerieDe(ej.objetivo, s))));
                txt.append(" " + (s.duracionSeg != null ? `${s.duracionSeg} s`
                    : `${s.reps ?? "–"} reps × ${s.peso != null ? pesoTexto(s.peso) : "sin peso"}`));
                fila.appendChild(txt);
                fila.appendChild(el("div"));
                const cierre = el("div", "cierre");
                const bUndo = el("button", "gym-btn-g", "↩"); bUndo.type = "button"; bUndo.title = "Deshacer serie";
                bUndo.onclick = () => deshacerSerie(i);
                cierre.appendChild(bUndo);
                fila.appendChild(cierre);
            } else {
                const tipoF = tipoEjercicioDe(ej.objetivo);
                const etFila = tipoSerieSiguiente(ej);   // etiqueta de la serie que toca
                const enDescansoPend = (descanso?.restanteMs ?? 0) > 0;
                const descansoAjeno = enDescansoPend && descanso!.ej !== idx;
                const cicloActivo = ciclo != null;
                const holdAjeno = hold != null && hold.ej !== idx;
                const bSaltar = el("button", "gym-btn-g", "⏭"); bSaltar.type = "button";
                bSaltar.title = !esActual ? "Primero llega a la serie " + (ej.series.length + 1)
                    : !iniciada ? "Pulsa ▶ Iniciar sesión para registrar series"
                    : pausado ? "Reanuda la sesión para registrar series"
                    : descansoAjeno ? `⏳ Descanso de «${defs[descanso!.ej].nombre}»: no se registra nada en otro ejercicio hasta que termine`
                    : cicloActivo ? (ciclo!.ej === idx ? "⏳ Ciclo en curso: cancelalo (o espera a que termine) antes de saltar"
                                                      : `⏳ Ciclo de «${defs[ciclo!.ej].nombre}»: aquí solo miras`)
                    : holdAjeno ? `⏳ Hold de «${defs[hold!.ej].nombre}»: aquí solo miras`
                    : hold ? "Marcar como saltada: se cancela el cronómetro del hold"
                    : "Marcar esta serie como saltada: queda registrada en el historial";
                bSaltar.disabled = !esActual || !iniciada || pausado || descansoAjeno || cicloActivo || holdAjeno;
                bSaltar.onclick = () => saltarSerie(i);
                const cierreF = el("div", "cierre");
                // Fila pendiente: input de reps+peso (peso) o de segundos (tiempo);
                // en intervalo no hay nada que teclear: el ciclo registra SU serie
                // solo al terminar el trabajo (decisión 17), así que su fila solo
                // lleva la info del ciclo y el ⏭
                if (tipoF !== "intervalo") {
                    const p = prev[i];   // prev conserva lo tecleado en reps/peso
                    const iR = el("input"); iR.type = "number"; iR.inputMode = "numeric"; iR.min = "0";
                    if (tipoF === "tiempo") {
                        iR.placeholder = "Seg";
                        const objT = Math.round(Number(ej.objetivo.duracionObjetivo) || 0);
                        iR.value = (p && p.reps !== "") ? p.reps : (objT > 0 ? String(objT) : "");
                    } else {
                        iR.placeholder = "Reps";
                        // En «fallo» no hay reps objetivo: se escriben las que salgan
                        iR.value = (p && p.reps !== "") ? p.reps
                            : etFila === "fallo" ? "" : String(repsObjetivoDe(ej.objetivo) ?? "");
                    }
                    inReps[i] = iR;
                    let iP: HTMLInputElement | undefined;
                    if (tipoF === "peso") {
                        iP = el("input"); iP.type = "number"; iP.inputMode = "decimal"; iP.min = "0"; iP.step = "0.5";
                        // prev conserva lo tecleado (unidad activa); el objetivo está en kg
                        iP.value = (p && p.peso !== "") ? p.peso : pesoACampo(ej.objetivo.pesoObjetivo);
                        inPeso[i] = iP;
                    }
                    const bOk = el("button", "gym-btn-g verde", "✔"); bOk.type = "button";
                    bOk.title = !esActual ? "Primero completa la serie " + (ej.series.length + 1)
                        : !iniciada ? "Pulsa ▶ Iniciar sesión para completar series"
                        : pausado ? "Reanuda la sesión para completar series"
                        : descansoAjeno ? `⏳ Descanso de «${defs[descanso!.ej].nombre}»: aquí solo miras — completa series en tu ejercicio`
                        : enDescansoPend ? "⏳ En descanso: espera a que termine (o pulsa ⏭ Saltar descanso)"
                        : cicloActivo ? (ciclo!.ej === idx ? "⏳ Ciclo en curso: su serie se registra sola al terminar el trabajo"
                                                          : `⏳ Ciclo de «${defs[ciclo!.ej].nombre}»: aquí solo miras`)
                        : holdAjeno ? `⏳ Hold de «${defs[hold!.ej].nombre}»: aquí solo miras`
                        : hold ? "Terminar el hold: registra los segundos transcurridos"
                        : "Completar esta serie";
                    bOk.disabled = !esActual || !iniciada || pausado || enDescansoPend || cicloActivo || holdAjeno;
                    bOk.onclick = () => completarSerie(i);
                    cierreF.appendChild(bOk);
                    cierreF.appendChild(bSaltar);
                    fila.appendChild(iR);
                    fila.appendChild(iP ?? el("div"));   // en tiempo la 2ª celda queda libre
                } else {
                    // Info del ciclo que toca: trabajo y el descanso que lo sigue
                    // (sin descanso tras el último — decisión 16)
                    const trabF = Math.max(0, Math.round(Number(ej.objetivo.trabajoSeg) || 0));
                    const transF = Math.max(0, Math.round(Number(ej.objetivo.transicionSeg) || 0));
                    const descF = Math.max(0, Math.round(Number(ej.objetivo.descansoSeg) || 0));
                    const esUltimo = i + 1 >= ej.plan;
                    const restoF = esUltimo ? "último ciclo"
                        : (transF > 0 && (i + 1) % 2 === 1 ? `${transF} s de transición` : `${descF} s de descanso`);
                    fila.appendChild(el("div", "font-size:.92em;opacity:.85;", `⏱ ${trabF} s de trabajo`));
                    fila.appendChild(el("div", "font-size:.92em;opacity:.85;", restoF));
                    cierreF.appendChild(bSaltar);
                }
                fila.appendChild(cierreF);
                // La serie que toca se puede etiquetar aquí: es la única fila
                // pendiente accionable. Las demás heredan el tipo del plan.
                if (esActual) {
                    const filaTipo = el("div", "grid-column:1 / -1;display:flex;align-items:center;gap:6px;margin-top:2px;");
                    filaTipo.appendChild(el("span", "font-size:.72em;text-transform:uppercase;letter-spacing:.04em;" +
                        "color:var(--text-muted);font-weight:700;", "Tipo de serie"));
                    filaTipo.appendChild(selectorTipoSerie(etFila, v => {
                        ej.tipoSiguiente = v;
                        // En «fallo» no hay reps objetivo: se vacía la reps
                        // precargada del plan (si no se había tocado). En
                        // «tiempo» el input son segundos y no se toca.
                        const inp = tipoF === "peso" ? inReps[ej.series.length] : undefined;
                        const objetivo = repsObjetivoDe(ej.objetivo);
                        if (v === "fallo" && inp && objetivo != null && inp.value === String(objetivo)) {
                            inp.value = "";
                        }
                        pintarEjercicio();
                    }));
                    fila.appendChild(filaTipo);
                }
            }
            contEj.appendChild(fila);
        }
        const bMasSerie = el("button", "gym-btn-g gym-btn-mini-g", "＋1 serie"); bMasSerie.type = "button";
        bMasSerie.title = "Añadir una serie extra a este ejercicio";
        bMasSerie.onclick = () => { ej.plan++; pintarEjercicio(); };
        const filaExtras = el("div", "display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px;");
        filaExtras.appendChild(bMasSerie);
        filaExtras.appendChild(anadirEjercicioBoton());   // añadir otro mientras se entrena
        if (ej.plan > ej.planOrigen) {   // hay series extra: se pueden retirar (si alguna ya está completada, primero su ↩)
            const bQuitar = el("button", "gym-btn-g gym-btn-mini-g", "↩ Quitar serie extra"); bQuitar.type = "button";
            const minPlan = Math.max(ej.planOrigen, ej.series.length);
            bQuitar.disabled = ej.plan <= minPlan;
            bQuitar.title = bQuitar.disabled ? "Hay series extra completadas: deshácelas antes con ↩ en su fila" : "Retirar la última serie extra añadida";
            bQuitar.onclick = () => { ej.plan = Math.max(minPlan, ej.plan - 1); pintarEjercicio(); };
            filaExtras.appendChild(bQuitar);
        }
        contEj.appendChild(filaExtras);
        if (zonaTemporizador.childElementCount > 0) contEj.appendChild(zonaTemporizador);

        // Acción principal
        const enDescanso = Boolean(descanso);
        const listoDescanso = Boolean(descanso && descanso.restanteMs <= 0);
        const pendientes = ej.series.length < ej.plan;
        let texto = "✔ Hecho — empezar descanso";
        let accion: (() => void) | null = () => completarSerie(ej.series.length);
        let clase = "primario";
        if (!iniciada) { texto = "▶ Iniciar sesión"; accion = () => iniciar(); clase = "primario"; }
        else if (pausado) { texto = "⏸ EN PAUSA — pulsa para continuar"; accion = () => btnPausa.click(); clase = "pausa"; }
        else if (hold) {
            // Mientras corre un hold, la acción es terminarlo (dueño) o esperar
            if (hold.ej !== idx) { texto = `⏳ Hold de «${defs[hold.ej].nombre}»… (aquí solo miras)`; accion = null; clase = ""; }
            else { texto = "✔ Terminar hold — registrar"; accion = () => completarSerie(ej.series.length); clase = "verde"; }
        }
        else if (ciclo) {
            // Mientras corre un ciclo: cancelarlo (trabajo) o esperar a su descanso
            if (ciclo.ej !== idx) { texto = `⏳ Ciclo de «${defs[ciclo.ej].nombre}»… (aquí solo miras)`; accion = null; clase = ""; }
            else if (ciclo.fase === "trabajo") { texto = "⏹ Cancelar ciclo"; accion = () => cancelarCiclo(); clase = ""; }
            else { texto = `⏳ Descanso del ciclo ${ciclo.n}… (usa ⏭ en su caja)`; accion = null; clase = ""; }
        }
        else if (enDescanso && !listoDescanso) {
            // Descansando (aquí o en otro ejercicio visto): no se registra nada hasta «¡Listo!»
            texto = descanso!.ej !== idx ? `⏳ Descansando de «${defs[descanso!.ej].nombre}»… (aquí solo miras)`
                                         : "⏳ Descansando… (usa +15 s o Saltar)";
            accion = null; clase = "";
        }
        else if (pendientes && tipo === "tiempo") { texto = "▶ Empezar hold"; accion = () => empezarHold(); clase = "primario"; }
        else if (pendientes && tipo === "intervalo") {
            texto = `▶ Iniciar ciclo ${ej.series.length + 1} de ${Math.max(ej.plan, ej.series.length)}`;
            accion = () => iniciarCiclo(); clase = "primario";
        }
        else if (enDescanso && descanso!.ej === idx) { texto = "⏭ Siguiente ejercicio"; accion = () => { void siguiente(); }; clase = "verde"; }
        else if (!pendientes) { texto = idx + 1 >= defs.length ? "🏁 Terminar" : "⏭ Siguiente ejercicio"; accion = () => { void siguiente(); }; clase = "verde"; }
        btnAccion = el("button", "gym-btn-g gym-btn-accion " + clase, texto); btnAccion.type = "button";
        if (accion) btnAccion.onclick = accion; else btnAccion.disabled = true;
        barraAccion.replaceChildren();   // la acción vive fija abajo, encima del pie
        if (!enDescanso && iniciada && !pausado) barraAccion.appendChild(btnPausa);   // durante el descanso vive en la fila del temporizador; antes de iniciar no hay nada que pausar; en pausa solo está el botón rojo
        barraAccion.appendChild(btnAccion);
        bVolver.disabled = idx === 0;   // en el primer ejercicio no hay anterior
    };

    // ── Pie: volver, nota, siguiente, saltar, terminar ──
    const bVolver = el("button", "gym-btn-g", "⬅ Volver"); bVolver.type = "button";
    bVolver.title = "Volver al ejercicio anterior";
    bVolver.onclick = () => deslizarA(idx - 1);   // se desliza como el gesto con el dedo (en el primero no hace nada)
    const bNota = el("button", "gym-btn-g", "📝 Nota"); bNota.type = "button";
    bNota.onclick = async () => {
        const ej = defs[idx];
        const r = await pedirTexto(`📝 Nota — ${ej.nombre}`, ej.notas || "");
        if (r !== null) { ej.notas = r.trim(); pintarEjercicio(); }
    };
    const bSiguiente = el("button", "gym-btn-g", "⏭ Siguiente"); bSiguiente.type = "button";
    bSiguiente.onclick = () => {
        if (idx + 1 < defs.length) deslizarA(idx + 1);   // se desliza como el gesto con el dedo
        else void siguiente();                            // en el último ejercicio: termina la sesión (como antes)
    };
    const bSaltar = el("button", "gym-btn-g", "⏭ Saltar ejercicio"); bSaltar.type = "button";
    bSaltar.title = "No hacer este ejercicio: sus series quedan registradas como saltadas";
    bSaltar.onclick = () => {
        const ej = defs[idx];
        if (descanso && descanso.ej === idx) descanso = null;   // se abandona el ejercicio DUEÑO del descanso
        if (hold?.ej === idx) hold = null;   // idem: el hold de ESTE ejercicio se cancela
        if (ciclo?.ej === idx) ciclo = null;   // idem: el ciclo de ESTE ejercicio se cancela
        if (ejecDesdeEj === idx) ejecDesde = null;   // no se va a ejecutar nada de ese «¡Listo!»
        // Lo pendiente se marca como saltado: la serie que tocaba con la
        // etiqueta elegida y el resto con la del plan (como al registrarlas),
        // para que el registro cuadre sin arrastrar la elegida a mano
        const etToque = tipoSerieSiguiente(ej);
        const etPlan = tipoSerieDe(ej.objetivo);
        const primera = ej.series.length;
        ej.tipoSiguiente = null;   // el ejercicio queda atrás: sin etiqueta pendiente
        while (ej.series.length < ej.plan) {
            ej.series.push({ saltada: true, t: transcurridoMs(),
                tipoSerie: ej.series.length === primera ? etToque : etPlan });
        }
        toast(`⏭ ${ej.nombre}: sin registrar`);
        void siguiente();
    };
    const bGuardar = el("button", "gym-btn-g", "💾 Guardar"); bGuardar.type = "button";
    bGuardar.title = "Guardar el progreso actual y seguir: si se cierra la app, al volver podrás continuar";
    bGuardar.onclick = () => guardarProgreso();
    const bTerminar = el("button", "gym-btn-g verde", "🏁 Terminar"); bTerminar.type = "button";
    bTerminar.title = "Terminar la sesión: guarda todo lo registrado y ajusta el plan";
    bTerminar.onclick = () => terminar();
    // Volver y Siguiente juntos (navegación), luego Nota y Saltar, y abajo Guardar/Terminar
    [bVolver, bSiguiente, bNota, bSaltar, bGuardar, bTerminar].forEach(b => pie.appendChild(b));

    // ── Desplazamiento lateral (pulsar y arrastrar con el dedo o el ratón) ──
    // Izquierda → siguiente ejercicio, derecha → anterior. El arrastre debe ser
    // claramente horizontal (para no chocar con el scroll vertical) y no se coge
    // si empieza sobre un botón o un campo. Al llegar a los extremos no hace nada.
    // El cambio NO es instantáneo: el contenido sale deslizándose y el nuevo
    // entra desde el lado contrario, como pasar paneles.
    // Navegar NO cancela el descanso en curso: sirve para mirar otro ejercicio
    // mientras descansas (la caja indica de quién es, y ✔/⏭ de los demás están
    // bloqueados hasta «¡Listo!»).
    let arrX = 0, arrY = 0, arrastre = false, animando = false;
    const deslizarA = (n: number) => {
        // El gesto con el dedo ya descarta la pausa antes de llegar aquí; los
        // botones sí pueden navegar en pausa (lo de siempre).
        if (animando || n === idx || n < 0 || n >= defs.length) return;
        animando = true;
        const dir = n > idx ? -1 : 1;   // al siguiente: el contenido se va a la izquierda
        // Los estados de la animación son clases (gym-slide* en styles.css):
        // salida con transición → salto instantáneo al lado contrario → entrada.
        const salida = dir < 0 ? "gym-slide-izq" : "gym-slide-der";
        const entrada = dir < 0 ? "gym-slide-der" : "gym-slide-izq";
        contEj.classList.add("gym-slide", salida, "gym-slide-fuera");
        window.setTimeout(() => {
            irAEjercicio(n);   // repinta el contenido (las clases del contenedor se quedan)
            contEj.classList.add("gym-slide-sin");   // sin transición: salto al otro lado
            contEj.classList.remove(salida);
            contEj.classList.add(entrada);
            void contEj.offsetWidth;   // reflow: sin él, la transición de entrada no se dispara
            contEj.classList.remove("gym-slide-sin", entrada, "gym-slide-fuera");
            window.setTimeout(() => { contEj.classList.remove("gym-slide"); animando = false; }, 220);
        }, 190);
    };
    cuerpo.addEventListener("pointerdown", e => {
        arrastre = false;
        if (pausado) return;   // en pausa, quieto
        const t = e.target as HTMLElement | null;
        if (t?.closest("button, input, a")) return;   // los controles se quedan su gesto
        arrastre = true; arrX = e.clientX; arrY = e.clientY;
        try { cuerpo.setPointerCapture(e.pointerId); } catch { /* algunos punteros no se pueden capturar */ }
    });
    cuerpo.addEventListener("pointerup", e => {
        if (!arrastre) return;
        arrastre = false;
        if (pausado || !defs.length) return;
        const dx = e.clientX - arrX, dy = e.clientY - arrY;
        if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;   // umbral + claramente horizontal
        if (dx < 0 && idx + 1 < defs.length) deslizarA(idx + 1);              // ← al siguiente
        else if (dx > 0 && idx > 0) deslizarA(idx - 1);                       // → al anterior
    });
    cuerpo.addEventListener("pointercancel", () => { arrastre = false; });

    // ── Pausa, cierre y guardado ──
    btnPausa.onclick = () => {
        if (!iniciada) return;   // antes de iniciar no hay tiempo que pausar
        pausado = !pausado;
        if (pausado) {
            pausaT0 = transcurridoMs();            // instante ACTIVO en que se pausa
            pausaPend = Date.now();
        } else if (pausaPend != null) {
            // Se apunta la pausa (cuándo y cuánto) y se descuenta del reloj:
            // los «t» posteriores y la duración miden solo tiempo activo
            pausas.push({ t: pausaT0, ms: Date.now() - pausaPend });
            pausaAcum += Date.now() - pausaPend;
            pausaPend = null;
            ultimoTick = Date.now();   // el tiempo en pausa no se descuenta del descanso
        }
        btnPausa.textContent = pausado ? "▶ Reanudar" : "⏸ Pausa";
        btnPausa.title = pausado ? "Reanudar la sesión" : "Pausa: congela el reloj y el descanso (no cuenta en los tiempos)";
        cuerpo.style.opacity = pausado ? ".5" : "1";
        sincronizaPantalla();   // en pausa la pantalla puede volver a dormirse
        pintarEjercicio();   // el botón naranja pasa a mostrar el aviso de pausa (y viceversa)
    };

    const cerrar = () => {
        window.clearInterval(idReloj);
        reiniciarCuentaAtras("sesion-descanso");
        reiniciarCuentaAtras("sesion-ciclo-trabajo");
        reiniciarCuentaAtras("sesion-ciclo-descanso");
        document.removeEventListener("keydown", onKey);
        pantalla.quitar();   // nada de pantalla despierta tras salir de la sesión
        sesionesAbiertas.delete(cerrar);
        overlay.remove();
    };
    sesionesAbiertas.add(cerrar);   // por si el plugin se descarga con la sesión abierta
    const onKey = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        // Si hay un modal o un confirm por encima, el Escape es suyo (si no, se reabrirían en bucle)
        if (document.getElementById("gym-confirm-activo") || document.getElementById("gym-modal-activo")) return;
        btnCerrar.click();
    };
    btnCerrar.onclick = async () => {
        const hay = defs.some(d => d.series.length || d.notas);
        if (hay) {
            const msg = parcialGuard
                ? "¿Salir? Tu progreso ya está guardado: al volver a abrir este día continuarás donde lo dejaste.\n\nSe pierde solo lo hecho desde el último Guardar."
                : "¿Salir sin guardar? Se pierde lo registrado en esta sesión.";
            const ok = await confirmar("🎯 Sesión guiada", msg, "Salir sin guardar", "Seguir entrenando");
            if (!ok) return;
        }
        cerrar();
    };

    // Guardar a mitad de sesión: conserva el progreso en la nota SIN cerrar (reanudable si la app se cierra)
    const guardarProgreso = async () => {
        if (!iniciada) return toast("⚠️ Pulsa ▶ Iniciar sesión antes de guardar.", false);
        const conDatos = defs.filter(d => d.series.length || d.notas);
        if (!conDatos.length) return toast("⚠️ Aún no hay nada que guardar: completa una serie o añade una nota.", false);
        const totalSeries = conDatos.reduce((t, d) => t + seriesHechas(d).length, 0);
        const totalSaltadas = conDatos.reduce((t, d) => t + d.series.filter(esSaltada).length, 0);
        const totalSinRegistrar = defs.length - conDatos.length;
        const duracionMin = Math.max(1, Math.round(transcurridoMs() / 60000));
        if (!(await confirmar("💾 Guardar progreso",
            `¿Guardar el progreso de «${dia.nombre}»?\n\n· ${conDatos.length} de ${defs.length} ejercicios\n· ${totalSeries} series · ~${duracionMin} min` +
            (totalSaltadas ? `\n· ${totalSaltadas} serie${totalSaltadas > 1 ? "s" : ""} saltada${totalSaltadas > 1 ? "s" : ""} (quedan registradas como no hechas)` : "") +
            (totalSinRegistrar ? `\n· ${totalSinRegistrar} ejercicio${totalSinRegistrar > 1 ? "s" : ""} sin registrar (se guardan marcados como no hechos)` : "") + "\n\n" +
            "La sesión no se cierra. Si se cierra la app, al volver a abrir este día podrás continuar donde lo dejaste.",
            "Guardar", "Cancelar"))) return;
        const sesion: Sesion = {
            fecha: hoy(),
            diaId: dia.id,
            duracionMin,
            anotaciones: "",
            enCurso: true,           // marca de progreso sin terminar: se retira al Terminar
            idx,                     // por qué ejercicio ibas (para reanudar)
            transcurridoMs: transcurridoMs(),   // reloj activo acumulado (para que al reanudar siga contando)
            ...(pausas.length ? { pausas } : {}),   // las pausas viajan con la sesión
            // Se guardan TODOS los ejercicios del día, no solo los tocados: los que no
            // se hicieron quedan marcados con sinRegistrar en vez de desaparecer, para
            // que el registro cuadre con el plan del día.
            ejercicios: defs.map(aEjercicioGuardado),
        };
        try {
            const iP = parcialGuard ? rutina.sesiones.indexOf(parcialGuard) : -1;
            if (iP >= 0) rutina.sesiones.splice(iP, 1);   // un solo guardado en curso por día
            rutina.sesiones.push(sesion);
            rutina.sesiones.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
            await escribirRutina(rutina);
            parcialGuard = sesion;   // los próximos Guardares actualizan este mismo registro
            toast(`💾 Progreso guardado · ${totalSeries} series · ${duracionMin} min — continúa cuando quieras`);
            void pintar();
        } catch (e: unknown) {
            console.error("[GymGestor guardar progreso]", e);
            toast("⚠️ No pude guardar el progreso: " + msgError(e), false);
        }
    };

    const terminar = async () => {
        const conDatos = defs.filter(d => d.series.length || d.notas);
        if (!conDatos.length && !(await confirmar("📭 Sesión vacía",
            "No has completado ni una serie ni una nota. ¿Guardar la sesión vacía?",
            "Sí, guardar", "No, cancelar"))) return;
        const totalSeries = conDatos.reduce((t, d) => t + seriesHechas(d).length, 0);
        const totalSaltadas = conDatos.reduce((t, d) => t + d.series.filter(esSaltada).length, 0);
        const totalSinRegistrar = defs.length - conDatos.length;
        const duracionMin = Math.max(1, Math.round(transcurridoMs() / 60000));
        // Ajuste del plan: el peso más alto de cada ejercicio de hoy pasa a ser el
        // objetivo de las próximas sesiones. Solo aplica a los que REALMENTE están
        // en la rutina: los añadidos a mano (rutina libre, o un ejercicio suelto
        // dentro de una planificada) llevan un objetivo local que no persiste, y
        // anunciar «plan ajustado» para ellos sería mentir.
        const enElPlan = (d: DefSesion) => (rutina.dias ?? []).some(x => (x.ejercicios ?? []).some(e => e.id === d.id));
        const ajustes: AjustePlan[] = conDatos.filter(enElPlan).map(d => {
            const pesos = seriesHechas(d).map(s => s.peso).filter((p): p is number => typeof p === "number" && !Number.isNaN(p));
            if (!pesos.length) return null;
            const maxHoy = Math.max(...pesos);
            const previo = typeof d.objetivo.pesoObjetivo === "number" ? d.objetivo.pesoObjetivo : null;
            return previo === maxHoy ? null : { d, maxHoy };
        }).filter((a): a is AjustePlan => a != null);
        if (!(await confirmar("🏁 Terminar sesión",
            `¿Terminar y guardar la sesión de «${dia.nombre}»?\n\n· ${conDatos.length} de ${defs.length} ejercicios\n· ${totalSeries} series · ~${duracionMin} min` +
            (totalSaltadas ? `\n· ${totalSaltadas} serie${totalSaltadas > 1 ? "s" : ""} saltada${totalSaltadas > 1 ? "s" : ""} (quedan registradas como no hechas)` : "") +
            (totalSinRegistrar ? `\n· ${totalSinRegistrar} ejercicio${totalSinRegistrar > 1 ? "s" : ""} sin registrar (quedan marcados como no hechos)` : "") +
            (ajustes.length ? "\n· Los pesos del plan pasarán a los de hoy: el más alto de cada ejercicio, suba o baje" : ""),
            "Terminar y guardar", "Seguir entrenando"))) return;
        const sesion: Sesion = {
            fecha: hoy(),
            diaId: dia.id,
            duracionMin,
            anotaciones: "",
            ...(pausas.length ? { pausas } : {}),   // las pausas viajan con la sesión
            // Se guardan TODOS los ejercicios del día, no solo los tocados: los que no
            // se hicieron quedan marcados con sinRegistrar en vez de desaparecer, para
            // que el registro cuadre con el plan del día.
            ejercicios: defs.map(aEjercicioGuardado),
        };
        try {
            for (const a of ajustes) a.d.objetivo.pesoObjetivo = a.maxHoy;   // el plan queda con lo entrenado hoy: próxima sesión arranca en ese peso
            const iP = parcialGuard ? rutina.sesiones.indexOf(parcialGuard) : -1;
            if (iP >= 0) rutina.sesiones.splice(iP, 1);   // el registro definitivo sustituye al guardado en curso (sin duplicar)
            parcialGuard = null;
            rutina.sesiones.push(sesion);
            rutina.sesiones.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
            await escribirRutina(rutina);
            cerrar();
            toast(`✅ Sesión de ${dia.nombre} guardada · ${totalSeries} series · ${duracionMin} min` +
                (ajustes.length ? ` · plan ajustado en ${ajustes.length} ejercicio${ajustes.length > 1 ? "s" : ""}` : ""));
            void pintar();
        } catch (e: unknown) {
            console.error("[GymGestor modo sesión]", e);
            toast("⚠️ No pude guardar la sesión: " + msgError(e), false);
        }
    };

    // ── Fin del descanso (lo llaman el reloj y el −15 s): «¡Listo!»; si
    // estábamos mirando otro ejercicio, se vuelve DESLIZANDO al dueño. ──
    // Aviso sonoro + vibración (los mismos de sonido.ts que el ⏱ libre):
    // un SOLO sitio para los dos caminos que terminan el descanso —el reloj
    // y −15 s—, y el «¡Listo!» de pantalla ya hace de aviso visual. No suena
    // con ⏭ Saltar descanso: saltarlo es cosa tuya, no un aviso. ──
    const finDescanso = (): void => {
        if (!descanso) return;
        sonarDescanso();
        vibrar();
        const due = descanso.ej;
        descanso = null;
        ejecDesde = transcurridoMs();   // AHÍ empiezas la serie (para desglosar descanso/ejecución)
        ejecDesdeEj = due;
        if (due !== idx && due >= 0 && due < defs.length && !animando) deslizarA(due);
        else pintarEjercicio();
    };

    // ── Reloj (cada 250 ms: tiempo de sesión activa, descanso, ciclos y hold) ──
    // El descanso (y las fases del ciclo) descuentan el tiempo REAL transcurrido
    // entre tics (dt), no «250 ms por tic»: con la pantalla apagada u Obsidian en
    // segundo plano el SO suspende o ralentiza los intervalos del WebView y, al
    // volver, un contador fijo seguiría desde donde estaba —el descanso se quedaría
    // parado o atrasado el tiempo que estuviste fuera—. Con dt derivado de Date.now()
    // (como ya hacía el cronómetro de sesión) el primer tic tras volver descuenta
    // de golpe todo el tiempo transcurrido y la cuenta atrás es fiel al reloj.
    const idReloj = window.setInterval(() => {
        const ahora = Date.now();
        const dt = Math.max(0, ahora - ultimoTick);   // tiempo real desde el tic anterior
        ultimoTick = ahora;   // se refresca SIEMPRE, también en pausa (si no, al reanudar se descontaría la pausa)
        relojEl.textContent = `⏱ ${relojTexto(transcurridoMs())}`;   // en pausa se congela: el reloj mide tiempo activo
        if (pausado) return;   // la pausa sí congela la cuenta atrás del descanso, de los ciclos y del hold
        if (descanso && descanso.restanteMs > 0) {
            descanso.restanteMs -= dt;
            sonarCuentaAtras("sesion-descanso", "descanso", descanso.restanteMs);
            if (descanso.restanteMs > 0) {
                pintarDescanso();
            } else {
                finDescanso();   // dt ≥ restante: el descanso terminó aunque el SO hubiera suspendido los tics
            }
        }
        if (ciclo) {
            ciclo.restanteMs -= dt;
            const claveAviso = ciclo.fase === "trabajo" ? "sesion-ciclo-trabajo" : "sesion-ciclo-descanso";
            sonarCuentaAtras(claveAviso, "temporizador", ciclo.restanteMs);
            if (ciclo.restanteMs > 0) {
                pintarCiclo();
            } else if (ciclo.fase === "trabajo") {
                finTrabajoCiclo();   // registra la serie del ciclo y pasa al descanso
            } else {
                finDescansoCiclo();   // avisa y deja listo el siguiente ciclo
            }
        }
        if (hold) {
            hold.ms += dt;
            pintarHold();
        }
    }, 250);

    pintarEjercicio();
    relojEl.textContent = `⏱ ${relojTexto(transcurridoMs())}`;   // al reanudar, el reloj continúa desde donde estaba
    sincronizaPantalla();   // sesión reabierta a mitad: ya corre, así que despierta
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
}
