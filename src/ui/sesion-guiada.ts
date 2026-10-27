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
    escribirRutina, modoRepsDe, seriesHechas, textoRepsObjetivo, ultimosValores,
} from "../datos";
import type { EjercicioDef, EjercicioSesion, Rutina, SerieSesion, Sesion } from "../tipos";
import { pesoACampo, pesoAKg, pesoTexto } from "../unidades";
import { aNumero, dos, esc, fechaLegible, hoy, msgError } from "../util";
import { btn, confirmar, el, modal, pedirTexto, toast } from "./componentes";
import { elegirEjercicio, pedirDescanso } from "./ejercicios-ui";
import { sonarDescanso, vibrar } from "./sonido";
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
   estos campos, así que aquí basta ese subconjunto. */
type ObjetivoSesion = Pick<EjercicioDef, "series" | "repsObjetivo" | "modoFallo" | "pesoObjetivo" | "descansoSeg" | "notas">;

interface DefSesion {
    id: string;
    nombre: string;
    objetivo: ObjetivoSesion;
    plan: number;
    planOrigen: number;   // las filas ≥ planOrigen son series extra («＋1 serie»)
    series: SerieSesion[];   // completadas: [{ reps, peso }] o [{ saltada: true }]
    notas: string;
}

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
   vueltas del progreso. */
const aSerieGuardada = (s: SerieSesion): SerieSesion => ({
    ...(esSaltada(s) ? { saltada: true } : { reps: s.reps ?? null, peso: s.peso ?? null }),
    ...(s.t != null ? { t: s.t } : {}),
    ...(s.descansoMs != null ? { descansoMs: s.descansoMs } : {}),
    ...(s.ejecMs != null ? { ejecMs: s.ejecMs } : {}),
});

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

    // Reps objetivo leyendo el MODO del ejercicio: en «al fallo» no hay número
    // que precargar ni al que volver (cada serie es la que salga), y en
    // «mínimo al fallo» el número solo es la base que se puede superar.
    const repsObjetivoDe = (d: DefSesion): number | null =>
        d.objetivo.modoFallo === "todas" ? null : d.objetivo.repsObjetivo ?? null;

    let idx = 0, pausado = false;
    // Descanso: { restanteMs, totalMs, ej } — ej = ejercicio AL QUE PERTENECE.
    // Viaja al navegar (mirar otro ejercicio no lo quita): mientras esté en
    // curso no se registra nada en ningún otro ejercicio (✔ y ⏭ bloqueados).
    let descanso: { restanteMs: number; totalMs: number; ej: number } | null = null;
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
                    // El descanso se eligió al añadir el ejercicio: se recupera del
                    // guardado, y si no consta, del último registro conocido.
                    const desc = Number(g.descansoSeg) > 0 ? Math.round(Number(g.descansoSeg))
                        : (descansoDe(rutina, g.ejercicioId) ?? 90);
                    defs.push({
                        id: g.ejercicioId,
                        nombre: g.nombre ?? g.ejercicioId,
                        objetivo: {
                            series: hechas, repsObjetivo: null, pesoObjetivo: null,
                            // El modo de reps se eligió en la sesión: viaja con el guardado
                            modoFallo: g.modoFallo ?? null,
                            descansoSeg: desc, notas: "",
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

    const completarSerie = (iSet: number) => {
        if (!iniciada || pausado) return;   // sin sesión iniciada (o en pausa) no se completan series
        if ((descanso?.restanteMs ?? 0) > 0) return;   // durante el descanso tampoco: hay que esperar (o ⏭ Saltar descanso)
        const ej = defs[idx];
        if (iSet !== ej.series.length) return;   // solo la serie que toca, en orden: evita huecos que rompen la lista
        const reps = aNumero(inReps[iSet]?.value) ?? repsObjetivoDe(ej) ?? null;
        if (reps == null && ej.objetivo.modoFallo === "todas") {
            // En «al fallo» no hay número de reserva que poner en su sitio: sin
            // las reps escritas no se registra la serie (volumen y gráficas
            // saldrían a cero). Escribe lo que has hecho y vuelve a pulsar ✔.
            toast("✏️ Escribe las repeticiones que has hecho en esta serie.", false);
            return;
        }
        const peso = pesoAKg(inPeso[iSet]?.value) ?? ej.objetivo.pesoObjetivo ?? null;
        const t0 = transcurridoMs();   // «t» = cuándo pasó (tiempo activo, sin pausas)
        const serie: SerieSesion = { reps, peso, t: t0 };
        // Si el descanso ya cumplió («¡Listo!» o salto: ejecDesde), sabemos
        // cuándo empezaste la serie → se desglosa descanso real + ejecución
        const previa = iSet > 0 ? ej.series[iSet - 1] : null;
        if (previa?.t != null && ejecDesde != null && ejecDesdeEj === idx
            && ejecDesde > previa.t && ejecDesde <= t0) {
            serie.descansoMs = ejecDesde - previa.t;
            serie.ejecMs = t0 - ejecDesde;
        }
        ej.series[iSet] = serie;
        ejecDesde = null;   // consumido por esta serie
        arrancarDescanso(Number(ej.objetivo.descansoSeg) || 90);   // descanso tras cada serie
    };

    // Saltar la serie que toca: se MARCA como saltada (ocupa su hueco en el plan)
    // en vez de saltársela en silencio, para que el registro cuadre con la rutina.
    const saltarSerie = (iSet: number) => {
        if (!iniciada || pausado) return;   // antes de iniciar (o en pausa) no se registra nada
        // Descanso de OTRO ejercicio: aquí solo se mira (saltar también registra).
        // El descanso PROPIO sí se puede saltar: es lo que hace ⏭ en su fila.
        if ((descanso?.restanteMs ?? 0) > 0 && descanso!.ej !== idx) return;
        const ej = defs[idx];
        if (iSet !== ej.series.length) return;   // solo la serie que toca
        ej.series[iSet] = { saltada: true, t: transcurridoMs() };   // también la saltada deja constancia de cuándo
        ejecDesde = null;   // no hay ejecución que medir (y el descanso propio se cancela abajo)
        descanso = null;
        pintarEjercicio();
    };

    const deshacerSerie = (iSet: number) => {
        const ej = defs[idx];
        ej.series.splice(iSet, 1);
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
            defs.push({
                id: r.id, nombre: r.nombre,
                // Aquí SÍ se precarga lo último, porque en la guiada nada se guarda
                // hasta que el usuario pulsa ✔ en cada serie: no puede haber datos
                // inventados, solo el valor inicial del campo.
                objetivo: {
                    series: plan0, repsObjetivo: u?.reps ?? null, pesoObjetivo: u?.peso ?? null,
                    // El descanso viene del selector (con el del último registro ya
                    // precargado); si no se puso ninguno, los 90 s de siempre.
                    // El modo de reps, del último registro o del plan del ejercicio.
                    modoFallo: modoRepsDe(rutina, r.id),
                    descansoSeg: r.descansoSeg || 90, notas: "",
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

    const pintarEjercicio = () => {
        const ej = defs[idx];
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

        contEj.appendChild(el("div", "gym-et", `Ejercicio ${idx + 1} de ${defs.length}`));
        contEj.appendChild(el("div", "gym-modo-ej", ej.nombre));
        const cMeta = el("div", "font-size:.9em;opacity:.8;");
        // Las reps según el modo: «10 reps», «mín. 8 (fallo)» o «al fallo»
        const repsTxt = textoRepsObjetivo(ej.objetivo);
        cMeta.appendChild(el("span", "",
            `${ej.plan} × ${ej.objetivo.modoFallo ? repsTxt : `${repsTxt} reps`} @ ${ej.objetivo.pesoObjetivo != null ? pesoTexto(ej.objetivo.pesoObjetivo) : "sin peso"}`));
        // El descanso se puede cambiar en caliente desde aquí (subrayado a
        // puntos: no es texto, es un control). 0 o vacío vuelve a 90 s.
        const dSeg = Number(ej.objetivo.descansoSeg) || 90;
        const bDesc = el("button", "", ` · descanso ${dSeg} s`);
        bDesc.type = "button";
        bDesc.title = "Tocar para cambiar el descanso entre series";
        bDesc.style.cssText = "font-size:1em;font-family:inherit;background:none;border:none;" +
            "padding:0 2px;cursor:pointer;color:inherit;opacity:.9;text-decoration:underline dotted;";
        bDesc.onclick = async () => {
            const v = await pedirDescanso(dSeg);
            if (v == null) return;
            ej.objetivo.descansoSeg = v > 0 ? Math.round(v) : 90;
            pintarEjercicio();
        };
        cMeta.appendChild(bDesc);
        // El modo de reps también se cambia aquí, igual que el descanso: en la
        // rutina libre no hay plan del que traerlo, así que esta cabecera es el
        // único sitio donde configurarlo. Si el ejercicio viene del plan, el
        // cambio se aplica a ESE ejercicio (se guarda con la rutina, como el
        // descanso hecho en caliente).
        const selModo = el("select");
        for (const [v, t] of [["", "Reps fijas"], ["minimo", "Mínimo al fallo"], ["todas", "Al fallo"]] as const) {
            const o = el("option", null, t); o.value = v; selModo.appendChild(o);
        }
        selModo.value = ej.objetivo.modoFallo ?? "";
        selModo.title = "Cómo se leen esas reps: número exacto, llegar al menos a ese número y seguir hasta el fallo, o tantas repeticiones como puedas.";
        selModo.style.cssText = "font-size:.95em;font-family:inherit;background:var(--background-secondary);" +
            "border:1px solid var(--background-modifier-border);border-radius:6px;padding:1px 5px;" +
            "cursor:pointer;color:inherit;margin-left:6px;max-width:140px;";
        selModo.onchange = () => {
            const v = selModo.value;
            ej.objetivo.modoFallo = v === "minimo" || v === "todas" ? v : null;
            // Las reps pendientes dejan de seguir el número anterior: se vacían
            // y pintarEjercicio vuelve a precargar las que toquen según el modo
            inReps.forEach(i => { if (i) i.value = ""; });
            pintarEjercicio();
        };
        cMeta.appendChild(selModo);
        contEj.appendChild(cMeta);
        if (ej.objetivo.notas) contEj.appendChild(el("div", "font-size:.82em;opacity:.65;font-style:italic;", `💡 ${ej.objetivo.notas}`));
        if (ej.notas) contEj.appendChild(el("div", "font-size:.85em;margin-top:4px;", `📝 ${esc(ej.notas)}`));

        // Descanso
        cajaDescanso = null;
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
            const bMas = el("button", "gym-btn-g", "＋30 s"); bMas.type = "button";
            bMas.onclick = () => { descanso!.restanteMs += 30000; descanso!.totalMs = Math.max(descanso!.totalMs, descanso!.restanteMs); pintarDescanso(); };
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
            contEj.appendChild(cajaDescanso);
            pintarDescanso();
        }

        // Series
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
                fila.appendChild(el("div", "font-size:.92em;font-style:italic;", "⏭ Saltada"));
                fila.appendChild(el("div"));
                const cierreS = el("div", "cierre");
                const bUndoS = el("button", "gym-btn-g", "↩"); bUndoS.type = "button";
                bUndoS.title = "Rehacer: vuelve a estar pendiente";
                bUndoS.onclick = () => deshacerSerie(i);
                cierreS.appendChild(bUndoS);
                fila.appendChild(cierreS);
            } else if (registrada) {
                const txt = el("div", "font-size:.95em;", `${s.reps ?? "–"} reps × ${s.peso != null ? pesoTexto(s.peso) : "sin peso"}`);
                fila.appendChild(txt);
                fila.appendChild(el("div"));
                const cierre = el("div", "cierre");
                const bUndo = el("button", "gym-btn-g", "↩"); bUndo.type = "button"; bUndo.title = "Deshacer serie";
                bUndo.onclick = () => deshacerSerie(i);
                cierre.appendChild(bUndo);
                fila.appendChild(cierre);
            } else {
                const iR = el("input"); iR.type = "number"; iR.inputMode = "numeric"; iR.min = "0";
                iR.placeholder = ej.objetivo.modoFallo === "minimo" && ej.objetivo.repsObjetivo
                    ? `mín. ${ej.objetivo.repsObjetivo}` : "reps";
                const p = prev[i];   // prev conserva lo tecleado en reps/peso
                iR.value = (p && p.reps !== "") ? p.reps : String(repsObjetivoDe(ej) ?? "");
                const iP = el("input"); iP.type = "number"; iP.inputMode = "decimal"; iP.min = "0"; iP.step = "0.5";
                // prev conserva lo tecleado (unidad activa); el objetivo está en kg
                iP.value = (p && p.peso !== "") ? p.peso : pesoACampo(ej.objetivo.pesoObjetivo);
                const bOk = el("button", "gym-btn-g verde", "✔"); bOk.type = "button";
                const enDescansoPend = (descanso?.restanteMs ?? 0) > 0;
                const descansoAjeno = enDescansoPend && descanso!.ej !== idx;
                bOk.title = !esActual ? "Primero completa la serie " + (ej.series.length + 1)
                    : !iniciada ? "Pulsa ▶ Iniciar sesión para completar series"
                    : pausado ? "Reanuda la sesión para completar series"
                    : descansoAjeno ? `⏳ Descanso de «${defs[descanso!.ej].nombre}»: aquí solo miras — completa series en tu ejercicio`
                    : enDescansoPend ? "⏳ En descanso: espera a que termine (o pulsa ⏭ Saltar descanso)"
                    : "Completar esta serie";
                if (!esActual || !iniciada || pausado || enDescansoPend) bOk.disabled = true;
                bOk.onclick = () => completarSerie(i);
                inReps[i] = iR; inPeso[i] = iP;
                const bSaltar = el("button", "gym-btn-g", "⏭"); bSaltar.type = "button";
                bSaltar.title = !esActual ? "Primero llega a la serie " + (ej.series.length + 1)
                    : !iniciada ? "Pulsa ▶ Iniciar sesión para registrar series"
                    : pausado ? "Reanuda la sesión para registrar series"
                    : descansoAjeno ? `⏳ Descanso de «${defs[descanso!.ej].nombre}»: no se registra nada en otro ejercicio hasta que termine`
                    : "Marcar esta serie como saltada: queda registrada en el historial";
                bSaltar.disabled = !esActual || !iniciada || pausado || descansoAjeno;
                bSaltar.onclick = () => saltarSerie(i);
                const cierreF = el("div", "cierre");
                cierreF.appendChild(bOk); cierreF.appendChild(bSaltar);
                fila.appendChild(iR); fila.appendChild(iP); fila.appendChild(cierreF);
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

        // Acción principal
        const enDescanso = Boolean(descanso);
        const listoDescanso = Boolean(descanso && descanso.restanteMs <= 0);
        const pendientes = ej.series.length < ej.plan;
        let texto = "✔ Hecho — empezar descanso";
        let accion: (() => void) | null = () => completarSerie(ej.series.length);
        let clase = "primario";
        if (!iniciada) { texto = "▶ Iniciar sesión"; accion = () => iniciar(); clase = "primario"; }
        else if (pausado) { texto = "⏸ EN PAUSA — pulsa para continuar"; accion = () => btnPausa.click(); clase = "pausa"; }
        else if (enDescanso && !listoDescanso) {
            // Descansando (aquí o en otro ejercicio visto): no se registra nada hasta «¡Listo!»
            texto = descanso!.ej !== idx ? `⏳ Descansando de «${defs[descanso!.ej].nombre}»… (aquí solo miras)`
                                         : "⏳ Descansando… (usa +30 s o Saltar)";
            accion = null; clase = "";
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
        if (ejecDesdeEj === idx) ejecDesde = null;   // no se va a ejecutar nada de ese «¡Listo!»
        // Marca lo que quede pendiente como saltado, para que el registro cuadre con el plan
        while (ej.series.length < ej.plan) ej.series.push({ saltada: true, t: transcurridoMs() });
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
            ejercicios: defs.map(d => {
                const ej: EjercicioSesion = {
                    ejercicioId: d.id,
                    nombre: d.nombre,
                    notas: d.notas || "",
                    series: d.series.map(aSerieGuardada),
                };
                // El descanso viaja con el registro: si no, al reanudar o al
                // reabrirlo en el formulario se volvería a los 90 s.
                const desc = Number(d.objetivo?.descansoSeg);
                if (desc > 0) ej.descansoSeg = Math.round(desc);
                // El modo de reps viaja también: en la rutina libre no hay plan
                // del que traerlo al reanudar.
                const modo = d.objetivo?.modoFallo;
                if (modo === "todas" || modo === "minimo") ej.modoFallo = modo;
                if (!ej.series.length && !ej.notas) ej.sinRegistrar = true;
                return ej;
            }),
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
            ejercicios: defs.map(d => {
                const ej: EjercicioSesion = {
                    ejercicioId: d.id,
                    nombre: d.nombre,
                    notas: d.notas || "",
                    series: d.series.map(aSerieGuardada),
                };
                // El descanso viaja con el registro: si no, al reanudar o al
                // reabrirlo en el formulario se volvería a los 90 s.
                const desc = Number(d.objetivo?.descansoSeg);
                if (desc > 0) ej.descansoSeg = Math.round(desc);
                // El modo de reps viaja también: en la rutina libre no hay plan
                // del que traerlo al reanudar.
                const modo = d.objetivo?.modoFallo;
                if (modo === "todas" || modo === "minimo") ej.modoFallo = modo;
                if (!ej.series.length && !ej.notas) ej.sinRegistrar = true;
                return ej;
            }),
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
        descanso.restanteMs = 0;
        ejecDesde = transcurridoMs();   // AHÍ empiezas la serie (para desglosar descanso/ejecución)
        ejecDesdeEj = descanso.ej;
        const due = descanso.ej;
        if (due !== idx && due >= 0 && due < defs.length && !animando) deslizarA(due);
        else pintarEjercicio();
    };

    // ── Reloj (cada 250 ms: tiempo de sesión activa y cuenta atrás del descanso) ──
    // El descanso descuenta el tiempo REAL transcurrido entre tics (dt), no
    // «250 ms por tic»: con la pantalla apagada u Obsidian en segundo plano el
    // SO suspende o ralentiza los intervalos del WebView y, al volver, un
    // contador fijo seguiría desde donde estaba —el descanso se quedaría parado
    // o atrasado el tiempo que estuviste fuera—. Con dt derivado de Date.now()
    // (como ya hacía el cronómetro de sesión) el primer tic tras volver descuenta
    // de golpe todo el tiempo transcurrido y la cuenta atrás es fiel al reloj.
    const idReloj = window.setInterval(() => {
        const ahora = Date.now();
        const dt = Math.max(0, ahora - ultimoTick);   // tiempo real desde el tic anterior
        ultimoTick = ahora;   // se refresca SIEMPRE, también en pausa (si no, al reanudar se descontaría la pausa)
        relojEl.textContent = `⏱ ${relojTexto(transcurridoMs())}`;   // en pausa se congela: el reloj mide tiempo activo
        if (pausado) return;   // la pausa sí congela la cuenta atrás del descanso
        if (descanso && descanso.restanteMs > 0) {
            descanso.restanteMs -= dt;
            if (descanso.restanteMs > 0) {
                pintarDescanso();
            } else {
                finDescanso();   // dt ≥ restante: el descanso terminó aunque el SO hubiera suspendido los tics
            }
        }
    }, 250);

    pintarEjercicio();
    relojEl.textContent = `⏱ ${relojTexto(transcurridoMs())}`;   // al reanudar, el reloj continúa desde donde estaba
    sincronizaPantalla();   // sesión reabierta a mitad: ya corre, así que despierta
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
}
