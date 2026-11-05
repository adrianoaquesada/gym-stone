import { CONFIG } from "../config";
import { ReclamoDespierta } from "../despierta";
import {
    cargarBaseRecordesPersonales, descansoDe, detectarRecordesSesion,
    diaPorId, diaProgramado, esLibre, esSaltada, esSinRegistrar, etiquetasDeDia,
    escribirRutina, repsObjetivoDe, seriesHechas, textoRepsObjetivo, volumenSesion,
    tipoEjercicioDe, tipoSerieDe, tipoSerieDeRutina, ultimosValores,
} from "../datos";
import type { BaseRecordesPersonales, RecordeDetectado } from "../datos";
import type {
    EjercicioDef, EjercicioSesion, Rutina, SerieSesion, Sesion, TipoBloqueEspecial, TipoSerie,
} from "../tipos";
import { pesoACampo, pesoAKg, pesoTexto } from "../unidades";
import { aNumero, dos, esc, fechaLegible, hoy, msgError } from "../util";
import { btn, confirmar, el, modal, pedirTexto, ponerX, toast } from "./componentes";
import { controlDescanso, elegirEjercicio, pedirDescanso } from "./ejercicios-ui";
import { ofrecerAjustesPlan, tieneAjustesSugeridos } from "./sugerencias-plan";
import {
    prepararAudio, reiniciarCuentaAtras, sonarCuentaAtras, sonarDescanso, sonarTemporizador, vibrar,
} from "./sonido";
import type { Pintar } from "./pintar";

const sesionesAbiertas = new Set<() => void>();
let retomarSesionMinimizada: (() => void) | null = null;

const actualizarBotonesSesionGuiada = (): void => {
    const minimizada = retomarSesionMinimizada !== null;
    for (const boton of document.querySelectorAll<HTMLButtonElement>("[data-gym-sesion-guiada]")) {
        boton.textContent = minimizada
            ? boton.dataset.gymTextoRetomar ?? "🎯 ↩ Retomar sesión guiada"
            : boton.dataset.gymTextoInicio ?? "🎯 Empezar sesión guiada";
        boton.title = minimizada
            ? "Retomar sesión guiada minimizada"
            : boton.dataset.gymTituloInicio ?? "Empezar sesión guiada";
        boton.setAttribute("aria-label", boton.title);
        boton.classList.toggle("gym-btn-retomar", minimizada);
    }
};

export const prepararBotonSesionGuiada = (
    boton: HTMLButtonElement,
    textoRetomar: string,
): void => {
    boton.dataset.gymSesionGuiada = "true";
    boton.dataset.gymTextoInicio = boton.textContent ?? "🎯 Empezar sesión guiada";
    boton.dataset.gymTituloInicio = boton.title;
    boton.dataset.gymTextoRetomar = textoRetomar;
    actualizarBotonesSesionGuiada();
};

export const retomarSesionGuiadaMinimizada = (): boolean => {
    if (!retomarSesionMinimizada) return false;
    retomarSesionMinimizada();
    return true;
};

export const cerrarSesionesAbiertas = (): void => {
    for (const cierre of [...sesionesAbiertas]) cierre();
};

type ObjetivoSesion = Pick<EjercicioDef,
    "series" | "repsObjetivo" | "tipoSerie" | "pesoObjetivo" | "descansoSeg" | "notas"
    | "tipoEjercicio" | "tipoBloqueEspecial" | "duracionObjetivo" | "repsPesoDuranteTiempo"
    | "trabajoSeg" | "transicionSeg">;

interface DefSesion {
    id: string;
    nombre: string;
    objetivo: ObjetivoSesion;
    plan: number;
    planOrigen: number;
    series: SerieSesion[];
    planDeRutina?: boolean;
    tipoSiguiente?: TipoSerie | null;
    inicioBloqueMs?: number;
    notas: string;
}

const TIPOS_SERIE: [TipoSerie, string][] = [
    ["calentamiento", "Calentamiento"], ["trabajo", "Trabajo"],
    ["descenso", "Descenso"], ["fallo", "Fallo"],
];

const etiquetaTipoSerie = (t: TipoSerie): string =>
    TIPOS_SERIE.find(([v]) => v === t)?.[1] ?? "Trabajo";

const letraTipoSerie = (tipo: TipoSerie): string =>
    ({ calentamiento: "C", trabajo: "T", descenso: "D", fallo: "F" })[tipo];

const tipoSerieSiguiente = (d: DefSesion): TipoSerie =>
    d.tipoSiguiente ?? tipoSerieDe(d.objetivo);

const nombreBloqueEspecial = (tipo: TipoBloqueEspecial): string =>
    tipo === "calentamiento" ? "Calentamiento" : "Estiramiento";

const nombreMetricaRecorde = (recorde: RecordeDetectado): string => {
    switch (recorde.metrica) {
        case "peso": return "Peso máximo";
        case "1rm": return "1RM estimado";
        case "repeticiones": return "Máximas reps con el mismo peso";
        case "duracion": return "Mejor duración";
        case "volumen-ejercicio": return "Volumen del ejercicio";
        case "volumen-sesion": return "Volumen de la sesión";
    }
};

const valorRecorde = (recorde: RecordeDetectado): string => {
    switch (recorde.metrica) {
        case "peso":
        case "1rm":
            return pesoTexto(recorde.valor);
        case "repeticiones":
            return `${recorde.valor} reps con ${pesoTexto(recorde.peso)}`;
        case "duracion":
            return `${recorde.valor} s`;
        case "volumen-ejercicio":
        case "volumen-sesion":
            return pesoTexto(recorde.valor);
    }
};

const enPlanDe = (rutina: Rutina, id: string): EjercicioDef | null =>
    (rutina.dias ?? []).flatMap(d => d.ejercicios ?? []).find(e => e.id === id) ?? null;

const pedirCiclo = (trabajo: number | null, descanso: number | null):
    Promise<{ trabajo: number; transicion: number } | null> => new Promise(resolve => {
    const m = modal("⏱ Ciclo de intervalo", "segundos de trabajo y de descanso entre ciclos", true);
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
    const cTrans = controlDescanso(descanso, { etiqueta: "Descanso entre ciclos (segundos, 0 = ninguno)" });
    m.caja.appendChild(cTrab.raiz);
    m.caja.appendChild(cTrans.raiz);
    const ok = el("button", "gym-btn primario gym-btn-ancho gym-mt12", "✔ Guardar ciclo");
    ok.type = "button";
    ok.onclick = () => listo({ trabajo: cTrab.seg(), transicion: cTrans.seg() });
    m.caja.appendChild(ok);
});

export function elegirDiaGuiada(rutina: Rutina, pintar: Pintar): void {
    if (retomarSesionGuiadaMinimizada()) return;

    if (esLibre(rutina)) {
        const enCurso = (rutina.sesiones ?? []).find(s => s.enCurso);
        void modoSesion(rutina, enCurso?.diaId || null, pintar);
        return;
    }
    const prog = diaProgramado(rutina, hoy());
    if (prog) { void modoSesion(rutina, prog.id, pintar); return; }

    const m = modal("🎯 ¿Qué día vas a hacer?", `${fechaLegible(hoy())} · hoy no estaba programado`);
    const filaD = el("div", "gym-botones");
    for (const d of rutina.dias ?? []) {
        filaD.appendChild(btn(d.nombre, "primario", () => { m.cerrar(); void modoSesion(rutina, d.id, pintar); }));
    }
    m.caja.appendChild(filaD);
    m.caja.appendChild(btn("Cancelar", "", () => m.cerrar()));
}

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

    const tactil = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
    const valor = (medida: number, reserva: number): number => (medida > 0 ? medida : (tactil ? reserva : 0));
    const r = document.documentElement.style;

    r.setProperty("--gym-safe-top", `${valor(t, 20)}px`);
    r.setProperty("--gym-safe-bottom", `${valor(b, 38)}px`);
    r.setProperty("--gym-safe-left", `${valor(iz, 0)}px`);
    r.setProperty("--gym-safe-right", `${valor(de, 0)}px`);
};

const aSerieGuardada = (s: SerieSesion): SerieSesion => ({
    ...(esSaltada(s) ? { saltada: true } : { reps: s.reps ?? null, peso: s.peso ?? null }),
    ...(s.duracionSeg != null ? { duracionSeg: s.duracionSeg } : {}),
    ...(s.tipoSerie ? { tipoSerie: s.tipoSerie } : {}),   // etiqueta puesta al registrarla
    ...(s.t != null ? { t: s.t } : {}),
    ...(s.descansoMs != null ? { descansoMs: s.descansoMs } : {}),
    ...(s.ejecMs != null ? { ejecMs: s.ejecMs } : {}),
});

const aEjercicioGuardado = (d: DefSesion, transcurridoMs?: number): EjercicioSesion => {
    const ej: EjercicioSesion = {
        ejercicioId: d.id,
        nombre: d.nombre,
        notas: d.notas || "",
        series: d.series.map(aSerieGuardada),
        ...(d.planDeRutina && tipoEjercicioDe(d.objetivo) === "peso" ? {
            objetivoPlan: {
                series: Math.max(1, Number(d.objetivo.series) || 1),
                repsObjetivo: repsObjetivoDe(d.objetivo),
                pesoObjetivo: d.objetivo.pesoObjetivo ?? null,
            },
        } : {}),
    };

    if (d.objetivo.tipoBloqueEspecial) {
        ej.tipoBloqueEspecial = d.objetivo.tipoBloqueEspecial;
        if (d.inicioBloqueMs != null && !d.series.length && transcurridoMs != null) {
            ej.bloqueEspecialTranscurridoMs = Math.max(0, transcurridoMs - d.inicioBloqueMs);
        }
    }
    const descSeg = d.objetivo?.descansoSeg;
    const desc = Number(descSeg);
    if (descSeg != null && (desc > 0 || tipoEjercicioDe(d.objetivo) === "intervalo"))
        ej.descansoSeg = Math.round(desc);
    ej.tipoEjercicio = tipoEjercicioDe(d.objetivo);
    if (tipoEjercicioDe(d.objetivo) === "tiempo" && d.objetivo.repsPesoDuranteTiempo)
        ej.repsPesoDuranteTiempo = true;
    const num = (v: number | null | undefined): number | null => {
        const n = Number(v);
        return n > 0 ? Math.round(n) : null;
    };
    const dur = num(d.objetivo?.duracionObjetivo);
    if (dur != null) ej.duracionObjetivo = dur;
    const trb = num(d.objetivo?.trabajoSeg);
    if (trb != null) ej.trabajoSeg = trb;
    const tra = d.objetivo?.transicionSeg ?? d.objetivo?.descansoSeg;
    if (tipoEjercicioDe(d.objetivo) === "intervalo")
        ej.transicionSeg = Math.max(0, Math.round(Number(tra) || 0));
    else if (tra != null) ej.transicionSeg = Math.round(Number(tra));
    if (!ej.series.length && !ej.notas && ej.bloqueEspecialTranscurridoMs == null) ej.sinRegistrar = true;
    return ej;
};

export async function modoSesion(rutina: Rutina, diaId: string | null, pintar: Pintar): Promise<void> {
    medirAreasSeguras();

    let dia = diaPorId(rutina, diaId as string)
        ?? (esLibre(rutina) ? { id: diaId ?? "", nombre: diaId || "Sesión libre", ejercicios: [] } : null)
        ?? rutina.dias?.[0];
    if (!dia) return toast("⚠️ La rutina no tiene días definidos.", false);
    const haySesionEnCurso = (rutina.sesiones ?? []).some(s => s.enCurso);
    const sesionesAnteriores = rutina.sesiones ?? [];
    if (!haySesionEnCurso && tieneAjustesSugeridos(rutina, sesionesAnteriores, dia.id)) {
        const aviso = modal("💡 Ajustes para esta sesión", dia.nombre);
        await ofrecerAjustesPlan(rutina, sesionesAnteriores, dia.id, aviso.caja,
            () => { void pintar(); aviso.cerrar(); }, () => aviso.cerrar(), false);
        dia = diaPorId(rutina, dia.id) ?? dia;
    }
    const defs: DefSesion[] = (dia.ejercicios ?? []).map(e => {
        const plan0 = Math.max(1, Number(e.series) || 1);
        return {
            id: e.id,
            nombre: e.nombre,
            objetivo: e,
            plan: plan0,
            planOrigen: plan0, // las filas ≥ planOrigen son series extra («＋1 serie»): se marcan y se pueden quitar
            planDeRutina: true,
            series: [],          // completadas: [{ reps, peso }]
            notas: "",
        };
    });
    if (!defs.length && !esLibre(rutina)) return toast("⚠️ Ese día no tiene ejercicios.", false);

    let idx = 0, pausado = false;

    let descanso: { restanteMs: number; totalMs: number; ej: number } | null = null;

    let hold: { ms: number; ej: number } | null = null;

    let ciclo: { fase: "trabajo" | "descanso"; n: number; ej: number; restanteMs: number; totalMs: number; trabajoSeg: number } | null = null;
    let iniciada = false, inicio = 0;
    let inicioRealMs: number | null = null;

    let pausaAcum = 0, pausaPend: number | null = null, pausaT0 = 0;
    const pausas: { t: number; ms: number }[] = [];

    let ultimoTick = Date.now();

    let ejecDesde: number | null = null, ejecDesdeEj = -1;

    const pantalla = new ReclamoDespierta();
    const sincronizaPantalla = (): void => pantalla.fijar(iniciada && !pausado);

    let parcialGuard: Sesion | null = (rutina.sesiones ?? []).find(s => s.enCurso && s.diaId === dia.id) || null;
    let baseRecordes: BaseRecordesPersonales | null = null;
    let errorCargaRecordes = "";
    try {
        baseRecordes = await cargarBaseRecordesPersonales(rutina);
    } catch (e: unknown) {
        console.error("[GymGestor récords personales]", e);
        errorCargaRecordes = msgError(e);
        toast("⚠️ No pude comprobar tus récords personales: " + errorCargaRecordes, false);
    }

    const recordesDeSesion = (): RecordeDetectado[] => {
        if (!baseRecordes) return [];
        return detectarRecordesSesion({
            fecha: hoy(),
            diaId: dia.id,
            ejercicios: defs.map(aEjercicioGuardado),
        }, baseRecordes);
    };

    if (parcialGuard) {
        const nSeriesParcial = (parcialGuard.ejercicios ?? []).reduce(
            (t, x) => t + seriesHechas({ series: x.series }).length, 0);
        const nSinRegParcial = (parcialGuard.ejercicios ?? []).filter(esSinRegistrar).length;
        if (await confirmar("🔄 Progreso guardado",
            `Hay progreso guardado de «${dia.nombre}» · ${nSeriesParcial} series · ~${Number(parcialGuard.duracionMin) || 0} min.` +
            (nSinRegParcial ? ` · ${nSinRegParcial} ejercicio${nSinRegParcial > 1 ? "s" : ""} sin registrar` : "") +
            `\n\n¿Continuar desde donde lo dejaste?`,
            "Continuar", "Empezar desde cero")) {

            if (esLibre(rutina) && !defs.length) {
                for (const g of parcialGuard.ejercicios ?? []) {
                    const hechas = Math.max(1, (g.series ?? []).length);

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

                            tipoSerie: null,
                            descansoSeg: desc, notas: "",

                            tipoEjercicio: g.tipoEjercicio ?? null,
                            tipoBloqueEspecial: g.tipoBloqueEspecial ?? null,
                            duracionObjetivo: g.duracionObjetivo ?? null,
                            repsPesoDuranteTiempo: g.repsPesoDuranteTiempo === true,
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

            idx = Math.min(Math.max(0, Number(parcialGuard.idx) || 0), Math.max(0, defs.length - 1));
            pausas.push(...(parcialGuard.pausas ?? []));
            pausaAcum = pausas.reduce((total, pausa) => total + Math.max(0, Number(pausa.ms) || 0), 0);
            const msParcial = Number(parcialGuard.transcurridoMs) || 0;
            if (msParcial > 0) {
                iniciada = true;
                inicio = Date.now() - msParcial + pausaAcum;
                inicioRealMs = Number(parcialGuard.inicioRealMs) || null;
            }
            for (const d of defs) {
                const guardado = (parcialGuard.ejercicios ?? []).find(x => x.ejercicioId === d.id);
                if (d.objetivo.tipoBloqueEspecial && guardado?.bloqueEspecialTranscurridoMs != null) {
                    d.inicioBloqueMs = msParcial - guardado.bloqueEspecialTranscurridoMs;
                }
            }
        }
    }

    const transcurridoMs = (): number => {

        if (!iniciada) return 0;
        const ahora = Date.now();
        return ahora - inicio - pausaAcum - (pausaPend != null ? ahora - pausaPend : 0);
    };
    const relojTexto = (ms: number): string => {
        const s = Math.max(0, Math.floor(ms / 1000));
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
        return (h ? `${h}:${dos(m)}` : String(m)) + `:${dos(s % 60)}`;
    };

    const overlay = el("div", "gym-modo");
    overlay.id = "gym-modo-activo";
    const cajaM = el("div", "gym-modo-caja");
    overlay.appendChild(cajaM);
    let minimizada = false;

    const cab = el("div", "gym-modo-cab");
    const titCab = el("div", "flex:1;min-width:0;");
    const titDia = el("b", "gym-naranja gym-modo-titulo-dia", `🎯 ${dia.nombre}`);
    const filaTitulo = el("div", "gym-modo-titulos");
    filaTitulo.append(titDia, el("div", "gym-modo-fecha", fechaLegible(hoy())));
    const tipoDia = el("div", "gym-modo-tipo-dia");
    const etiquetasDia = etiquetasDeDia(dia);
    const etiquetasPersonalizadasDia = new Set(
        etiquetasDia.personalizadas.map(etiqueta => etiqueta.toLocaleLowerCase("es")),
    );
    if (etiquetasDia.todas.length) {
        tipoDia.setAttribute("aria-label", `Tipo de día: ${etiquetasDia.todas.join(", ")}`);
        tipoDia.appendChild(el("span", "gym-modo-tipo-dia-etiqueta", "Tipo de día"));
    }
    for (const etiqueta of etiquetasDia.todas) {
        const esGrupo = etiquetasDia.gruposDerivados.some(
            grupo => grupo.toLocaleLowerCase("es") === etiqueta.toLocaleLowerCase("es"),
        );
        const esPersonalizada = etiquetasPersonalizadasDia.has(etiqueta.toLocaleLowerCase("es"));
        const chip = el("span", "gym-chip gym-chip-mini" + (esGrupo ? " gym-grupo" : ""), etiqueta);
        chip.title = esGrupo && esPersonalizada
            ? "Grupo de los ejercicios y etiqueta personalizada"
            : esGrupo ? "Grupo de los ejercicios de este día" : "Etiqueta personalizada";
        tipoDia.appendChild(chip);
    }
    titCab.append(filaTitulo, tipoDia);

    const relojEl = el("span", "gym-btn-g gym-modo-reloj");
    const btnPausa = el("button", "gym-btn-g gym-btn-pausa gym-btn-descanso-pausa", "⏸ Pausa"); btnPausa.type = "button";
    btnPausa.title = "Pausa: congela el cronómetro y el descanso";
    btnPausa.setAttribute("aria-label", "Pausar sesión");
    const btnMinimizar = el("button", "gym-btn-g gym-cerrar-x", "−"); btnMinimizar.type = "button";
    btnMinimizar.title = "Minimizar sesión guiada";
    btnMinimizar.setAttribute("aria-label", "Minimizar sesión guiada");
    const btnCerrar = el("button", "gym-btn-g gym-cerrar-x gym-x44", "✕"); btnCerrar.type = "button";
    btnCerrar.title = "Salir sin guardar";
    cab.appendChild(titCab); cab.appendChild(relojEl);
    cab.append(btnMinimizar, btnCerrar);
    cajaM.appendChild(cab);

    const btnRestaurar = el("button", "gym-sesion-restaurar", "🎯 Volver a la sesión");
    btnRestaurar.type = "button";
    btnRestaurar.title = "Mostrar la sesión guiada";
    btnRestaurar.setAttribute("aria-label", "Mostrar la sesión guiada");
    const restaurar = (): void => {
        minimizada = false;
        if (retomarSesionMinimizada === restaurar) retomarSesionMinimizada = null;
        actualizarBotonesSesionGuiada();
        overlay.classList.remove("gym-modo-minimizado");
        overlay.removeAttribute("aria-hidden");
        btnRestaurar.remove();
        btnMinimizar.focus();
    };
    const minimizarSesion = (): void => {
        minimizada = true;
        retomarSesionMinimizada = restaurar;
        actualizarBotonesSesionGuiada();
        overlay.classList.add("gym-modo-minimizado");
        overlay.setAttribute("aria-hidden", "true");
        document.body.appendChild(btnRestaurar);
        btnRestaurar.focus();
    };
    btnMinimizar.onclick = minimizarSesion;
    btnRestaurar.onclick = restaurar;

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
    cajaM.appendChild(progreso);
    const contEj = el("div");
    cuerpo.appendChild(contEj);
    cajaM.appendChild(cuerpo);

    const barraAccion = el("div", "gym-modo-accion");
    cajaM.appendChild(barraAccion);

    const pie = el("div", "gym-modo-pie");
    cajaM.appendChild(pie);

    let inReps: (HTMLInputElement | undefined)[] = [], inPeso: (HTMLInputElement | undefined)[] = [];
    let inDuracion: (HTMLInputElement | undefined)[] = [];
    let tipoSerieAbierto: number | null = null;
    let logrosAbiertos: number | null = null;
    let cajaDescanso: HTMLDivElement | null = null, tDescanso: HTMLDivElement | null = null;
    let barraDescanso: HTMLDivElement | null = null;
    let btnAccion: HTMLButtonElement | null = null;

    let cajaCiclo: HTMLDivElement | null = null, tCiclo: HTMLDivElement | null = null;
    let barraCiclo: HTMLDivElement | null = null;
    let lecturaBloque: HTMLElement | null = null;
    let confirmarCancelarCiclo = false;
    let cajaHold: HTMLDivElement | null = null, tHold: HTMLDivElement | null = null;
    let valorHold: HTMLSpanElement | null = null;
    let barraHold: HTMLDivElement | null = null;
    let diferenciaHold: HTMLSpanElement | null = null;
    let confirmarCancelarHold = false;

    const pintarDescanso = () => {

        if (!cajaDescanso || !tDescanso || !barraDescanso) return;
        const seg = Math.ceil((descanso?.restanteMs ?? 0) / 1000);
        const listo = descanso && descanso.restanteMs <= 0;
        cajaDescanso.classList.toggle("listo", Boolean(listo));
        tDescanso.textContent = listo ? "¡Listo!" : `${Math.floor(seg / 60)}:${dos(seg % 60)}`;
        const pct = descanso && descanso.totalMs > 0 ? Math.max(0, Math.min(100, descanso.restanteMs / descanso.totalMs * 100)) : 0;
        barraDescanso.style.width = pct.toFixed(1) + "%";
    };

    const pintarCiclo = () => {
        if (!cajaCiclo || !tCiclo || !barraCiclo) return;
        const seg = Math.ceil((ciclo?.restanteMs ?? 0) / 1000);
        tCiclo.textContent = `${Math.floor(seg / 60)}:${dos(seg % 60)}`;
        const pct = ciclo && ciclo.totalMs > 0 ? Math.max(0, Math.min(100, ciclo.restanteMs / ciclo.totalMs * 100)) : 0;
        barraCiclo.style.width = pct.toFixed(1) + "%";
    };

    const pintarHold = () => {
        if (!cajaHold || !tHold || !valorHold) return;
        valorHold.textContent = relojTexto(hold?.ms ?? 0);
        if (hold) {
            const obj = Math.round(Number(defs[hold.ej]?.objetivo.duracionObjetivo) || 0);
            if (barraHold) {
                barraHold.style.width = obj > 0 ? Math.min(100, hold.ms / (obj * 1000) * 100).toFixed(1) + "%" : "100%";
                barraHold.classList.toggle("superado", obj > 0 && hold.ms > obj * 1000);
            }
            if (diferenciaHold && obj > 0) {
                const delta = Math.floor(hold.ms / 1000) - obj;
                diferenciaHold.textContent = delta < 0 ? `faltan ${Math.abs(delta)} s`
                    : delta > 0 ? `+${delta} s` : "objetivo";
                diferenciaHold.classList.toggle("superado", delta > 0);
                diferenciaHold.title = delta < 0
                    ? `Faltan ${Math.abs(delta)} segundos para el objetivo`
                    : delta > 0 ? `${delta} segundos por encima del objetivo` : "Objetivo alcanzado";
            }
        }
        if (hold && hold.ej === idx) {
            const inp = inDuracion[defs[idx].series.length];
            if (inp) inp.value = String(Math.floor(hold.ms / 1000));
        }
    };

    const iniciar = () => {
        if (iniciada || pausado) return;
        prepararAudio();
        iniciada = true;
        inicio = Date.now();
        inicioRealMs ??= Date.now();
        if (defs[idx]?.objetivo.tipoBloqueEspecial) defs[idx].inicioBloqueMs ??= transcurridoMs();
        sincronizaPantalla();
        pintarEjercicio();
    };

    const arrancarDescanso = (seg: number) => {
        ejecDesde = null;
        descanso = { restanteMs: Math.max(5, seg) * 1000, totalMs: Math.max(5, seg) * 1000, ej: idx };
        pintarEjercicio();
    };

    const empezarHold = (): void => {

        if (!iniciada || pausado || (descanso && descanso.restanteMs > 0) || ciclo || hold) return;
        descanso = null;
        ejecDesde = transcurridoMs();
        ejecDesdeEj = idx;
        confirmarCancelarHold = false;
        hold = { ms: 0, ej: idx };
        pintarEjercicio();
    };
    const cancelarHold = (): void => {
        if (!hold) return;
        if (ejecDesdeEj === hold.ej) ejecDesde = null;

        if (hold.ej === idx) {
            const inp = inDuracion[defs[idx].series.length];
            if (inp) inp.value = "";
        }
        confirmarCancelarHold = false;
        hold = null;
        pintarEjercicio();
    };

    const iniciarCiclo = (): void => {

        if (!iniciada || pausado || (descanso && descanso.restanteMs > 0) || hold || ciclo) return;
        descanso = null;
        const ej = defs[idx];
        const trabajo = Math.round(Number(ej.objetivo.trabajoSeg) || 0);
        if (trabajo <= 0) {

            toast(enPlanDe(rutina, ej.id)
                ? "⚠️ Este ejercicio no tiene tiempo de trabajo definido: pónlo en el creador."
                : "⚠️ Sin tiempo de trabajo: tócalo en «· ciclo …» de la cabecera.", false);
            return;
        }
        ejecDesde = transcurridoMs();
        ejecDesdeEj = idx;
        confirmarCancelarCiclo = false;
        ciclo = { fase: "trabajo", n: ej.series.length + 1, ej: idx,
                  restanteMs: trabajo * 1000, totalMs: trabajo * 1000, trabajoSeg: trabajo };
        pintarEjercicio();
    };
    const cancelarCiclo = (): void => {
        if (!ciclo) return;
        if (ejecDesdeEj === ciclo.ej) ejecDesde = null;
        confirmarCancelarCiclo = false;
        ciclo = null;
        pintarEjercicio();
    };

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
        ej.tipoSiguiente = null;
        ejecDesde = null;
        sonarTemporizador();
        vibrar();

        const ultimo = ej.series.length >= ej.plan;
        const descansoCiclo = ej.objetivo.transicionSeg != null
            ? Math.max(0, Math.round(Number(ej.objetivo.transicionSeg) || 0))
            : Math.max(0, Math.round(Number(ej.objetivo.descansoSeg) || 0));
        const resto = ultimo ? 0 : descansoCiclo;
        ciclo = resto > 0
            ? { fase: "descanso", n: c.n, ej: c.ej, restanteMs: resto * 1000, totalMs: resto * 1000, trabajoSeg: c.trabajoSeg }
            : null;
        confirmarCancelarCiclo = false;

        const due = c.ej;
        if (due !== idx && due >= 0 && due < defs.length && !animando) deslizarA(due);
        else pintarEjercicio();
    };

    const finDescansoCiclo = (): void => {
        if (!ciclo) return;
        const due = ciclo.ej;
        ciclo = null;
        confirmarCancelarCiclo = false;
        sonarTemporizador();
        vibrar();
        if (due !== idx && due >= 0 && due < defs.length && !animando) deslizarA(due);
        else pintarEjercicio();
    };

    const saltarDescansoCiclo = (): void => {
        if (!ciclo || ciclo.fase !== "descanso") return;
        const due = ciclo.ej;
        ciclo = null;
        confirmarCancelarCiclo = false;
        if (due >= 0 && due !== idx && due < defs.length && !animando) deslizarA(due);
        else pintarEjercicio();
    };

    const indiceEjercicioPendiente = (): number =>
        defs.findIndex(def => def.series.length < def.plan);

    const completarSerie = (iSet: number) => {
        if (!iniciada || pausado) return;
        const indicePendiente = indiceEjercicioPendiente();
        if (indicePendiente >= 0 && indicePendiente !== idx) {
            irAEjercicio(indicePendiente);
            completarSerie(defs[indicePendiente].series.length);
            return;
        }
        if ((descanso?.restanteMs ?? 0) > 0) return;
        if (ciclo) return;
        if (hold && hold.ej !== idx) return;
        const ej = defs[idx];
        if (iSet !== ej.series.length) return;
        const tipo = tipoEjercicioDe(ej.objetivo);
        if (tipo === "intervalo") return;
        const etiqueta = tipoSerieSiguiente(ej);
        const t0 = transcurridoMs();
        let serie: SerieSesion;
        if (tipo === "peso") {
            const escritas = aNumero(inReps[iSet]?.value);
            if (escritas == null && etiqueta === "fallo") {

                toast("✏️ Escribe las repeticiones que has hecho en esta serie.", false);
                return;
            }
            const reps = escritas ?? repsObjetivoDe(ej.objetivo) ?? null;
            const peso = pesoAKg(inPeso[iSet]?.value) ?? ej.objetivo.pesoObjetivo ?? null;
            serie = { reps, peso, t: t0 };
        } else {
            const cronometradaConPeso = tipo === "tiempo" && ej.objetivo.repsPesoDuranteTiempo === true;
            const dur = hold?.ej === idx
                ? Math.floor(hold.ms / 1000)
                : aNumero(inDuracion[iSet]?.value) ?? ej.objetivo.duracionObjetivo ?? null;
            if (dur == null || dur <= 0) {
                toast(hold ? "⏳ Hold demasiado corto: no se registra."
                           : "✏️ Escribe los segundos mantenidos (o usa el cronómetro).", false);
                if (hold) cancelarHold();
                return;
            }
            if (cronometradaConPeso) {
                const reps = aNumero(inReps[iSet]?.value);
                if (reps == null) {
                    toast("✏️ Escribe las repeticiones realizadas durante el tiempo.", false);
                    return;
                }
                serie = {
                    reps,
                    peso: pesoAKg(inPeso[iSet]?.value) ?? ej.objetivo.pesoObjetivo ?? null,
                    duracionSeg: Math.round(dur),
                    t: t0,
                };
            } else {
                serie = { duracionSeg: Math.round(dur), t: t0 };
            }
        }
        serie.tipoSerie = etiqueta;

        const previa = iSet > 0 ? ej.series[iSet - 1] : null;
        if (previa?.t != null && ejecDesde != null && ejecDesdeEj === idx
            && ejecDesde > previa.t && ejecDesde <= t0) {
            serie.descansoMs = ejecDesde - previa.t;
            serie.ejecMs = t0 - ejecDesde;
        }
        ej.series[iSet] = serie;
        ej.tipoSiguiente = null;
        ejecDesde = null;
        if (hold?.ej === idx) {
            hold = null;
            confirmarCancelarHold = false;
        }
        arrancarDescanso(Number(ej.objetivo.descansoSeg) || 90);
    };

    const saltarSerie = (iSet: number) => {
        if (!iniciada || pausado) return;

        if ((descanso?.restanteMs ?? 0) > 0 && descanso!.ej !== idx) return;
        if (ciclo) return;
        if (hold && hold.ej !== idx) return;
        const ej = defs[idx];
        if (iSet !== ej.series.length) return;

        ej.series[iSet] = { saltada: true, t: transcurridoMs(), tipoSerie: tipoSerieSiguiente(ej) };
        ej.tipoSiguiente = null;
        ejecDesde = null;
        descanso = null;
        if (hold?.ej === idx) {
            hold = null;
            confirmarCancelarHold = false;
        }
        pintarEjercicio();
    };

    const deshacerSerie = (iSet: number) => {
        const ej = defs[idx];

        if (hold?.ej === idx || ciclo?.ej === idx) return;
        const eraUltima = iSet === ej.series.length - 1;
        const etiqueta = ej.series[iSet]?.tipoSerie ?? null;
        ej.series.splice(iSet, 1);

        if (eraUltima) ej.tipoSiguiente = etiqueta;

        if (iSet >= ej.planOrigen) ej.plan = Math.max(ej.planOrigen, ej.plan - 1, ej.series.length);
        if (descanso && descanso.ej === idx) descanso = null;
        if (ejecDesdeEj === idx) ejecDesde = null;
        pintarEjercicio();
    };

    const irAEjercicio = (n: number) => {

        if (descanso && descanso.restanteMs <= 0) descanso = null;
        idx = n;
        if (iniciada && defs[idx]?.objetivo.tipoBloqueEspecial && !defs[idx].series.length)
            defs[idx].inicioBloqueMs ??= transcurridoMs();
        tipoSerieAbierto = null;
        inReps = []; inPeso = []; inDuracion = [];
        pintarEjercicio();
    };
    const siguiente = (): void => {
        if (idx + 1 >= defs.length) {
            void terminar();
            return;
        }
        irAEjercicio(idx + 1);
    };
    const completarBloqueEspecial = (): void => {
        const ej = defs[idx];
        if (!ej?.objetivo.tipoBloqueEspecial || ej.series.length || !iniciada || pausado) return;
        const ahora = transcurridoMs();
        const duracion = Math.floor((ahora - (ej.inicioBloqueMs ?? ahora)) / 1000);
        if (duracion < 1) {
            toast("⏱ Espera al menos un segundo antes de marcarlo como hecho.", false);
            return;
        }
        ej.series = [{ duracionSeg: duracion, t: ahora }];
        ej.inicioBloqueMs = undefined;
        siguiente();
    };

    const crearBloqueLibre = (tipoBloque: TipoBloqueEspecial): DefSesion => ({
        id: `bloque-libre:${tipoBloque}`,
        nombre: nombreBloqueEspecial(tipoBloque),
        objetivo: {
            series: 1,
            repsObjetivo: null,
            pesoObjetivo: null,
            descansoSeg: null,
            notas: "",
            tipoEjercicio: "tiempo",
            tipoBloqueEspecial: tipoBloque,
            tipoSerie: null,
            duracionObjetivo: null,
            repsPesoDuranteTiempo: false,
            trabajoSeg: null,
            transicionSeg: null,
        },
        plan: 1,
        planOrigen: 1,
        series: [],
        notas: "",
    });

    const agregarBloqueLibre = (tipoBloque: TipoBloqueEspecial, noUltimo: boolean): void => {
        if (!esLibre(rutina) || defs.some(d => d.objetivo.tipoBloqueEspecial === tipoBloque)) return;
        if (tipoBloque === "calentamiento") {
            if (iniciada || defs.some(d => d.series.length > 0)) return;
            const ejercicioActual = defs[idx];
            defs.unshift(crearBloqueLibre(tipoBloque));
            idx = ejercicioActual ? idx + 1 : 0;
        } else {
            if (noUltimo) return;
            const actual = defs[idx];
            const sinTerminar = actual ? actual.series.length < actual.plan : false;
            defs.push(crearBloqueLibre(tipoBloque));
            if (!sinTerminar) {
                if (descanso && descanso.ej === idx) descanso = null;
                if (ejecDesdeEj === idx) ejecDesde = null;
                idx = defs.length - 1;
                tipoSerieAbierto = null;
                inReps = []; inPeso = []; inDuracion = [];
            }
        }
        pintarEjercicio();
    };

    const anadirEjercicioBoton = (): HTMLDivElement => {
        const filaAnadir = el("div", "gym-modo-anadir");
        const b = el("button", "gym-btn-g", "＋ Añadir ejercicio");
        b.type = "button";
        const noUltimo = defs.length > 0 && idx < defs.length - 1
            && !(esLibre(rutina) && !iniciada);
        if (noUltimo) {
            b.disabled = true;
            b.title = "Solo se pueden añadir ejercicios desde el último: avanza (⏭ siguiente) hasta llegar a él";
        } else {
            b.title = "Añadir otro ejercicio a esta sesión: cada variante cuenta aparte en el historial";
        }
        b.onclick = async () => {
            if (noUltimo) return;
            const opcionesBloques = esLibre(rutina) ? [
                {
                    tipoBloqueEspecial: "calentamiento" as const,
                    deshabilitada: iniciada || defs.some(d =>
                        d.objetivo.tipoBloqueEspecial === "calentamiento" || d.series.length > 0),
                    ayuda: iniciada
                        ? "El Calentamiento solo se puede añadir antes de iniciar la sesión"
                        : "Añadir Calentamiento al principio de la sesión",
                },
                {
                    tipoBloqueEspecial: "estiramiento" as const,
                    deshabilitada: noUltimo || defs.some(d =>
                        d.objetivo.tipoBloqueEspecial === "estiramiento"),
                    ayuda: noUltimo
                        ? "Avanza hasta el último elemento para añadir Estiramiento al final"
                        : "Añadir Estiramiento al final de la sesión",
                },
            ].filter(opcion => !defs.some(d =>
                d.objetivo.tipoBloqueEspecial === opcion.tipoBloqueEspecial)) : [];
            const r = await elegirEjercicio(rutina, {
                excluir: defs.map(d => d.id),
                bloquesEspeciales: opcionesBloques,
            });
            if (!r) return;
            if ("tipoBloqueEspecial" in r) {
                agregarBloqueLibre(r.tipoBloqueEspecial, noUltimo);
                return;
            }
            const u = ultimosValores(rutina, r.id);
            const plan0 = esLibre(rutina) ? 1 : Math.max(1, Math.min(10, Number(u?.series) || 3));
            const actual = defs[idx];
            const sinTerminar = actual ? actual.series.length < actual.plan : false;

            const enPlan = enPlanDe(rutina, r.id);

            const tipoIni = enPlan ? enPlan.tipoEjercicio ?? null : u?.tipoEjercicio ?? null;
            const nuevo: DefSesion = {
                id: r.id, nombre: r.nombre,

                objetivo: {
                    series: plan0,
                    repsObjetivo: tipoIni == null || tipoIni === "peso" ? u?.reps ?? null : null,
                    pesoObjetivo: tipoIni == null || tipoIni === "peso" ? u?.peso ?? null
                        : tipoIni === "tiempo" && enPlan?.repsPesoDuranteTiempo
                            ? enPlan.pesoObjetivo ?? null : null,

                    tipoSerie: tipoSerieDeRutina(rutina, r.id),
                    descansoSeg: r.descansoSeg > 0 || tipoIni === "intervalo" ? Math.round(r.descansoSeg) : 90,
                    notas: "",
                    tipoEjercicio: tipoIni,
                    duracionObjetivo: enPlan?.duracionObjetivo ?? null,
                    repsPesoDuranteTiempo: tipoIni === "tiempo" && enPlan?.repsPesoDuranteTiempo === true,
                    trabajoSeg: enPlan?.trabajoSeg ?? null,
                    transicionSeg: enPlan?.transicionSeg ?? null,
                },
                plan: plan0, planOrigen: plan0,
                series: [], notas: "",
            };
            const indiceEstiramiento = defs.findIndex(d =>
                d.objetivo.tipoBloqueEspecial === "estiramiento");
            const indiceInsercion = indiceEstiramiento >= 0 ? indiceEstiramiento : defs.length;
            defs.splice(indiceInsercion, 0, nuevo);
            const indiceActual = actual ? defs.indexOf(actual) : -1;
            if (sinTerminar && actual?.objetivo.tipoBloqueEspecial !== "estiramiento") {
                if (indiceActual >= 0) idx = indiceActual;

                toast(`＋ ${r.nombre} añadido: tocará cuando termines «${actual.nombre}»`);
            } else {
                if (descanso && descanso.ej === idx) descanso = null;
                if (ejecDesdeEj === idx) ejecDesde = null;
                idx = indiceInsercion;
                tipoSerieAbierto = null;
                inReps = []; inPeso = []; inDuracion = [];
                toast(`＋ ${r.nombre} añadido a la sesión`);
            }
            pintarEjercicio();
        };
        filaAnadir.appendChild(b);

        if (esLibre(rutina)) {
            if (!defs.some(d => d.objetivo.tipoBloqueEspecial === "calentamiento")) {
                const bCalentamiento = el("button", "gym-btn-g gym-btn-bloque-especial", "＋ Calentamiento");
                bCalentamiento.type = "button";
                bCalentamiento.title = "Añadir calentamiento al principio antes de iniciar la sesión";
                bCalentamiento.disabled = iniciada || defs.some(d => d.series.length > 0);
                bCalentamiento.onclick = () => {
                    if (bCalentamiento.disabled) return;
                    agregarBloqueLibre("calentamiento", noUltimo);
                };
                filaAnadir.appendChild(bCalentamiento);
            }

            if (!defs.some(d => d.objetivo.tipoBloqueEspecial === "estiramiento")) {
                const bEstiramiento = el("button", "gym-btn-g gym-btn-bloque-especial", "＋ Estiramiento");
                bEstiramiento.type = "button";
                bEstiramiento.title = "Añadir estiramiento al final de la sesión";
                bEstiramiento.disabled = noUltimo;
                bEstiramiento.onclick = () => {
                    if (bEstiramiento.disabled) return;
                    agregarBloqueLibre("estiramiento", noUltimo);
                };
                filaAnadir.appendChild(bEstiramiento);
            }
        }
        return filaAnadir;
    };

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
        pasosProgreso.setAttribute("aria-label", `Progreso de bloques y ejercicios: ${idx + 1} de ${defs.length}`);
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
            paso.className = `gym-modo-paso${def.objetivo.tipoBloqueEspecial ? " especial" : ""} ${estado}`;
            paso.title = `${def.nombre}: ${descripcion}`;
            paso.setAttribute("aria-label", `${def.nombre}: ${descripcion}`);
            if (i === idx) paso.setAttribute("aria-current", "step");
            else paso.removeAttribute("aria-current");
        });
    };

    const pintarEjercicio = () => {
        const ej = defs[idx];
        const indicePendiente = indiceEjercicioPendiente();
        pintarProgreso();
        relojEl.textContent = `⏱ ${relojTexto(transcurridoMs())}`;

        const prev: Partial<Record<number, { reps: string; peso: string; duracion: string }>> = {};
        inReps.forEach((inp, i) => {
            if (inp || inPeso[i] || inDuracion[i]) {
                prev[i] = {
                    reps: inp?.value ?? "",
                    peso: inPeso[i]?.value ?? "",
                    duracion: inDuracion[i]?.value ?? "",
                };
            }
        });
        inReps = []; inPeso = []; inDuracion = [];
        contEj.empty();
        lecturaBloque = null;

        pie.style.display = defs.length ? "" : "none";
        if (!ej) {
            contEj.appendChild(el("div", "gym-et", "Sesión libre"));
            contEj.appendChild(el("div", "gym-modo-ej", "Añade tu primer ejercicio"));
            contEj.appendChild(el("div", "font-size:.92em;opacity:.8;line-height:1.5;",
                "Aquí no hay plan previo: elige o escribe lo que vas a hacer y registra cada serie " +
                "con sus repeticiones y su peso. Puedes alternar variantes de un día para otro."));

            if (esLibre(rutina)) {
                const cNombre = el("div", "gym-fila");
                cNombre.appendChild(el("div", "gym-et", "Nombre del día"));
                const inNombre = el("input");
                inNombre.type = "text";
                inNombre.value = dia.nombre;
                inNombre.placeholder = "Sesión libre";
                inNombre.setAttribute("aria-label", "Nombre del día");

                inNombre.style.cssText = "box-sizing:border-box;width:100%;height:34px;min-height:34px;padding:4px 8px;border-radius:8px;" +
                    "font-size:1em;border:1px solid var(--background-modifier-border);" +
                    "background:var(--background-secondary);color:var(--text-normal);";
                inNombre.oninput = () => aplicarNombreDia(inNombre.value);
                cNombre.appendChild(inNombre);
                contEj.appendChild(cNombre);
            }
            const bAnadir0 = anadirEjercicioBoton();
            bAnadir0.classList.add("gym-btn-anadir0");
            contEj.appendChild(bAnadir0);
            barraAccion.replaceChildren();
            bVolver.disabled = true;
            return;
        }

        if (ej.objetivo.tipoBloqueEspecial) {
            const tipoBloque = ej.objetivo.tipoBloqueEspecial;
            contEj.appendChild(el("div", "gym-modo-seccion gym-modo-bloque-especial",
                nombreBloqueEspecial(tipoBloque)));
            const bloqueOmitido = Boolean(ej.series[0]?.saltada);
            const tiempoRegistrado = bloqueOmitido ? undefined : ej.series[0]?.duracionSeg;
            const inicioBloque = ej.inicioBloqueMs ?? transcurridoMs();
            lecturaBloque = el("div", "gym-modo-bloque-tiempo",
                bloqueOmitido ? "⏭ Saltado"
                    : tiempoRegistrado != null ? `⏱ ${relojTexto(tiempoRegistrado * 1000)}`
                        : `⏱ ${relojTexto(Math.max(0, transcurridoMs() - inicioBloque))}`);

            const filaBloque = el("div", `gym-modo-set especial${bloqueOmitido ? " saltada" : tiempoRegistrado != null ? " hecha" : " actual"}`);
            const celdaNumero = el("div", "gym-modo-numero");
            celdaNumero.appendChild(el("div", "n", "1"));
            const tipoBloqueIndicador = el("span", "gym-modo-set-tipo gym-modo-set-especial-tipo",
                tipoBloque === "calentamiento" ? "C" : "E");
            tipoBloqueIndicador.title = nombreBloqueEspecial(tipoBloque);
            tipoBloqueIndicador.setAttribute("aria-label", nombreBloqueEspecial(tipoBloque));
            celdaNumero.appendChild(tipoBloqueIndicador);
            filaBloque.appendChild(celdaNumero);
            lecturaBloque.classList.add("gym-modo-set-valor", "gym-modo-bloque-tiempo");
            filaBloque.appendChild(lecturaBloque);

            const accionesBloque = el("div", "cierre");
            const bHecho = el("button", "gym-btn-g verde", "✔");
            bHecho.type = "button";
            bHecho.title = "Registrar la duración del bloque";
            bHecho.disabled = !iniciada || pausado || tiempoRegistrado != null || bloqueOmitido;
            bHecho.onclick = () => completarBloqueEspecial();
            const bSaltarBloque = el("button", "gym-btn-g", "⏭");
            bSaltarBloque.type = "button";
            bSaltarBloque.title = "Saltar bloque";
            bSaltarBloque.disabled = !iniciada || pausado || ej.series.length > 0;
            bSaltarBloque.onclick = () => bSaltar.click();
            accionesBloque.append(bHecho, bSaltarBloque);
            filaBloque.appendChild(accionesBloque);
            if (esLibre(rutina)) {
                const filaExtras = el("div", "display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px;");
                filaExtras.classList.add("gym-modo-acciones-series");
                filaExtras.appendChild(anadirEjercicioBoton());
                contEj.append(filaBloque, filaExtras);
            } else {
                contEj.appendChild(filaBloque);
            }
            bSaltar.textContent = "⏭ Saltar bloque";
            bSaltar.disabled = !iniciada || pausado || ej.series.length > 0;

            if (!iniciada) {
                btnAccion = el("button", "gym-btn-g gym-btn-accion primario", "▶ Iniciar sesión");
                btnAccion.onclick = () => iniciar();
            } else if (pausado) {
                btnAccion = el("button", "gym-btn-g gym-btn-accion pausa", "⏸ EN PAUSA — pulsa para continuar");
                btnAccion.onclick = () => btnPausa.click();
            } else if (tiempoRegistrado != null || bloqueOmitido) {
                const texto = idx + 1 >= defs.length ? "🏁 Terminar" : "⏭ Siguiente ejercicio";
                btnAccion = el("button", "gym-btn-g gym-btn-accion verde", texto);
                btnAccion.onclick = () => { void siguiente(); };
            } else {
                btnAccion = el("button", "gym-btn-g gym-btn-accion primario", "✔ Hecho");
                btnAccion.onclick = () => completarBloqueEspecial();
            }
            btnAccion.type = "button";
            barraAccion.replaceChildren();
            barraAccion.classList.remove("descansando");
            if (iniciada && !pausado) barraAccion.appendChild(btnPausa);
            barraAccion.appendChild(btnAccion);
            bVolver.disabled = idx === 0;
            bSiguiente.disabled = (iniciada && tiempoRegistrado == null && !bloqueOmitido)
                || idx >= defs.length - 1;
            return;
        }

        const cabeceraEj = el("div", "gym-modo-ej-cab");
        cabeceraEj.appendChild(el("div", "gym-modo-ej", ej.nombre));
        const cMeta = el("div", "gym-modo-ej-meta");
        const tipo = tipoEjercicioDe(ej.objetivo);
        const controlesIntervalo = tipo === "intervalo"
            ? el("div", "gym-modo-intervalo-controles")
            : null;
        if (controlesIntervalo) cMeta.classList.add("gym-modo-ej-meta-intervalo");

        let meta: string;
        if (tipo === "peso") {

            const repsTxt = textoRepsObjetivo(ej.objetivo);
            const fallo = tipoSerieDe(ej.objetivo) === "fallo";
            meta = `${ej.plan} × ${fallo ? repsTxt : `${repsTxt} reps`} @ ${ej.objetivo.pesoObjetivo != null ? pesoTexto(ej.objetivo.pesoObjetivo) : "sin peso"}`;
        } else if (tipo === "tiempo") {
            const dur = Math.round(Number(ej.objetivo.duracionObjetivo) || 0);
            meta = ej.objetivo.repsPesoDuranteTiempo
                ? `${ej.plan} × reps y peso${dur > 0 ? ` durante ${dur} s` : ""}`
                : `${ej.plan} × hold${dur > 0 ? ` de ${dur} s` : ""}`;
        } else {
            const trab = Math.round(Number(ej.objetivo.trabajoSeg) || 0);
            meta = `${ej.plan} ciclos × ${trab} s de trabajo`;
        }
        cMeta.appendChild(el("span", "", meta));

        const dSeg = tipo === "intervalo"
            ? Math.max(0, Math.round(Number(ej.objetivo.transicionSeg ?? ej.objetivo.descansoSeg) || 0))
            : Number(ej.objetivo.descansoSeg) || 90;
        const bDesc = el("button", "", tipo === "intervalo" ? `Descanso ${dSeg} s` : ` · descanso ${dSeg} s`);
        bDesc.type = "button";
        bDesc.title = tipo === "intervalo" ? "Tocar para cambiar el descanso entre ciclos"
                                           : "Tocar para cambiar el descanso entre series";

        const estiloEnlace = "font-size:1em;font-family:inherit;background:none;border:none;" +
            "padding:0 2px;cursor:pointer;color:inherit;opacity:.9;text-decoration:underline dotted;";
        bDesc.style.cssText = estiloEnlace;
        bDesc.onclick = async () => {
            const v = await pedirDescanso(dSeg);
            if (v == null) return;
            if (tipo === "intervalo") ej.objetivo.transicionSeg = Math.max(0, Math.round(v));
            else ej.objetivo.descansoSeg = v > 0 ? Math.round(v) : 90;
            pintarEjercicio();
        };
        (controlesIntervalo ?? cMeta).appendChild(bDesc);

        if (tipo === "intervalo" && !enPlanDe(rutina, ej.id)) {
            const trab = Math.round(Number(ej.objetivo.trabajoSeg) || 0);
            const trans = Math.round(Number(ej.objetivo.transicionSeg) || 0);
            const bCiclo = el("button", "", `Ciclo ${trab > 0 ? `${trab} s` : "＋"}`);
            bCiclo.type = "button";
            bCiclo.title = `Tocar para fijar los ciclos: trabajo${trans > 0 ? ` y descanso (${trans} s)` : ""}`;
            bCiclo.style.cssText = estiloEnlace;
            bCiclo.onclick = async () => {
                const v = await pedirCiclo(
                    ej.objetivo.trabajoSeg ?? null,
                    ej.objetivo.transicionSeg ?? ej.objetivo.descansoSeg ?? null,
                );
                if (v == null) return;
                ej.objetivo.trabajoSeg = v.trabajo > 0 ? Math.round(v.trabajo) : null;
                ej.objetivo.transicionSeg = Math.max(0, Math.round(v.transicion));
                pintarEjercicio();
            };
            controlesIntervalo?.appendChild(bCiclo);
        }

        const selTipo = el("select");
        for (const [v, t] of [["", "Trabajo"], ["calentamiento", "Calentamiento"], ["descenso", "Descenso"], ["fallo", "Fallo"]] as const) {
            const o = el("option", null, t); o.value = v; selTipo.appendChild(o);
        }
        selTipo.value = ej.objetivo.tipoSerie ?? "";
        selTipo.title = "Tipo de serie del plan: cómo se leen las reps (en «fallo» se anotan al fallo, sin número objetivo).";
        selTipo.style.cssText = "font-size:.95em;font-family:inherit;background:var(--background-secondary);" +
            "border:1px solid var(--background-modifier-border);border-radius:6px;padding:1px 5px;" +
            `cursor:pointer;color:inherit;margin-left:${controlesIntervalo ? "0" : "6px"};max-width:140px;`;
        selTipo.onchange = () => {
            const v = selTipo.value;
            ej.objetivo.tipoSerie = v === "calentamiento" || v === "descenso" || v === "fallo" ? v : null;

            inReps.forEach(i => { if (i) i.value = ""; });
            pintarEjercicio();
        };
        (controlesIntervalo ?? cMeta).appendChild(selTipo);

        if (!enPlanDe(rutina, ej.id)) {
            const selTipoEj = el("select", "font-size:.95em;font-family:inherit;background:var(--background-secondary);" +
                "border:1px solid var(--background-modifier-border);border-radius:6px;padding:1px 5px;" +
                `cursor:pointer;color:inherit;margin-left:${controlesIntervalo ? "0" : "6px"};max-width:120px;`);
            for (const [v, t] of [["peso", "Peso"], ["tiempo", "Tiempo"], ["intervalo", "Intervalo"]] as const) {
                const o = el("option", null, t); o.value = v; selTipoEj.appendChild(o);
            }
            selTipoEj.value = tipo;

            const bloqueado = hold?.ej === idx || ciclo?.ej === idx;
            selTipoEj.disabled = bloqueado;
            selTipoEj.title = bloqueado
                ? "Termina o cancela el hold o el ciclo en marcha para cambiar el tipo"
                : "Tipo de ejercicio: reps y peso, hold por tiempo o ciclos de intervalo.";
            selTipoEj.onchange = () => {
                const v = selTipoEj.value === "tiempo" || selTipoEj.value === "intervalo" ? selTipoEj.value : "peso";
                ej.objetivo.tipoEjercicio = v;
                ej.objetivo.repsPesoDuranteTiempo = false;

                ej.objetivo.repsObjetivo = null;
                ej.objetivo.pesoObjetivo = null;
                ej.objetivo.duracionObjetivo = null;
                ej.objetivo.trabajoSeg = null;
                ej.objetivo.transicionSeg = null;
                inReps.forEach(i => { if (i) i.value = ""; });
                inPeso.forEach(i => { if (i) i.value = ""; });
                pintarEjercicio();
            };
            (controlesIntervalo ?? cMeta).appendChild(selTipoEj);
        }
        cabeceraEj.appendChild(cMeta);
        contEj.appendChild(cabeceraEj);
        if (controlesIntervalo) contEj.appendChild(controlesIntervalo);
        if (ej.objetivo.notas) contEj.appendChild(el("div", "font-size:.82em;opacity:.65;font-style:italic;", `💡 ${ej.objetivo.notas}`));
        if (ej.notas) contEj.appendChild(el("div", "font-size:.85em;margin-top:4px;", `📝 ${esc(ej.notas)}`));

        const zonaTemporizador = el("div", "gym-modo-temporizador");

        cajaDescanso = null; tDescanso = null; barraDescanso = null;
        cajaCiclo = null; tCiclo = null; barraCiclo = null;
        cajaHold = null; tHold = null; valorHold = null; barraHold = null; diferenciaHold = null;
        if (descanso) {
            cajaDescanso = el("div", "gym-descanso gym-descanso-compacto");
            tDescanso = el("div", "t");
            const barraDescansoWrap = el("div", "gym-descanso-barra");
            barraDescanso = el("div", `height:100%;width:100%;background:${CONFIG.NARANJA};`);
            barraDescansoWrap.appendChild(barraDescanso);
            const fDesc = el("div", "gym-descanso-controles");
            const tituloDescanso = el("div", "gym-et", "⏳ Descanso");
            const centroDescanso = el("div", "gym-descanso-centro");
            centroDescanso.append(tituloDescanso, tDescanso);
            const bMenos = el("button", "gym-btn-g", "−15 s"); bMenos.type = "button";
            bMenos.title = "Restar 15 segundos al descanso";
            if ((descanso?.restanteMs ?? 0) <= 0) bMenos.disabled = true;
            bMenos.onclick = () => {
                if (!descanso) return;
                descanso.restanteMs = Math.max(0, descanso.restanteMs - 15000);

                if (descanso.restanteMs <= 0) finDescanso();
                else pintarDescanso();
            };
            const bMas = el("button", "gym-btn-g", "＋15 s"); bMas.type = "button";
            bMas.title = "Añadir 15 segundos al descanso";
            bMas.onclick = () => { descanso!.restanteMs += 15000; descanso!.totalMs = Math.max(descanso!.totalMs, descanso!.restanteMs); pintarDescanso(); };
            const bSaltar = el("button", "gym-btn-g verde gym-btn-descanso-saltar", "⏭ Saltar"); bSaltar.type = "button";
            bSaltar.title = "Saltar descanso";
            bSaltar.setAttribute("aria-label", "Saltar descanso");
            bSaltar.onclick = () => {
                finalizarDescanso(descanso?.ej ?? -1);
            };
            fDesc.appendChild(btnPausa);
            fDesc.append(bMenos, centroDescanso, bMas, bSaltar);
            cajaDescanso.appendChild(fDesc);
            cajaDescanso.appendChild(barraDescansoWrap);

            if (descanso.ej !== idx) {
                cajaDescanso.appendChild(el("div", "gym-descanso-propietario",
                    `de «${defs[descanso.ej].nombre}» — aquí solo miras`));
            }
            pintarDescanso();
        } else if (ciclo) {

            const cEj = defs[ciclo.ej];
            const nTotal = Math.max(cEj.plan, cEj.series.length);
            const faseC = ciclo.fase === "trabajo" ? "Trabajo" : "Descanso";
            const cicloPropio = ciclo.ej === idx;
            const serieCiclo = cEj.series[ciclo.n - 1];
            cajaCiclo = el("div", "gym-timer-serie gym-ciclo-inline" + (cicloPropio ? "" : " ajeno"));
            const etiquetaCiclo = el("div", "gym-timer-serie-etiqueta");
            if (ciclo.fase === "descanso" && serieCiclo) {
                etiquetaCiclo.appendChild(el("span", "gym-chip gym-chip-mini",
                    etiquetaTipoSerie(tipoSerieDe(cEj.objetivo, serieCiclo))));
                etiquetaCiclo.append(` ${serieCiclo.duracionSeg ?? ciclo.trabajoSeg} s · ${faseC} ${ciclo.n}/${nTotal}`);
            } else {
                etiquetaCiclo.textContent =
                    `⚡ ${faseC} · ${ciclo.n}/${nTotal} · ${ciclo.trabajoSeg} s`;
            }
            cajaCiclo.appendChild(etiquetaCiclo);
            tCiclo = el("div", "gym-timer-serie-tiempo");
            cajaCiclo.appendChild(tCiclo);
            const barraWrapC = el("div", "gym-timer-serie-barra");
            barraCiclo = el("div", "gym-timer-serie-progreso");
            barraWrapC.appendChild(barraCiclo);
            cajaCiclo.appendChild(barraWrapC);
            const controlC = el("button", "gym-timer-serie-control");
            controlC.type = "button";
            if (ciclo.fase === "trabajo") {
                controlC.textContent = confirmarCancelarCiclo ? "⚠" : "×";
                controlC.title = confirmarCancelarCiclo
                    ? "Toca de nuevo para cancelar el ciclo"
                    : "Cancelar ciclo";
                controlC.setAttribute("aria-label", confirmarCancelarCiclo
                    ? "Confirmar cancelación del ciclo"
                    : "Cancelar ciclo");
                if (confirmarCancelarCiclo) controlC.classList.add("confirmar");
                controlC.onclick = evento => {
                    evento.stopPropagation();
                    if (confirmarCancelarCiclo) {
                        cancelarCiclo();
                        return;
                    }
                    confirmarCancelarCiclo = true;
                    controlC.textContent = "⚠";
                    controlC.title = "Toca de nuevo para cancelar el ciclo";
                    controlC.setAttribute("aria-label", "Confirmar cancelación del ciclo");
                    controlC.classList.add("confirmar");
                };
            } else {
                controlC.textContent = "⏭";
                controlC.title = "Saltar descanso del ciclo";
                controlC.setAttribute("aria-label", controlC.title);
                controlC.onclick = () => saltarDescansoCiclo();
            }
            cajaCiclo.appendChild(controlC);
            if (!cicloPropio) {
                cajaCiclo.appendChild(el("div", "gym-ciclo-ajeno-texto", `de «${cEj.nombre}» · aquí solo miras`));
                zonaTemporizador.appendChild(cajaCiclo);
            }
            pintarCiclo();
        } else if (hold) {

            const hEj = defs[hold.ej];
            const objH = Math.max(0, Math.round(Number(hEj.objetivo.duracionObjetivo) || 0));
            cajaHold = el("div", "gym-timer-serie");
            const etiquetaHold = el("div", "gym-timer-serie-etiqueta",
                objH > 0 ? `⏱ Objetivo ${objH} s` : "⏱ Hold");
            tHold = el("div", "gym-timer-serie-tiempo gym-hold-lectura");
            valorHold = el("span", "gym-hold-valor");
            tHold.appendChild(valorHold);
            if (objH > 0) {
                diferenciaHold = el("span", "gym-hold-diferencia");
                tHold.appendChild(diferenciaHold);
            }
            cajaHold.appendChild(etiquetaHold);
            cajaHold.appendChild(tHold);
            if (objH > 0) {
                const barraWrapH = el("div", "gym-timer-serie-barra");
                barraHold = el("div", "gym-timer-serie-progreso");
                barraWrapH.appendChild(barraHold);
                cajaHold.appendChild(barraWrapH);
            }
            const bCancelH = el("button", "gym-timer-serie-control", confirmarCancelarHold ? "⚠" : "×");
            bCancelH.type = "button";
            if (confirmarCancelarHold) bCancelH.classList.add("confirmar");
            bCancelH.title = confirmarCancelarHold ? "Toca de nuevo para descartar el hold" : "Cancelar hold";
            bCancelH.setAttribute("aria-label", confirmarCancelarHold ? "Confirmar cancelación del hold" : "Cancelar hold");
            bCancelH.onclick = evento => {
                evento.stopPropagation();
                if (confirmarCancelarHold) {
                    cancelarHold();
                    return;
                }
                confirmarCancelarHold = true;
                bCancelH.textContent = "⚠";
                bCancelH.title = "Toca de nuevo para descartar el hold";
                bCancelH.setAttribute("aria-label", "Confirmar cancelación del hold");
                bCancelH.classList.add("confirmar");
            };
            cajaHold.appendChild(bCancelH);
            if (hold.ej !== idx) {
                zonaTemporizador.appendChild(el("div", "gym-hold-ajeno",
                    `⏱ Hold activo en «${hEj.nombre}» · ${relojTexto(hold.ms)}`));
            }
            pintarHold();
        }

        contEj.appendChild(el("div", "gym-modo-seccion", tipo === "intervalo" ? "Ciclos" : "Series"));
        const total = Math.max(ej.plan, ej.series.length);
        const recordes = recordesDeSesion();
        for (let i = 0; i < total; i++) {
            const registrada = i < ej.series.length;
            const s: SerieSesion | null = ej.series[i] ?? null;
            let logrosSerie: RecordeDetectado[] = [];
            let botonLogros: HTMLButtonElement | null = null;
            const saltada = Boolean(s?.saltada);
            const esActual = i === ej.series.length;
            const esExtra = !esLibre(rutina) && i >= ej.planOrigen;
            const fila = el("div", "gym-modo-set" + (saltada ? " saltada" : registrada ? " hecha" : esActual ? " actual" : "") + (esExtra ? " extra" : ""));
            const celdaNumero = el("div", "gym-modo-numero");
            const cN = el("div", "n");
            if (esExtra) {
                cN.append(String(i + 1), el("span", "ext", "extra"));
                fila.title = "Serie extra — fuera del plan";
            } else cN.textContent = String(i + 1);
            celdaNumero.appendChild(cN);
            if (registrada && s) {
                const tipoRegistrado = tipoSerieDe(ej.objetivo, s);
                const indicadorTipo = el("span", "gym-modo-set-tipo", letraTipoSerie(tipoRegistrado));
                indicadorTipo.title = `Tipo de serie: ${etiquetaTipoSerie(tipoRegistrado)}`;
                indicadorTipo.setAttribute("aria-label", indicadorTipo.title);
                celdaNumero.appendChild(indicadorTipo);
            }
            fila.appendChild(celdaNumero);
            if (saltada) {
                const txtS = el("div", "gym-modo-set-valor gym-modo-set-saltada");
                txtS.textContent = "⏭ Saltada";
                fila.appendChild(txtS);
                fila.appendChild(el("div"));
                const cierreS = el("div", "cierre");
                const bUndoS = el("button", "gym-btn-g", "↩"); bUndoS.type = "button";
                bUndoS.title = "Rehacer: vuelve a estar pendiente";
                bUndoS.onclick = () => deshacerSerie(i);
                cierreS.appendChild(bUndoS);
                fila.appendChild(cierreS);
            } else if (registrada) {

                const tipoRegistro = tipoEjercicioDe(ej.objetivo);
                const cronometradaConPeso = tipoRegistro === "tiempo"
                    && ej.objetivo.repsPesoDuranteTiempo;
                const txt = el("div", "gym-modo-set-valor");
                const detalleSerie = cronometradaConPeso
                    ? `${s.reps ?? "–"} reps · ${s.duracionSeg ?? "–"} s`
                    : s.duracionSeg != null ? `${s.duracionSeg} s`
                        : `${s.reps ?? "–"} reps`;
                txt.textContent = detalleSerie;
                const cicloEnDescanso = tipoRegistro === "intervalo"
                    && ciclo?.fase === "descanso" && ciclo.ej === idx && ciclo.n === i + 1;
                if (cicloEnDescanso) {
                    fila.appendChild(cajaCiclo ?? el("div"));
                    fila.appendChild(el("div"));
                } else {
                    fila.appendChild(txt);
                    fila.appendChild(tipoRegistro === "peso" || cronometradaConPeso
                        ? el("div", "gym-modo-set-peso gym-modo-set-valor",
                            s.peso != null ? pesoACampo(s.peso) : "–")
                        : el("div"));
                }
                logrosSerie = recordes.filter(r => r.indiceEjercicio === idx && r.indiceSerie === i);
                if (logrosSerie.length) {
                    const abierto = logrosAbiertos === i;
                    botonLogros = el("button", "gym-modo-logros-btn", "🏆");
                    botonLogros.type = "button";
                    botonLogros.dataset.serie = String(i);
                    botonLogros.setAttribute("aria-expanded", String(abierto));
                    botonLogros.setAttribute("aria-controls", `gym-modo-logros-${idx}-${i}`);
                    const nombreLogros = `${logrosSerie.length} logro${logrosSerie.length === 1 ? "" : "s"}`;
                    botonLogros.title = abierto ? `Ocultar ${nombreLogros}` : `Ver ${nombreLogros}`;
                    botonLogros.setAttribute("aria-label", botonLogros.title);
                    botonLogros.onclick = () => {
                        logrosAbiertos = abierto ? null : i;
                        pintarEjercicio();
                        contEj.querySelector<HTMLButtonElement>(`.gym-modo-logros-btn[data-serie="${i}"]`)?.focus();
                    };
                }
                const cierre = el("div", "cierre");
                if (botonLogros) cierre.appendChild(botonLogros);
                const bUndo = el("button", "gym-btn-g", "↩"); bUndo.type = "button"; bUndo.title = "Deshacer serie";
                bUndo.onclick = () => deshacerSerie(i);
                cierre.appendChild(bUndo);
                fila.appendChild(cierre);
            } else {
                const tipoF = tipoEjercicioDe(ej.objetivo);
                const etFila = tipoSerieSiguiente(ej);
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

                if (tipoF !== "intervalo") {
                    const p = prev[i];
                    const cronometradaConPeso = tipoF === "tiempo" && ej.objetivo.repsPesoDuranteTiempo === true;
                    let iR: HTMLInputElement | undefined;
                    let iP: HTMLInputElement | undefined;
                    let iD: HTMLInputElement | undefined;
                    if (tipoF === "peso" || cronometradaConPeso) {
                        iR = el("input", "min-width:0;"); iR.type = "number"; iR.inputMode = "numeric"; iR.min = "0";
                        iR.placeholder = "Reps";
                        iR.value = (p && p.reps !== "") ? p.reps
                            : tipoF === "peso" && etFila !== "fallo"
                                ? String(repsObjetivoDe(ej.objetivo) ?? "") : "";
                        inReps[i] = iR;
                        iP = el("input", "min-width:0;"); iP.type = "number"; iP.inputMode = "decimal"; iP.min = "0"; iP.step = "0.5";
                        iP.value = (p && p.peso !== "") ? p.peso : pesoACampo(ej.objetivo.pesoObjetivo);
                        inPeso[i] = iP;
                    }
                    if (tipoF === "tiempo") {
                        iD = el("input"); iD.type = "number"; iD.inputMode = "numeric"; iD.min = "0";
                        iD.placeholder = "Seg";
                        const objT = Math.round(Number(ej.objetivo.duracionObjetivo) || 0);
                        iD.value = (p && p.duracion !== "") ? p.duracion : (objT > 0 ? String(objT) : "");
                        inDuracion[i] = iD;
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
                        : indicePendiente >= 0 && indicePendiente !== idx
                            ? `Ir a «${defs[indicePendiente].nombre}» y completar la serie que toca`
                        : "Completar esta serie";
                    bOk.disabled = !esActual || !iniciada || pausado || enDescansoPend || cicloActivo || holdAjeno;
                    bOk.onclick = () => completarSerie(i);
                    cierreF.appendChild(bOk);
                    cierreF.appendChild(bSaltar);
                    if (cronometradaConPeso && iR && iP && iD) {
                        const grupo = el("div", "display:flex;gap:4px;min-width:0;");
                        grupo.append(iR, iP);
                        fila.appendChild(grupo);
                        fila.appendChild(hold?.ej === idx && esActual ? cajaHold ?? el("div") : iD);
                    } else if (tipoF === "tiempo" && iD) {
                        fila.appendChild(hold?.ej === idx && esActual ? cajaHold ?? el("div") : iD);
                        fila.appendChild(el("div"));
                    } else if (iR) {
                        fila.appendChild(iR);
                        fila.appendChild(iP ?? el("div"));
                    } else {
                        fila.appendChild(el("div"));
                        fila.appendChild(el("div"));
                    }
                } else {

                    const trabF = Math.max(0, Math.round(Number(ej.objetivo.trabajoSeg) || 0));
                    const transF = Math.max(0, Math.round(Number(ej.objetivo.transicionSeg) || 0));
                    const descF = Math.max(0, Math.round(Number(ej.objetivo.descansoSeg) || 0));
                    const esUltimo = i + 1 >= ej.plan;
                    const descansoF = ej.objetivo.transicionSeg != null ? transF : descF;
                    const restoF = esUltimo ? "último ciclo" : `${descansoF} s de descanso`;
                    if (ciclo?.fase === "trabajo" && ciclo.ej === idx && ciclo.n === i + 1) {
                        fila.appendChild(cajaCiclo ?? el("div"));
                    } else {
                        fila.appendChild(el("div", "font-size:.92em;opacity:.85;", `⏱ ${trabF} s de trabajo`));
                        fila.appendChild(el("div", "font-size:.92em;opacity:.85;", restoF));
                    }
                    cierreF.appendChild(bSaltar);
                }
                fila.appendChild(cierreF);

                if (esActual) {
                    const bTipo = el("button", "gym-modo-tipo-btn", letraTipoSerie(etFila));
                    bTipo.type = "button";
                    bTipo.title = `Tipo de serie: ${etiquetaTipoSerie(etFila)}`;
                    bTipo.setAttribute("aria-label", `Tipo de serie: ${etiquetaTipoSerie(etFila)}. Cambiar`);
                    bTipo.setAttribute("aria-expanded", String(tipoSerieAbierto === i));
                    bTipo.onclick = () => {
                        const abrir = tipoSerieAbierto !== i;
                        tipoSerieAbierto = abrir ? i : null;
                        pintarEjercicio();
                        const destino = abrir
                            ? contEj.querySelector<HTMLButtonElement>(".gym-modo-tipo-opcion")
                            : contEj.querySelector<HTMLButtonElement>(".gym-modo-tipo-btn");
                        destino?.focus();
                    };
                    celdaNumero.appendChild(bTipo);
                    if (tipoSerieAbierto === i) {
                        const filaTipo = el("div", "grid-column:1 / -1;");
                        const opcionesTipo = el("div", "gym-modo-tipos-opciones");
                        opcionesTipo.setAttribute("role", "group");
                        opcionesTipo.setAttribute("aria-label", "Tipo de serie");
                        for (const [valor, etiqueta] of TIPOS_SERIE) {
                            const opcion = el("button",
                                `gym-modo-tipo-opcion${valor === etFila ? " actual" : ""}`,
                                `${letraTipoSerie(valor)} · ${etiqueta}`);
                            opcion.type = "button";
                            opcion.setAttribute("aria-pressed", String(valor === etFila));
                            opcion.onclick = () => {
                                ej.tipoSiguiente = valor;
                                tipoSerieAbierto = null;

                                const inp = tipoF === "peso" ? inReps[ej.series.length] : undefined;
                                const objetivo = repsObjetivoDe(ej.objetivo);
                                if (valor === "fallo" && inp && objetivo != null && inp.value === String(objetivo)) {
                                    inp.value = "";
                                }
                                pintarEjercicio();
                                contEj.querySelector<HTMLButtonElement>(".gym-modo-tipo-btn")?.focus();
                            };
                            opcionesTipo.appendChild(opcion);
                        }
                        filaTipo.appendChild(opcionesTipo);
                        fila.appendChild(filaTipo);
                    }
                }
            }
            if (logrosSerie.length && logrosAbiertos === i) {
                const panelLogros = el("div", "gym-modo-logros-opciones");
                panelLogros.id = `gym-modo-logros-${idx}-${i}`;
                panelLogros.setAttribute("role", "group");
                panelLogros.setAttribute("aria-label", `Logros de la serie ${i + 1}`);
                for (const recorde of logrosSerie) {
                    const nombre = nombreMetricaRecorde(recorde);
                    const detalle = el("div", "gym-modo-logro");
                    detalle.append(
                        el("span", "gym-modo-logro-nombre", `🏆 ${nombre}`),
                        el("b", "gym-modo-logro-valor", valorRecorde(recorde)),
                    );
                    panelLogros.appendChild(detalle);
                }
                fila.appendChild(panelLogros);
            }
            contEj.appendChild(fila);
        }
        const bMasSerie = el("button", "gym-btn-g gym-btn-mini-g", "＋1 serie"); bMasSerie.type = "button";
        bMasSerie.title = esLibre(rutina)
            ? "Añadir una serie a este ejercicio"
            : "Añadir una serie extra a este ejercicio";
        bMasSerie.onclick = () => {
            ej.plan++;
            pintarEjercicio();
        };
        const filaExtras = el("div", "display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px;");
        filaExtras.classList.add("gym-modo-acciones-series");
        filaExtras.appendChild(bMasSerie);
        filaExtras.appendChild(anadirEjercicioBoton());
        const mostrarQuitarSerie = esLibre(rutina) ? ej.plan > 1 : ej.plan > ej.planOrigen;
        if (mostrarQuitarSerie) {
            const bQuitar = el("button", "gym-btn-g gym-btn-mini-g",
                esLibre(rutina) ? "−1 serie" : "↩ Quitar serie extra");
            bQuitar.type = "button";
            if (esLibre(rutina)) {
                const temporizadorActivo = hold?.ej === idx || ciclo?.ej === idx;
                const serieRegistrada = ej.plan <= ej.series.length;
                bQuitar.disabled = temporizadorActivo || serieRegistrada;
                bQuitar.title = temporizadorActivo
                    ? "Termina o cancela el hold o ciclo antes de quitar una serie"
                    : serieRegistrada
                        ? "Deshaz primero la última serie registrada con ↩ y luego podrás quitarla"
                        : "Quitar la última serie pendiente añadida";
                bQuitar.onclick = () => {
                    if (hold?.ej === idx || ciclo?.ej === idx || ej.plan <= ej.series.length) return;
                    ej.plan = Math.max(1, ej.series.length, ej.plan - 1);
                    pintarEjercicio();
                };
            } else {
                const minPlan = Math.max(ej.planOrigen, ej.series.length);
                bQuitar.disabled = ej.plan <= minPlan;
                bQuitar.title = bQuitar.disabled ? "Hay series extra completadas: deshácelas antes con ↩ en su fila" : "Retirar la última serie extra añadida";
                bQuitar.onclick = () => { ej.plan = Math.max(minPlan, ej.plan - 1); pintarEjercicio(); };
            }
            filaExtras.appendChild(bQuitar);
        }
        contEj.appendChild(filaExtras);
        if (zonaTemporizador.childElementCount > 0) contEj.appendChild(zonaTemporizador);

        const enDescanso = Boolean(descanso);
        const listoDescanso = Boolean(descanso && descanso.restanteMs <= 0);
        const pendientes = ej.series.length < ej.plan;
        let texto = "✔ Hecho — empezar descanso";
        let accion: (() => void) | null = () => completarSerie(ej.series.length);
        let clase = "primario";
        if (!iniciada) { texto = "▶ Iniciar sesión"; accion = () => iniciar(); clase = "primario"; }
        else if (pausado) { texto = "⏸ EN PAUSA — pulsa para continuar"; accion = () => btnPausa.click(); clase = "pausa"; }
        else if (hold) {

            if (hold.ej !== idx) { texto = `⏳ Hold de «${defs[hold.ej].nombre}»… (aquí solo miras)`; accion = null; clase = ""; }
            else { texto = "✔ Terminar hold — registrar"; accion = () => completarSerie(ej.series.length); clase = "verde"; }
        }
        else if (ciclo) {

            if (ciclo.ej !== idx) { texto = `⏳ Ciclo de «${defs[ciclo.ej].nombre}»… (aquí solo miras)`; accion = null; clase = ""; }
            else if (ciclo.fase === "trabajo") { texto = "⏹ Cancelar ciclo"; accion = () => cancelarCiclo(); clase = ""; }
            else { texto = `⏳ Descanso del ciclo ${ciclo.n}… (usa ⏭ en su caja)`; accion = null; clase = ""; }
        }
        else if (enDescanso && !listoDescanso) {

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
        barraAccion.replaceChildren();
        if (enDescanso && cajaDescanso) {
            barraAccion.classList.add("descansando");
            barraAccion.appendChild(cajaDescanso);
        } else {
            barraAccion.classList.remove("descansando");
            if (iniciada && !pausado) barraAccion.appendChild(btnPausa);
            barraAccion.appendChild(btnAccion);
        }
        bVolver.disabled = idx === 0;
        bSiguiente.disabled = idx >= defs.length - 1;
    };

    const bVolver = el("button", "gym-btn-g", "⬅ Volver"); bVolver.type = "button";
    bVolver.title = "Volver al ejercicio anterior";
    bVolver.onclick = () => deslizarA(idx - 1);
    const bNota = el("button", "gym-btn-g", "📝 Nota"); bNota.type = "button";
    bNota.onclick = async () => {
        const ej = defs[idx];
        const r = await pedirTexto(`📝 Nota — ${ej.nombre}`, ej.notas || "");
        if (r !== null) { ej.notas = r.trim(); pintarEjercicio(); }
    };
    const bSiguiente = el("button", "gym-btn-g", "⏭ Siguiente"); bSiguiente.type = "button";
    bSiguiente.onclick = () => {
        if (iniciada && defs[idx]?.objetivo.tipoBloqueEspecial && !defs[idx].series.length) return;
        if (idx + 1 < defs.length) deslizarA(idx + 1);
    };
    const bSaltar = el("button", "gym-btn-g", "⏭ Saltar ejercicio"); bSaltar.type = "button";
    bSaltar.title = "No hacer este ejercicio: sus series quedan registradas como saltadas";
    bSaltar.onclick = () => {
        const ej = defs[idx];
        if (ej.objetivo.tipoBloqueEspecial) {
            if (!iniciada || pausado || ej.series.length) return;
            ej.series.push({ saltada: true, t: transcurridoMs() });
            ej.inicioBloqueMs = undefined;
            toast(`⏭ ${nombreBloqueEspecial(ej.objetivo.tipoBloqueEspecial)}: sin registrar`);
            siguiente();
            return;
        }
        if (descanso && descanso.ej === idx) descanso = null;
        if (hold?.ej === idx) {
            hold = null;
            confirmarCancelarHold = false;
        }
        if (ciclo?.ej === idx) {
            ciclo = null;
            confirmarCancelarCiclo = false;
        }
        if (ejecDesdeEj === idx) ejecDesde = null;

        const etToque = tipoSerieSiguiente(ej);
        const etPlan = tipoSerieDe(ej.objetivo);
        const primera = ej.series.length;
        ej.tipoSiguiente = null;
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

    [bVolver, bSiguiente, bNota, bSaltar, bGuardar, bTerminar].forEach(b => pie.appendChild(b));

    let animando = false;
    const deslizarA = (n: number) => {

        if (animando || n === idx || n < 0 || n >= defs.length) return;
        animando = true;
        const dir = n > idx ? -1 : 1;

        const salida = dir < 0 ? "gym-slide-izq" : "gym-slide-der";
        const entrada = dir < 0 ? "gym-slide-der" : "gym-slide-izq";
        contEj.classList.add("gym-slide", salida, "gym-slide-fuera");
        window.setTimeout(() => {
            irAEjercicio(n);
            contEj.classList.add("gym-slide-sin");
            contEj.classList.remove(salida);
            contEj.classList.add(entrada);
            void contEj.offsetWidth;
            contEj.classList.remove("gym-slide-sin", entrada, "gym-slide-fuera");
            window.setTimeout(() => { contEj.classList.remove("gym-slide"); animando = false; }, 220);
        }, 190);
    };

    const finalizarDescanso = (due: number): void => {
        descanso = null;
        const ejercicio = defs[due];
        const siguientePendiente = ejercicio && ejercicio.series.length >= ejercicio.plan
            ? defs.findIndex((def, i) => i > due && def.series.length < def.plan)
            : -1;
        const destino = siguientePendiente >= 0 ? siguientePendiente : due;
        ejecDesde = transcurridoMs();
        ejecDesdeEj = destino;
        if (destino !== idx && destino >= 0 && destino < defs.length && !animando) deslizarA(destino);
        else pintarEjercicio();
    };

    btnPausa.onclick = () => {
        if (!iniciada) return;
        pausado = !pausado;
        if (pausado) {
            pausaT0 = transcurridoMs();
            pausaPend = Date.now();
        } else if (pausaPend != null) {

            pausas.push({ t: pausaT0, ms: Date.now() - pausaPend });
            pausaAcum += Date.now() - pausaPend;
            pausaPend = null;
            ultimoTick = Date.now();
        }
        btnPausa.textContent = pausado ? "▶ Reanudar" : "⏸ Pausa";
        btnPausa.title = pausado ? "Reanudar la sesión" : "Pausa: congela el reloj y el descanso (no cuenta en los tiempos)";
        btnPausa.setAttribute("aria-label", pausado ? "Reanudar sesión" : "Pausar sesión");
        btnPausa.classList.toggle("reanudar", pausado);
        cuerpo.style.opacity = pausado ? ".5" : "1";
        sincronizaPantalla();
        pintarEjercicio();
    };

    const cerrar = () => {
        window.clearInterval(idReloj);
        reiniciarCuentaAtras("sesion-descanso");
        reiniciarCuentaAtras("sesion-ciclo-trabajo");
        reiniciarCuentaAtras("sesion-ciclo-descanso");
        document.removeEventListener("keydown", onKey);
        pantalla.quitar();
        sesionesAbiertas.delete(cerrar);
        if (retomarSesionMinimizada === restaurar) {
            retomarSesionMinimizada = null;
            actualizarBotonesSesionGuiada();
        }
        btnRestaurar.remove();
        overlay.remove();
    };
    sesionesAbiertas.add(cerrar);
    const onKey = (e: KeyboardEvent) => {
        if (e.key !== "Escape" || minimizada) return;

        if (document.getElementById("gym-confirm-activo") || document.getElementById("gym-modal-activo")) return;
        btnCerrar.click();
    };
    btnCerrar.onclick = async () => {
        const hay = defs.some(d => d.series.length || d.notas || d.inicioBloqueMs != null);
        if (hay) {
            const msg = parcialGuard
                ? "¿Salir? Tu progreso ya está guardado: al volver a abrir este día continuarás donde lo dejaste.\n\nSe pierde solo lo hecho desde el último Guardar."
                : "¿Salir sin guardar? Se pierde lo registrado en esta sesión.";
            const ok = await confirmar("🎯 Sesión guiada", msg, "Salir sin guardar", "Seguir entrenando");
            if (!ok) return;
        }
        cerrar();
    };

    const guardarProgreso = async () => {
        if (!iniciada) return toast("⚠️ Pulsa ▶ Iniciar sesión antes de guardar.", false);
        const conDatos = defs.filter(d => d.series.length || d.notas || d.inicioBloqueMs != null);
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
        const pausasGuardadas = pausaPend != null
            ? [...pausas, { t: pausaT0, ms: Date.now() - pausaPend }]
            : pausas;
        const sesion: Sesion = {
            fecha: hoy(),
            diaId: dia.id,
            duracionMin,
            anotaciones: "",
            enCurso: true,           // marca de progreso sin terminar: se retira al Terminar
            idx,                     // por qué ejercicio ibas (para reanudar)
            transcurridoMs: transcurridoMs(),   // reloj activo acumulado (para que al reanudar siga contando)
            ...(inicioRealMs != null ? { inicioRealMs } : {}),
            ...(pausasGuardadas.length ? { pausas: pausasGuardadas } : {}),   // las pausas viajan con la sesión

            ejercicios: defs.map(d => aEjercicioGuardado(d, transcurridoMs())),
        };
        try {
            const iP = parcialGuard ? rutina.sesiones.indexOf(parcialGuard) : -1;
            if (iP >= 0) rutina.sesiones.splice(iP, 1);
            rutina.sesiones.push(sesion);
            rutina.sesiones.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
            await escribirRutina(rutina);
            parcialGuard = sesion;
            toast(`💾 Progreso guardado · ${totalSeries} series · ${duracionMin} min — continúa cuando quieras`);
            void pintar();
        } catch (e: unknown) {
            console.error("[GymGestor guardar progreso]", e);
            toast("⚠️ No pude guardar el progreso: " + msgError(e), false);
        }
    };

    const mostrarResumen = (
        sesion: Sesion,
        recordes: RecordeDetectado[],
        duracionMs: number,
    ): void => {
        const m = modal("🏁 Entrenamiento completado", dia.nombre);
        ponerX(m);
        const kpis = el("div", "gym-resumen-kpis");
        const kpiDuracion = el("div", "gym-resumen-kpi");
        kpiDuracion.append(el("div", "gym-et", "Duración"), el("b", "", relojTexto(duracionMs)));
        const kpiVolumen = el("div", "gym-resumen-kpi");
        kpiVolumen.title = "Volumen de ejercicios de peso: series × reps × kg";
        kpiVolumen.append(el("div", "gym-et", "Volumen de peso"), el("b", "", pesoTexto(volumenSesion(sesion))));
        kpis.append(kpiDuracion, kpiVolumen);
        m.caja.appendChild(kpis);

        const lista = el("div", "gym-resumen-recordes");
        lista.appendChild(el("div", "gym-et", "Récords personales"));
        if (!baseRecordes) {
            lista.appendChild(el("div", "gym-resumen-sin-record", `No se pudieron comprobar: ${errorCargaRecordes}`));
        } else if (!recordes.length) {
            lista.appendChild(el("div", "gym-resumen-sin-record", "No superaste récords anteriores en esta sesión."));
        } else {
            for (const recorde of recordes) {
                const nombreEjercicio = recorde.ejercicioId
                    ? sesion.ejercicios[recorde.indiceEjercicio]?.nombre ?? recorde.ejercicioId
                    : "Toda la sesión";
                const fila = el("div", "gym-resumen-recorde");
                fila.append(
                    el("span", "gym-recorde-chip", "🏆"),
                    el("b", "", nombreMetricaRecorde(recorde)),
                    el("span", "", `${nombreEjercicio} · ${valorRecorde(recorde)}`),
                );
                lista.appendChild(fila);
            }
        }
        m.caja.appendChild(lista);
        void ofrecerAjustesPlan(rutina, [sesion], dia.id, m.caja, () => { void pintar(); });
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

        if (!(await confirmar("🏁 Terminar sesión",
            `¿Terminar y guardar la sesión de «${dia.nombre}»?\n\n· ${conDatos.length} de ${defs.length} ejercicios\n· ${totalSeries} series · ~${duracionMin} min` +
            (totalSaltadas ? `\n· ${totalSaltadas} serie${totalSaltadas > 1 ? "s" : ""} saltada${totalSaltadas > 1 ? "s" : ""} (quedan registradas como no hechas)` : "") +
            (totalSinRegistrar ? `\n· ${totalSinRegistrar} ejercicio${totalSinRegistrar > 1 ? "s" : ""} sin registrar (quedan marcados como no hechos)` : "") +
            (conDatos.some(d => d.planDeRutina && tipoEjercicioDe(d.objetivo) === "peso")
                ? "\n· Se guardará la diferencia entre el plan y las series/pesos realizados" : ""),
            "Terminar y guardar", "Seguir entrenando"))) return;
        const recordesFinales = recordesDeSesion();
        const duracionRealMs = transcurridoMs();
        if (pausaPend != null) {
            pausas.push({ t: pausaT0, ms: Date.now() - pausaPend });
            pausaPend = null;
        }
        const sesion: Sesion = {
            fecha: hoy(),
            diaId: dia.id,
            duracionMin,
            transcurridoMs: duracionRealMs,
            ...(inicioRealMs != null ? { inicioRealMs } : {}),
            anotaciones: "",
            ...(pausas.length ? { pausas } : {}),   // las pausas viajan con la sesión

            ejercicios: defs.map(aEjercicioGuardado),
        };
        try {
            const iP = parcialGuard ? rutina.sesiones.indexOf(parcialGuard) : -1;
            if (iP >= 0) rutina.sesiones.splice(iP, 1);
            parcialGuard = null;
            rutina.sesiones.push(sesion);
            rutina.sesiones.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
            await escribirRutina(rutina);
            cerrar();
            void pintar();
            mostrarResumen(sesion, recordesFinales, duracionRealMs);
        } catch (e: unknown) {
            console.error("[GymGestor modo sesión]", e);
            toast("⚠️ No pude guardar la sesión: " + msgError(e), false);
        }
    };

    const finDescanso = (): void => {
        if (!descanso) return;
        sonarDescanso();
        vibrar();
        finalizarDescanso(descanso.ej);
    };

    const idReloj = window.setInterval(() => {
        const ahora = Date.now();
        const dt = Math.max(0, ahora - ultimoTick);
        ultimoTick = ahora;
        relojEl.textContent = `⏱ ${relojTexto(transcurridoMs())}`;
        const bloqueActual = defs[idx];
        if (lecturaBloque && bloqueActual?.objetivo.tipoBloqueEspecial && !bloqueActual.series.length) {
            const inicioBloque = bloqueActual.inicioBloqueMs ?? transcurridoMs();
            lecturaBloque.textContent = `⏱ ${relojTexto(Math.max(0, transcurridoMs() - inicioBloque))}`;
        }
        if (pausado) return;
        if (descanso && descanso.restanteMs > 0) {
            descanso.restanteMs -= dt;
            sonarCuentaAtras("sesion-descanso", "descanso", descanso.restanteMs);
            if (descanso.restanteMs > 0) {
                pintarDescanso();
            } else {
                finDescanso();
            }
        }
        if (ciclo) {
            ciclo.restanteMs -= dt;
            const claveAviso = ciclo.fase === "trabajo" ? "sesion-ciclo-trabajo" : "sesion-ciclo-descanso";
            sonarCuentaAtras(claveAviso, "temporizador", ciclo.restanteMs);
            if (ciclo.restanteMs > 0) {
                pintarCiclo();
            } else if (ciclo.fase === "trabajo") {
                finTrabajoCiclo();
            } else {
                finDescansoCiclo();
            }
        }
        if (hold) {
            hold.ms += dt;
            pintarHold();
        }
    }, 250);

    pintarEjercicio();
    relojEl.textContent = `⏱ ${relojTexto(transcurridoMs())}`;
    sincronizaPantalla();
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
}
