import { carpetaDatos, SUFIJO_MD } from "../ajustes";
import { diffDias, diaSemana, esFechaValida, hoy, lunesDe, sumarDias, tsDe, tsAhora } from "../util/fechas";
import { norm, slug } from "../util/texto";
import { archivosMdEnCarpeta, leerNotaDatos } from "./archivos";
import { esRutinaFormatoActual, repsObjetivoDe, semanasTotales, tipoEjercicioDe, tipoSerieDe } from "./rutinas";
import { normalizarGrupos } from "./grupos";
import type {
    DiaRutina, EjercicioCatalogo, EjercicioDef, PlantillaRutina, Rutina, SerieSesion, Sesion,
    TipoEjercicio, TipoSerie,
} from "../tipos";

export const diaPorId = (rutina: Rutina | null | undefined, id: string): DiaRutina | null =>
    (rutina?.dias ?? []).find(d => d.id === id) ?? null;

export const ejercicioPorId = (dia: DiaRutina | null, id: string): EjercicioDef | null =>
    (dia?.ejercicios ?? []).find(e => e.id === id) ?? null;

export interface ComparacionPlanEjercicio {
    ejercicioId: string;
    base: EjercicioDef | null;
    activo: EjercicioDef | null;
    diaBase: DiaRutina | null;
    diaActivo: DiaRutina | null;
    estado: "sin-cambios" | "ajustado" | "añadido" | "retirado";
}

const camposComparablesEjercicio = (ejercicio: EjercicioDef): string => JSON.stringify({
    nombre: ejercicio.nombre ?? "",
    grupos: normalizarGrupos(ejercicio.grupos).sort((a, b) => a.localeCompare(b, "es")),
    tipoEjercicio: tipoEjercicioDe(ejercicio),
    tipoBloqueEspecial: ejercicio.tipoBloqueEspecial ?? null,
    series: Math.max(1, Number(ejercicio.series) || 1),
    repsObjetivo: repsObjetivoDe(ejercicio),
    pesoObjetivo: ejercicio.pesoObjetivo ?? null,
    duracionObjetivo: ejercicio.duracionObjetivo ?? null,
    repsPesoDuranteTiempo: ejercicio.repsPesoDuranteTiempo === true,
    descansoSeg: ejercicio.descansoSeg ?? null,
    trabajoSeg: ejercicio.trabajoSeg ?? null,
    transicionSeg: ejercicio.transicionSeg ?? null,
    notas: ejercicio.notas ?? "",
    tipoSerie: tipoSerieDe(ejercicio),
});

const camposComparablesDia = (dia: DiaRutina, orden: number): string => JSON.stringify({
    nombre: dia.nombre ?? "",
    orden,
    diasSemana: [...(dia.diasSemana ?? [])].sort((a, b) => a - b),
    etiquetasPersonalizadas: normalizarGrupos(dia.etiquetasPersonalizadas)
        .sort((a, b) => a.localeCompare(b, "es")),
});

export const compararPlanes = (
    plantilla: PlantillaRutina,
    rutina: Rutina,
): ComparacionPlanEjercicio[] => {
    type ElementoPlan = {
        ejercicio: EjercicioDef;
        dia: DiaRutina;
        ordenDia: number;
        ordenEjercicio: number;
    };
    const base: ElementoPlan[] = [];
    const activo: ElementoPlan[] = [];
    for (const [ordenDia, dia] of (plantilla.dias ?? []).entries()) {
        for (const [ordenEjercicio, ejercicio] of (dia.ejercicios ?? []).entries()) {
            base.push({ ejercicio, dia, ordenDia, ordenEjercicio });
        }
    }
    for (const [ordenDia, dia] of (rutina.dias ?? []).entries()) {
        for (const [ordenEjercicio, ejercicio] of (dia.ejercicios ?? []).entries()) {
            activo.push({ ejercicio, dia, ordenDia, ordenEjercicio });
        }
    }

    const pares = new Map<number, number>();
    const activoEmparejado = new Set<number>();
    const claveExacta = (elemento: ElementoPlan): string =>
        `${elemento.dia.id}\u0000${elemento.ejercicio.id}`;
    const porDiaYEjercicio = new Map<string, number[]>();
    activo.forEach((elemento, indice) => {
        const clave = claveExacta(elemento);
        const indices = porDiaYEjercicio.get(clave) ?? [];
        indices.push(indice);
        porDiaYEjercicio.set(clave, indices);
    });
    base.forEach((elemento, indiceBase) => {
        const indices = porDiaYEjercicio.get(claveExacta(elemento));
        const indiceActivo = indices?.find(indice => !activoEmparejado.has(indice));
        if (indiceActivo == null) return;
        pares.set(indiceBase, indiceActivo);
        activoEmparejado.add(indiceActivo);
    });

    const porIdEjercicio = new Map<string, number[]>();
    activo.forEach((elemento, indice) => {
        if (activoEmparejado.has(indice)) return;
        const indices = porIdEjercicio.get(elemento.ejercicio.id) ?? [];
        indices.push(indice);
        porIdEjercicio.set(elemento.ejercicio.id, indices);
    });
    base.forEach((elemento, indiceBase) => {
        if (pares.has(indiceBase)) return;
        const indices = porIdEjercicio.get(elemento.ejercicio.id);
        const indiceActivo = indices?.find(indice => !activoEmparejado.has(indice));
        if (indiceActivo == null) return;
        pares.set(indiceBase, indiceActivo);
        activoEmparejado.add(indiceActivo);
    });

    const fila = (inicial: ElementoPlan | null, actual: ElementoPlan | null): ComparacionPlanEjercicio => {
        const estado: ComparacionPlanEjercicio["estado"] = !inicial ? "añadido"
            : !actual ? "retirado"
                : camposComparablesEjercicio(inicial.ejercicio) === camposComparablesEjercicio(actual.ejercicio)
                    && inicial.ordenEjercicio === actual.ordenEjercicio
                    && inicial.dia.id === actual.dia.id
                    && camposComparablesDia(inicial.dia, inicial.ordenDia)
                        === camposComparablesDia(actual.dia, actual.ordenDia)
                    ? "sin-cambios" : "ajustado";
        return {
            ejercicioId: actual?.ejercicio.id ?? inicial?.ejercicio.id ?? "",
            base: inicial?.ejercicio ?? null,
            activo: actual?.ejercicio ?? null,
            diaBase: inicial?.dia ?? null,
            diaActivo: actual?.dia ?? null,
            estado,
        };
    };
    const filas = base.map((elemento, indice) => {
        const indiceActivo = pares.get(indice);
        return fila(elemento, indiceActivo == null ? null : activo[indiceActivo]);
    });
    activo.forEach((elemento, indice) => {
        if (!activoEmparejado.has(indice)) filas.push(fila(null, elemento));
    });
    return filas;
};

export const sesionesEn = (rutina: Rutina, fecha: string): Sesion[] =>
    (rutina.sesiones ?? []).filter(s => s.fecha === fecha);

export const diaProgramado = (rutina: Rutina, fecha: string): DiaRutina | null => {
    const ds = diaSemana(fecha);
    return (rutina.dias ?? []).find(d => (d.diasSemana ?? []).includes(ds)) ?? null;
};

export const programados = (rutina: Rutina, desde: string, hasta: string): { fecha: string; diaId: string; dia: DiaRutina }[] => {
    const out: { fecha: string; diaId: string; dia: DiaRutina }[] = [];
    const t0 = tsDe(desde), t1 = tsDe(hasta);
    if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) return out;

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

export const esSaltada = (s: SerieSesion | undefined | null): boolean => Boolean(s?.saltada);
export const volumenSerie = (s: SerieSesion | undefined | null): number =>
    esSaltada(s) ? 0 : (Number(s?.reps) || 0) * (Number(s?.peso) || 0);

export const volumenEjercicio =
    (ej: { series?: SerieSesion[]; tipoEjercicio?: TipoEjercicio | null } | undefined | null): number =>
        tipoEjercicioDe(ej) === "peso"
            ? (ej?.series ?? []).reduce((t, s) => t + volumenSerie(s), 0)
            : 0;
export const volumenSesion = (sesion: Sesion | undefined | null): number =>
    (sesion?.ejercicios ?? []).reduce((t, e) => t + volumenEjercicio(e), 0);

export const segundosSerie = (s: SerieSesion | undefined | null): number =>
    esSaltada(s) ? 0 : Number(s?.duracionSeg) || 0;
export const segundosEjercicio = (ej: { series?: SerieSesion[] } | undefined | null): number =>
    (ej?.series ?? []).reduce((t, s) => t + segundosSerie(s), 0);
export const segundosSesion = (sesion: Sesion | undefined | null): number =>
    (sesion?.ejercicios ?? []).reduce((t, e) => t + segundosEjercicio(e), 0);

export const seriesHechas = (ej: { series?: SerieSesion[] } | undefined | null): SerieSesion[] =>
    Array.isArray(ej?.series) ? ej.series.filter(s => !esSaltada(s)) : [];
export const totalSeries = (sesion: Sesion): number =>
    (sesion?.ejercicios ?? []).reduce((t, e) => t + seriesHechas(e).length, 0);
export const totalSaltadas = (sesion: Sesion): number =>
    (sesion?.ejercicios ?? []).reduce(
        (t, e) => t + (Array.isArray(e?.series) ? e.series.filter(esSaltada).length : 0), 0);

export const conValor = (v: unknown): boolean =>
    v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v));

export const serieConDatos = (s: SerieSesion): boolean =>
    !esSaltada(s) && (conValor(s?.reps) || conValor(s?.peso) || conValor(s?.duracionSeg));

export const esSinRegistrar = (ej: { sinRegistrar?: boolean } | undefined | null): boolean =>
    Boolean(ej?.sinRegistrar);

export const estim1RM = (peso: unknown, reps: unknown): number | null => {
    const p = Number(peso), r = Number(reps);
    if (!Number.isFinite(p) || p <= 0) return null;
    if (!Number.isFinite(r) || r <= 1) return p;
    return p * (1 + r / 30);
};

export type MetricaRecorde =
    | "peso" | "1rm" | "repeticiones" | "duracion"
    | "volumen-ejercicio" | "volumen-sesion";

export interface RecordeDetectado {
    metrica: MetricaRecorde;
    ejercicioId: string | null;
    indiceEjercicio: number;
    indiceSerie: number;
    valor: number;
    peso?: number;
}

interface BaseRecordeEjercicio {
    pesoMax: number | null;
    oneRM: number | null;
    repsPorPeso: Map<number, number>;
    duracionMax: number | null;
    volumenMax: number | null;
}

export interface BaseRecordesPersonales {
    ejercicios: Map<string, Map<TipoEjercicio, BaseRecordeEjercicio>>;
    volumenSesionMax: number | null;
}

const nuevaBaseRecordes = (): BaseRecordesPersonales => ({
    ejercicios: new Map(),
    volumenSesionMax: null,
});

const baseEjercicioDe = (
    base: BaseRecordesPersonales,
    ejercicioId: string,
    tipo: TipoEjercicio,
): BaseRecordeEjercicio => {
    let tipos = base.ejercicios.get(ejercicioId);
    if (!tipos) { tipos = new Map(); base.ejercicios.set(ejercicioId, tipos); }
    let ejercicio = tipos.get(tipo);
    if (!ejercicio) {
        ejercicio = {
            pesoMax: null, oneRM: null, repsPorPeso: new Map(),
            duracionMax: null, volumenMax: null,
        };
        tipos.set(tipo, ejercicio);
    }
    return ejercicio;
};

const actualizarMaximo = (anterior: number | null, valor: number): number | null =>
    Number.isFinite(valor) && valor > 0 && (anterior == null || valor > anterior) ? valor : anterior;

const acumularBaseSesion = (base: BaseRecordesPersonales, rutina: Rutina): void => {
    for (const sesion of rutina.sesiones ?? []) {
        if (sesion.enCurso) continue;
        const volumenPorEjercicio = new Map<string, number>();
        for (const ej of sesion.ejercicios ?? []) {
            if (!ej.ejercicioId) continue;
            const tipo = tipoEjercicioDe(ej);
            const ejercicio = baseEjercicioDe(base, ej.ejercicioId, tipo);
            for (const serie of ej.series ?? []) {
                if (!serieConDatos(serie)) continue;
                if (tipo === "peso") {
                    const peso = Number(serie.peso);
                    const reps = Number(serie.reps);
                    ejercicio.pesoMax = actualizarMaximo(ejercicio.pesoMax, peso);
                    ejercicio.oneRM = actualizarMaximo(ejercicio.oneRM, estim1RM(peso, reps) ?? 0);
                    if (Number.isFinite(peso) && peso >= 0 && Number.isFinite(reps) && reps > 0) {
                        ejercicio.repsPorPeso.set(
                            peso,
                            actualizarMaximo(ejercicio.repsPorPeso.get(peso) ?? null, reps) ?? 0,
                        );
                    }
                    const volumen = volumenSerie(serie);
                    if (Number.isFinite(volumen) && volumen > 0) {
                        volumenPorEjercicio.set(ej.ejercicioId,
                            (volumenPorEjercicio.get(ej.ejercicioId) ?? 0) + volumen);
                    }
                } else {
                    ejercicio.duracionMax = actualizarMaximo(ejercicio.duracionMax, segundosSerie(serie));
                }
            }
        }
        for (const [id, volumen] of volumenPorEjercicio) {
            const ejercicio = baseEjercicioDe(base, id, "peso");
            ejercicio.volumenMax = actualizarMaximo(ejercicio.volumenMax, volumen);
        }
        const volumenActual = volumenSesion(sesion);
        base.volumenSesionMax = actualizarMaximo(base.volumenSesionMax, volumenActual);
    }
};

export const cargarBaseRecordesPersonales = async (rutinaActual: Rutina): Promise<BaseRecordesPersonales> => {
    const base = nuevaBaseRecordes();
    const idsRutinas = new Set<string>();
    if (rutinaActual.id) idsRutinas.add(rutinaActual.id);
    acumularBaseSesion(base, rutinaActual);

    const archivos = archivosMdEnCarpeta(carpetaDatos())
        .filter(f => f.path.endsWith(SUFIJO_MD));
    for (const archivo of archivos) {
        const lectura = await leerNotaDatos<Rutina>(archivo.path);
        if (lectura.error) throw new Error(lectura.error);
        const rutina = lectura.datos;
        if (!esRutinaFormatoActual(rutina)) continue;
        if (!rutina.id) throw new Error(`El archivo ${archivo.path} no contiene una rutina válida.`);
        if (idsRutinas.has(rutina.id)) continue;
        idsRutinas.add(rutina.id);
        acumularBaseSesion(base, rutina);
    }
    return base;
};

export const detectarRecordesSesion = (
    sesion: Sesion,
    base: BaseRecordesPersonales,
): RecordeDetectado[] => {
    const detectados: RecordeDetectado[] = [];
    const mejores = new Map<string, RecordeDetectado>();
    const candidato = (
        metrica: MetricaRecorde,
        ejercicioId: string,
        indiceEjercicio: number,
        indiceSerie: number,
        valor: number,
        peso?: number,
    ): void => {
        if (!Number.isFinite(valor) || valor <= 0) return;
        const tipo = tipoEjercicioDe(sesion.ejercicios[indiceEjercicio]);
        const clave = `${metrica}\u0000${tipo}\u0000${ejercicioId}\u0000${peso ?? ""}`;
        const previo = mejores.get(clave);
        if (!previo || valor > previo.valor) {
            mejores.set(clave, { metrica, ejercicioId, indiceEjercicio, indiceSerie, valor, ...(peso == null ? {} : { peso }) });
        }
    };

    const volumenEjercicio = new Map<string, { id: string; acumulado: number; cruzado: boolean }>();
    let volumenTotal = 0, cruzoVolumenSesion = false;
    const volumenSesionAnterior = base.volumenSesionMax ?? 0;
    for (const [indiceEjercicio, ej] of (sesion.ejercicios ?? []).entries()) {
        const id = ej.ejercicioId;
        if (!id) continue;
        const tipo = tipoEjercicioDe(ej);
        const baseEjercicio = base.ejercicios.get(id)?.get(tipo);
        const claveVolumen = `${tipo}\u0000${id}`;
        let estadoVolumen = volumenEjercicio.get(claveVolumen);
        if (!estadoVolumen) {
            estadoVolumen = { id, acumulado: 0, cruzado: false };
            volumenEjercicio.set(claveVolumen, estadoVolumen);
        }
        for (const [indiceSerie, serie] of (ej.series ?? []).entries()) {
            if (!serieConDatos(serie)) continue;
            if (tipo === "peso") {
                const peso = Number(serie.peso);
                const reps = Number(serie.reps);
                candidato("peso", id, indiceEjercicio, indiceSerie, peso);
                candidato("1rm", id, indiceEjercicio, indiceSerie, estim1RM(peso, reps) ?? 0);
                if (Number.isFinite(peso) && peso >= 0 && Number.isFinite(reps) && reps > 0) {
                    candidato("repeticiones", id, indiceEjercicio, indiceSerie, reps, peso);
                }
                const volumen = volumenSerie(serie);
                if (Number.isFinite(volumen) && volumen > 0) {
                    estadoVolumen.acumulado += volumen;
                    volumenTotal += volumen;
                    if (!estadoVolumen.cruzado && estadoVolumen.acumulado > (baseEjercicio?.volumenMax ?? 0)) {
                        detectados.push({
                            metrica: "volumen-ejercicio", ejercicioId: id,
                            indiceEjercicio, indiceSerie, valor: estadoVolumen.acumulado,
                        });
                        estadoVolumen.cruzado = true;
                    }
                    if (!cruzoVolumenSesion && volumenTotal > volumenSesionAnterior) {
                        detectados.push({
                            metrica: "volumen-sesion", ejercicioId: null,
                            indiceEjercicio, indiceSerie, valor: volumenTotal,
                        });
                        cruzoVolumenSesion = true;
                    }
                }
            } else {
                candidato("duracion", id, indiceEjercicio, indiceSerie, segundosSerie(serie));
            }
        }
    }

    for (const recorde of mejores.values()) {
        const baseEjercicio = recorde.ejercicioId
            ? base.ejercicios.get(recorde.ejercicioId)?.get(
                tipoEjercicioDe(sesion.ejercicios[recorde.indiceEjercicio]),
            )
            : undefined;
        let anterior: number | null | undefined;
        switch (recorde.metrica) {
            case "peso": anterior = baseEjercicio?.pesoMax; break;
            case "1rm": anterior = baseEjercicio?.oneRM; break;
            case "repeticiones": anterior = baseEjercicio?.repsPorPeso.get(recorde.peso ?? 0); break;
            case "duracion": anterior = baseEjercicio?.duracionMax; break;
            default: continue;
        }
        if (anterior == null || recorde.valor > anterior) detectados.push(recorde);
    }
    return detectados.sort((a, b) =>
        a.indiceEjercicio - b.indiceEjercicio || a.indiceSerie - b.indiceSerie
        || a.metrica.localeCompare(b.metrica, "es"));
};

export const adherencia = (rutina: Rutina): {
    programadas: number; hechas: number; pct: number; racha: number; mejorRacha: number;
} => {
    const fin = esFechaValida(rutina.fin) ? rutina.fin : hoy();
    const hasta = diffDias(rutina.inicio, hoy()) >= 0
        ? (tsDe(hoy()) > tsDe(fin) ? fin : hoy()) : null;
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

export const semanaActual = (rutina: Rutina): number => {
    const d = diffDias(rutina.inicio, hoy()) + 1;
    if (d <= 0) return 0;
    const total = semanasTotales(rutina) || 1;
    return Math.min(Math.ceil(d / 7), total);
};

export const transcurrida = (rutina: Rutina): boolean =>
    esFechaValida(rutina.fin) && tsDe(rutina.fin) < tsAhora();

export interface EntradaHistorial {
    fecha: string;
    diaId: string;
    tipoEjercicio: TipoEjercicio;
    repsPesoDuranteTiempo: boolean;
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

export const historialEjercicio = (rutina: Rutina, ejercicioId: string): EntradaHistorial[] => {
    const out: EntradaHistorial[] = [];
    for (const s of rutina.sesiones ?? []) {
        const ej = (s.ejercicios ?? []).find(e => e.ejercicioId === ejercicioId);
        if (!ej) continue;

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
            repsPesoDuranteTiempo: tipoEjercicio === "tiempo" && ej.repsPesoDuranteTiempo === true,
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

export interface EntradaHistorialGlobal extends EntradaHistorial {
    rutinaNombre: string;
    diaNombre: string;
}

export interface ProgresionEjercicioGlobal {
    ejercicioId: string;
    nombre: string;
    tipoEjercicio: TipoEjercicio;
    historial: (EntradaHistorialGlobal & { rutinaId: string })[];
}

export const progresionGlobal = async (): Promise<ProgresionEjercicioGlobal[]> => {
    const archivos = archivosMdEnCarpeta(carpetaDatos())
        .filter(f => f.path.endsWith(SUFIJO_MD));
    const porEjercicio = new Map<string, ProgresionEjercicioGlobal>();
    for (const archivo of archivos) {
        const lectura = await leerNotaDatos<Rutina>(archivo.path);
        if (lectura.error) throw new Error(lectura.error);
        const rutina = lectura.datos;
        if (!esRutinaFormatoActual(rutina)) continue;
        if (!rutina.id) throw new Error(`El archivo ${archivo.path} no contiene una rutina válida.`);
        const completa: Rutina = {
            ...rutina,
            sesiones: (rutina.sesiones ?? []).filter(s => !s.enCurso),
        };
        for (const ejercicio of ejerciciosConDatos(completa)) {
            for (const entrada of historialEjercicio(completa, ejercicio.id)) {
                if (!esFechaValida(entrada.fecha)) continue;
                const clave = `${ejercicio.id}\u0000${entrada.tipoEjercicio}`;
                let progresion = porEjercicio.get(clave);
                if (!progresion) {
                    progresion = {
                        ejercicioId: ejercicio.id,
                        nombre: ejercicio.nombre,
                        tipoEjercicio: entrada.tipoEjercicio,
                        historial: [],
                    };
                    porEjercicio.set(clave, progresion);
                }
                progresion.historial.push({
                    ...entrada,
                    rutinaId: rutina.id,
                    rutinaNombre: rutina.nombre || archivo.basename,
                    diaNombre: rutina.dias?.find(d => d.id === entrada.diaId)?.nombre ?? entrada.diaId,
                });
            }
        }
    }
    return [...porEjercicio.values()]
        .map(p => ({
            ...p,
            historial: p.historial.sort((a, b) =>
                a.fecha.localeCompare(b.fecha) || a.rutinaNombre.localeCompare(b.rutinaNombre, "es")),
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")
            || a.tipoEjercicio.localeCompare(b.tipoEjercicio, "es"));
};

export const historialEjercicioGlobal = async (ejercicioId: string): Promise<EntradaHistorialGlobal[]> => {
    const archivos = archivosMdEnCarpeta(carpetaDatos())
        .filter(f => f.path.endsWith(SUFIJO_MD));
    const historial: EntradaHistorialGlobal[] = [];
    for (const archivo of archivos) {
        const lectura = await leerNotaDatos<Rutina>(archivo.path);
        if (lectura.error) throw new Error(lectura.error);
        const rutina = lectura.datos;
        if (!esRutinaFormatoActual(rutina)) continue;
        if (!rutina.id) throw new Error(`El archivo ${archivo.path} no contiene una rutina válida.`);
        const completa: Rutina = {
            ...rutina,
            sesiones: (rutina.sesiones ?? []).filter(s => !s.enCurso),
        };
        for (const entrada of historialEjercicio(completa, ejercicioId)) {
            historial.push({
                ...entrada,
                rutinaNombre: rutina.nombre || archivo.basename,
                diaNombre: rutina.dias?.find(d => d.id === entrada.diaId)?.nombre ?? entrada.diaId,
            });
        }
    }
    return historial.sort((a, b) =>
        a.fecha.localeCompare(b.fecha) || a.rutinaNombre.localeCompare(b.rutinaNombre, "es"));
};

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

export const esLibre = (rutina?: Rutina | null): boolean => rutina?.tipo === "libre";

export const idEjercicioLibre = (nombre: string): string => `ej-${slug(nombre)}`;

export const catalogoEjercicios = (rutina: Rutina): EjercicioCatalogo[] =>
    ejerciciosConDatos(rutina ?? ({} as Rutina))
        .filter(x => x?.id && x?.nombre)
        .map(x => ({ id: x.id, nombre: x.nombre, dia: x.dia }));

export const catalogoEjerciciosTodas = async (rutinaActual?: Rutina | null): Promise<EjercicioCatalogo[]> => {
    const propios: EjercicioCatalogo[] = (rutinaActual ? catalogoEjercicios(rutinaActual) : [])
        .map(x => ({ ...x, rutina: "" }));
    const nombres = new Set(propios.map(x => norm(x.nombre)));
    const ids = new Set(propios.map(x => x.id));
    const ajenos: EjercicioCatalogo[] = [];

    let archivos: { path: string; basename: string }[] = [];
    try {

        archivos = archivosMdEnCarpeta(carpetaDatos());
    } catch { archivos = []; }

    for (const f of archivos) {
        const r = await leerNotaDatos<Rutina>(f.path);
        if (r.error || !esRutinaFormatoActual(r.datos) || r.datos.id === rutinaActual?.id) continue;
        const origen = r.datos.nombre || f.basename;
        for (const x of catalogoEjercicios(r.datos)) {
            const k = norm(x.nombre);
            if (!x?.id || !k || nombres.has(k) || ids.has(x.id)) continue;
            nombres.add(k); ids.add(x.id);
            ajenos.push({ id: x.id, nombre: x.nombre, dia: x.dia, rutina: origen });
        }
    }
    ajenos.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return [...propios, ...ajenos];
};

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

export const tipoSerieDeRutina =
    (rutina: Rutina | null | undefined, ejercicioId: string): TipoSerie | null => {
        for (const d of rutina?.dias ?? []) {
            for (const e of (d.ejercicios ?? [])) {
                if (e.id === ejercicioId) return e.tipoSerie ?? null;
            }
        }
        return null;
    };

export const tipoEjercicioDeRutina =
    (rutina: Rutina | null | undefined, ejercicioId: string): TipoEjercicio => {
        for (const d of rutina?.dias ?? []) {
            for (const e of (d.ejercicios ?? [])) {
                if (e.id === ejercicioId) return tipoEjercicioDe(e);
            }
        }
        return "peso";
    };

export const resumenLibre = (rutina: Rutina): {
    dias: number; fechas: string[]; racha: number; mejorRacha: number;
} => {
    const fechas = [...new Set((rutina.sesiones ?? [])
        .filter(s => esFechaValida(s.fecha) && !s.enCurso)
        .map(s => s.fecha))].sort();
    const semanas = new Set(fechas.map(lunesDe));

    let lunes = lunesDe(hoy());
    if (!semanas.has(lunes)) lunes = sumarDias(lunes, -7);
    let racha = 0;
    while (semanas.has(lunes) && racha < 500) { racha++; lunes = sumarDias(lunes, -7); }

    const orden = [...semanas].sort();
    let mejor = 0, seguidas = 0;
    for (let i = 0; i < orden.length; i++) {
        seguidas = (i > 0 && orden[i] === sumarDias(orden[i - 1], 7)) ? seguidas + 1 : 1;
        if (seguidas > mejor) mejor = seguidas;
    }
    return { dias: fechas.length, fechas, racha, mejorRacha: mejor };
};

export const nombreDia = (rutina: Rutina | null | undefined, diaId: string): string =>
    diaPorId(rutina ?? null, diaId)?.nombre || (diaId ? String(diaId) : "Libre");
