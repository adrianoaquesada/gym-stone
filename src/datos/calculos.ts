/* ═══════════════════════════════════════════════════════════════════════════
   Cálculos sobre una rutina — puro, sin dibujar nada.

   Esta es la antigua sección de cálculos de _gym-datos.js: adherencia, racha,
   volumen, 1RM estimado (Epley), historial por ejercicio y catálogos.
   ═══════════════════════════════════════════════════════════════════════════ */

import { carpetaDatos } from "../ajustes";
import { diffDias, diaSemana, esFechaValida, hoy, lunesDe, sumarDias, tsDe, tsAhora } from "../util/fechas";
import { norm, slug } from "../util/texto";
import { archivosMdEnCarpeta, leerNotaDatos } from "./archivos";
import { semanasTotales, tipoEjercicioDe } from "./rutinas";
import type {
    DiaRutina, EjercicioCatalogo, EjercicioDef, Rutina, SerieSesion, Sesion, TipoEjercicio, TipoSerie,
} from "../tipos";

/* ── Localizadores ──────────────────────────────────────────────────────── */

export const diaPorId = (rutina: Rutina | null | undefined, id: string): DiaRutina | null =>
    (rutina?.dias ?? []).find(d => d.id === id) ?? null;

export const ejercicioPorId = (dia: DiaRutina | null, id: string): EjercicioDef | null =>
    (dia?.ejercicios ?? []).find(e => e.id === id) ?? null;

// Sesiones registradas en una fecha concreta (puede haber más de una)
export const sesionesEn = (rutina: Rutina, fecha: string): Sesion[] =>
    (rutina.sesiones ?? []).filter(s => s.fecha === fecha);

// Día de rutina programado para una fecha (el primero cuyo día de la semana coincide)
export const diaProgramado = (rutina: Rutina, fecha: string): DiaRutina | null => {
    const ds = diaSemana(fecha);
    return (rutina.dias ?? []).find(d => (d.diasSemana ?? []).includes(ds)) ?? null;
};

// Todos los días programados entre dos fechas (para adherencia y calendario)
export const programados = (rutina: Rutina, desde: string, hasta: string): { fecha: string; diaId: string; dia: DiaRutina }[] => {
    const out: { fecha: string; diaId: string; dia: DiaRutina }[] = [];
    const t0 = tsDe(desde), t1 = tsDe(hasta);
    if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) return out;
    // Iteración por días de calendario: inmune al cambio de hora
    for (let ts = t0; ts <= t1;) {
        const d = new Date(ts);
        const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const dia = diaProgramado(rutina, fecha);
        if (dia) out.push({ fecha, diaId: dia.id, dia });
        d.setDate(d.getDate() + 1);
        ts = d.getTime();
    }
    return out;
};

/* ── Volumen y series ───────────────────────────────────────────────────── */

// Volumen de una serie: reps × peso (sin peso cuenta 0, pero las reps sí se
// ven). Una serie SALTADA (planificada pero no hecha) no aporta volumen.
// En «tiempo»/«intervalo» el trabajo se mide en segundos (segundosSerie).
export const esSaltada = (s: SerieSesion | undefined | null): boolean => Boolean(s?.saltada);
export const volumenSerie = (s: SerieSesion | undefined | null): number =>
    esSaltada(s) ? 0 : (Number(s?.reps) || 0) * (Number(s?.peso) || 0);
// El volumen (reps × peso) solo cuenta en ejercicios de «peso» (decisión 6):
// los de tiempo/intervalo se leen por segundos, no por kilos.
export const volumenEjercicio =
    (ej: { series?: SerieSesion[]; tipoEjercicio?: TipoEjercicio | null } | undefined | null): number =>
        tipoEjercicioDe(ej) === "peso"
            ? (ej?.series ?? []).reduce((t, s) => t + volumenSerie(s), 0)
            : 0;
export const volumenSesion = (sesion: Sesion | undefined | null): number =>
    (sesion?.ejercicios ?? []).reduce((t, e) => t + volumenEjercicio(e), 0);

// Tiempo registrado (segundos), para «tiempo» e «intervalo». Las series
// saltadas no cuentan, igual que en el volumen.
export const segundosSerie = (s: SerieSesion | undefined | null): number =>
    esSaltada(s) ? 0 : Number(s?.duracionSeg) || 0;
export const segundosEjercicio = (ej: { series?: SerieSesion[] } | undefined | null): number =>
    (ej?.series ?? []).reduce((t, s) => t + segundosSerie(s), 0);
export const segundosSesion = (sesion: Sesion | undefined | null): number =>
    (sesion?.ejercicios ?? []).reduce((t, e) => t + segundosEjercicio(e), 0);

// Series hechas (sin contar las saltadas) y totales de una sesión.
// Tolera que "series" no sea array (en la DEFINICIÓN de la rutina es un número).
export const seriesHechas = (ej: { series?: SerieSesion[] } | undefined | null): SerieSesion[] =>
    Array.isArray(ej?.series) ? ej.series.filter(s => !esSaltada(s)) : [];
export const totalSeries = (sesion: Sesion): number =>
    (sesion?.ejercicios ?? []).reduce((t, e) => t + seriesHechas(e).length, 0);
export const totalSaltadas = (sesion: Sesion): number =>
    (sesion?.ejercicios ?? []).reduce(
        (t, e) => t + (Array.isArray(e?.series) ? e.series.filter(esSaltada).length : 0), 0);

// ¿La serie tiene algún valor escrito? Ojo: "" no cuenta (es un campo vacío,
// distinto de null que sería "sin rellenar") y NaN tampoco. El 0 sí: es un dato.
export const conValor = (v: unknown): boolean =>
    v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v));
// Una serie "con datos" es la que aporta al registro: ni saltada ni vacía.
// Cuenta reps/peso («peso») y también duracionSeg («tiempo»/«intervalo»).
export const serieConDatos = (s: SerieSesion): boolean =>
    !esSaltada(s) && (conValor(s?.reps) || conValor(s?.peso) || conValor(s?.duracionSeg));
// Ejercicio del día planificado pero no hecho. Se GUARDA igualmente (marcado),
// no se descarta: si no, el registro dejaría de cuadrar con la rutina base.
export const esSinRegistrar = (ej: { sinRegistrar?: boolean } | undefined | null): boolean =>
    Boolean(ej?.sinRegistrar);

// 1RM estimado (Epley): peso × (1 + reps / 30)
export const estim1RM = (peso: unknown, reps: unknown): number | null => {
    const p = Number(peso), r = Number(reps);
    if (!Number.isFinite(p) || p <= 0) return null;
    if (!Number.isFinite(r) || r <= 1) return p;
    return p * (1 + r / 30);
};

/* ── Adherencia, racha y calendario de la rutina ────────────────────────── */

// Adherencia y racha: los días programados transcurridos hasta hoy
export const adherencia = (rutina: Rutina): {
    programadas: number; hechas: number; pct: number; racha: number; mejorRacha: number;
} => {
    const fin = esFechaValida(rutina.fin) ? rutina.fin : hoy();
    const hasta = diffDias(rutina.inicio, hoy()) >= 0
        ? (tsDe(hoy()) > tsDe(fin) ? fin : hoy()) : null;   // aún no ha empezado
    if (!hasta) return { programadas: 0, hechas: 0, pct: NaN, racha: 0, mejorRacha: 0 };
    const prog = programados(rutina, rutina.inicio, hasta);
    const hechas = prog.filter(p => sesionesEn(rutina, p.fecha).length > 0).length;
    let racha = 0, mejor = 0;
    for (const p of prog) {
        if (sesionesEn(rutina, p.fecha).length) { racha++; if (racha > mejor) mejor = racha; }
        else racha = 0;
    }
    return {
        programadas: prog.length,
        hechas,
        pct: prog.length ? (hechas / prog.length) * 100 : NaN,
        racha,
        mejorRacha: mejor,
    };
};

// Semana actual (1-based) dentro de la duración de la rutina
export const semanaActual = (rutina: Rutina): number => {
    const d = diffDias(rutina.inicio, hoy()) + 1;
    if (d <= 0) return 0;                                  // aún no ha empezado
    const total = semanasTotales(rutina) || 1;
    return Math.min(Math.ceil(d / 7), total);
};

export const transcurrida = (rutina: Rutina): boolean =>
    esFechaValida(rutina.fin) && tsDe(rutina.fin) < tsAhora();

/* ── Historial por ejercicio ────────────────────────────────────────────── */

export interface EntradaHistorial {
    fecha: string;
    diaId: string;
    tipoEjercicio: TipoEjercicio;
    series: SerieSesion[];
    sesion: Sesion;
    mejorPeso: number;
    mejorReps: number;
    mejor: SerieSesion;
    mejorSeg: number;
    oneRM: number;
    volumen: number;
    notas: string;
}

// Registros de un ejercicio a lo largo del tiempo, con su mejor serie.
// En «peso» manda reps × peso (1RM incluido); en «tiempo»/«intervalo» la
// mejor serie y el acumulado van en segundos, sin 1RM ni volumen.
export const historialEjercicio = (rutina: Rutina, ejercicioId: string): EntradaHistorial[] => {
    const out: EntradaHistorial[] = [];
    for (const s of rutina.sesiones ?? []) {
        const ej = (s.ejercicios ?? []).find(e => e.ejercicioId === ejercicioId);
        if (!ej) continue;
        // El tipo va en la propia sesión (2b/2c); si no consta, «peso»:
        // es el de los datos previos al cambio (decisión 18).
        const tipoEjercicio = tipoEjercicioDe(ej);
        const esPeso = tipoEjercicio === "peso";
        const series = seriesHechas(ej).filter(serieConDatos);
        if (!series.length) continue;
        const mejorPeso = esPeso ? Math.max(0, ...series.map(x => Number(x.peso) || 0)) : 0;
        const mejor = [...series].sort((a, b) => esPeso
            ? (Number(b.peso) || 0) - (Number(a.peso) || 0) || (Number(b.reps) || 0) - (Number(a.reps) || 0)
            : (Number(b.duracionSeg) || 0) - (Number(a.duracionSeg) || 0))[0];
        out.push({
            fecha: s.fecha,
            diaId: s.diaId,
            tipoEjercicio,
            series,
            sesion: s,
            mejorPeso,
            mejorReps: esPeso ? Math.max(0, ...series.map(x => Number(x.reps) || 0)) : 0,
            mejor,
            mejorSeg: esPeso ? 0 : Math.max(0, ...series.map(x => Number(x.duracionSeg) || 0)),
            oneRM: esPeso ? Math.max(0, ...series.map(x => estim1RM(x.peso, x.reps) ?? 0)) : 0,
            volumen: esPeso ? volumenEjercicio(ej) : 0,
            notas: ej.notas ?? "",
        });
    }
    return out.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
};

// Lista de todos los ejercicios que han aparecido (incluye los borrados de la
// rutina pero con registros: los registros viejos nunca se rompen)
export const ejerciciosConDatos = (rutina: Rutina): EjercicioCatalogo[] => {
    const mapa = new Map<string, EjercicioCatalogo>();
    for (const d of rutina.dias ?? []) {
        for (const e of d.ejercicios ?? []) {
            if (!mapa.has(e.id)) mapa.set(e.id, { id: e.id, nombre: e.nombre, dia: d.nombre });
        }
    }
    for (const s of rutina.sesiones ?? []) {
        for (const e of s.ejercicios ?? []) {
            if (!e.ejercicioId) continue;
            if (!mapa.has(e.ejercicioId)) {
                mapa.set(e.ejercicioId, {
                    id: e.ejercicioId,
                    nombre: e.nombre ?? e.ejercicioId,
                    dia: "(fuera de la rutina)",
                    huerfano: true,
                });
            }
        }
    }
    return [...mapa.values()];
};

/* ── Rutinas libres ─────────────────────────────────────────────────────── */

// Una rutina "libre" no tiene días de la semana ni ejercicios predefinidos:
// cada día anotas lo que has hecho de verdad. Los registros usan la MISMA
// forma que los de una planificada, así que el historial, las estadísticas y
// las gráficas funcionan sin cambios.
export const esLibre = (rutina?: Rutina | null): boolean => rutina?.tipo === "libre";

// Id estable para un ejercicio escrito a mano: se deriva del nombre ya
// normalizado, para que «Press banca» tecleado mil veces sea SIEMPRE el
// mismo ejercicio y su historial no se parta en trozos.
export const idEjercicioLibre = (nombre: string): string => `ej-${slug(nombre)}`;

// Catálogo elegible al registrar un ejercicio: todo lo de los días
// planificados (si los hay) más todo lo que ya aparece en alguna sesión.
export const catalogoEjercicios = (rutina: Rutina): EjercicioCatalogo[] =>
    ejerciciosConDatos(rutina ?? ({} as Rutina))
        .filter(x => x?.id && x?.nombre)
        .map(x => ({ id: x.id, nombre: x.nombre, dia: x.dia }));

// Catálogo para el buscador de «＋ Añadir ejercicio»: el de ESTA rutina más el
// de TODAS las demás del vault, para que un ejercicio que solo has hecho en
// otra rutina también aparezca al buscarlo. Sale SIN cortes y ya ordenado.
// Los duplicados se resuelven por nombre normalizado: si «Press banca» está en
// varios sitios manda el de ESTA rutina, y el importado conserva su id.
export const catalogoEjerciciosTodas = async (rutinaActual?: Rutina | null): Promise<EjercicioCatalogo[]> => {
    const propios: EjercicioCatalogo[] = (rutinaActual ? catalogoEjercicios(rutinaActual) : [])
        .map(x => ({ ...x, rutina: "" }));
    const nombres = new Set(propios.map(x => norm(x.nombre)));
    const ids = new Set(propios.map(x => x.id));
    const ajenos: EjercicioCatalogo[] = [];

    let archivos: { path: string; basename: string }[] = [];
    try {
        // Solo .md de la carpeta de datos: nada del resto del vault
        archivos = archivosMdEnCarpeta(carpetaDatos());
    } catch { archivos = []; }

    for (const f of archivos) {
        const r = await leerNotaDatos<Rutina>(f.path);
        if (r.error || !r.datos || r.datos.id === rutinaActual?.id) continue;   // la actual ya está arriba
        const origen = r.datos.nombre || f.basename;
        for (const x of catalogoEjercicios(r.datos)) {
            const k = norm(x.nombre);
            if (!x?.id || !k || nombres.has(k) || ids.has(x.id)) continue;       // nombre o id ya visto
            nombres.add(k); ids.add(x.id);
            ajenos.push({ id: x.id, nombre: x.nombre, dia: x.dia, rutina: origen });
        }
    }
    ajenos.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return [...propios, ...ajenos];
};

// Últimos valores registrados de un ejercicio (para precargar una sesión con
// el peso y las reps de la última vez que lo hiciste, o al menos con cuántas
// series fueron). En «tiempo»/«intervalo» peso y reps llegan a null: ahí lo
// útil es el número de series y la fecha.
export const ultimosValores = (rutina: Rutina, ejercicioId: string): {
    peso: number | null; reps: number | null; series: number; fecha: string; tipoEjercicio: TipoEjercicio;
} | null => {
    const h = historialEjercicio(rutina, ejercicioId);
    const ult = h[h.length - 1];
    if (!ult) return null;
    return {
        peso: ult.mejor?.peso ?? null,
        reps: ult.mejor?.reps ?? null,
        series: ult.series.length,
        fecha: ult.fecha,
        tipoEjercicio: ult.tipoEjercicio,
    };
};

// Último descanso (segundos) conocido para un ejercicio: 1º en la sesión más
// reciente que lo registre, 2º en el plan de cualquier día de la rutina.
// null si nunca ha constado: el que lo elija entonces (o el por defecto, 90 s).
export const descansoDe = (rutina: Rutina | null | undefined, ejercicioId: string): number | null => {
    const sesiones = [...(rutina?.sesiones ?? [])]
        .filter(s => esFechaValida(s.fecha) && !s.enCurso)
        .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
    for (let i = sesiones.length - 1; i >= 0; i--) {
        const e = (sesiones[i].ejercicios ?? []).find(x => x.ejercicioId === ejercicioId);
        const v = Number(e?.descansoSeg);
        if (v > 0) return Math.round(v);
    }
    for (const d of (rutina?.dias ?? [])) {
        for (const e of (d.ejercicios ?? [])) {
            const v = Number(e.descansoSeg);
            if (e.id === ejercicioId && v > 0) return Math.round(v);
        }
    }
    return null;
};

// Tipo de serie (ver TipoSerie) del plan para un ejercicio: del plan de
// cualquier día de la rutina. null si nunca ha constado: por defecto,
// «trabajo» (es el de los datos escritos antes del cambio).
export const tipoSerieDeRutina =
    (rutina: Rutina | null | undefined, ejercicioId: string): TipoSerie | null => {
        for (const d of rutina?.dias ?? []) {
            for (const e of (d.ejercicios ?? [])) {
                if (e.id === ejercicioId) return e.tipoSerie ?? null;
            }
        }
        return null;
    };

// Tipo de ejercicio (ver TipoEjercicio) de un ejercicio: del plan de
// cualquier día de la rutina. "peso" si nunca ha constado: es el de los
// registros escritos antes del cambio y el de los ejercicios huérfanos.
export const tipoEjercicioDeRutina =
    (rutina: Rutina | null | undefined, ejercicioId: string): TipoEjercicio => {
        for (const d of rutina?.dias ?? []) {
            for (const e of (d.ejercicios ?? [])) {
                if (e.id === ejercicioId) return tipoEjercicioDe(e);
            }
        }
        return "peso";
    };

// Resumen de una rutina libre: sin días "programados" contra los que medir la
// adherencia, lo que cuenta es cuántos días has entrenado y la racha de
// SEMANAS consecutivas con al menos una sesión.
export const resumenLibre = (rutina: Rutina): {
    dias: number; fechas: string[]; racha: number; mejorRacha: number;
} => {
    const fechas = [...new Set((rutina.sesiones ?? [])
        .filter(s => esFechaValida(s.fecha) && !s.enCurso)
        .map(s => s.fecha))].sort();
    const semanas = new Set(fechas.map(lunesDe));
    // Racha actual: semanas seguidas con sesión. Si esta semana todavía no has
    // entrenado no se corta (aún no has fallado).
    let lunes = lunesDe(hoy());
    if (!semanas.has(lunes)) lunes = sumarDias(lunes, -7);
    let racha = 0;
    while (semanas.has(lunes) && racha < 500) { racha++; lunes = sumarDias(lunes, -7); }
    // Mejor racha: recorrido de todas las semanas con sesión, de vieja a reciente
    const orden = [...semanas].sort();
    let mejor = 0, seguidas = 0;
    for (let i = 0; i < orden.length; i++) {
        seguidas = (i > 0 && orden[i] === sumarDias(orden[i - 1], 7)) ? seguidas + 1 : 1;
        if (seguidas > mejor) mejor = seguidas;
    }
    return { dias: fechas.length, fechas, racha, mejorRacha: mejor };
};

// Nombre del día para mostrar en tablas y tooltips. En una rutina libre la
// sesión no tiene día asignado (diaId vacío): sin esto saldría una celda en blanco.
export const nombreDia = (rutina: Rutina | null | undefined, diaId: string): string =>
    diaPorId(rutina ?? null, diaId)?.nombre || (diaId ? String(diaId) : "Libre");
