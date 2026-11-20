import { TFile } from "obsidian";
import { CONFIG } from "../config";
import { aplicacion } from "../estado";
import { carpetaDatos, SUFIJO_MD } from "../ajustes";
import { hoy, sumarDias, diffDias } from "../util/fechas";
import { slug, uid } from "../util/texto";
import { contenidoNotaDatos, escribirSeguro, leerNotaDatos } from "./archivos";
import { normalizarGrupos } from "./grupos";
import { enriquecerDefinicion, guardarDefinicionesEjercicio, leerCatalogoEjercicios } from "./catalogo";
import type { DiaRutina, EjercicioDef, LecturaNota, RevisionPrescripcion, Rutina, SerieSesion, TipoEjercicio, TipoSerie } from "../tipos";

export const rutinaVacia = (): Rutina => ({
    versionDatos: 2,
    id: "", nombre: "", objetivo: "",
    tipo: "planificada",
    inicio: hoy(), fin: "", semanas: CONFIG.SEMANAS_POR_DEFECTO,
    diasSemana: [],
    dias: [],
    sesiones: [],
    notasDia: [],
    estado: "activa",
    creado: "", modificado: "",
});

export const ejercicioVacio = (): EjercicioDef =>
    ({ id: "", nombre: "", grupos: [], tipoEjercicio: null, tipoBloqueEspecial: null, series: 3, repsObjetivo: 8, pesoObjetivo: null,
       duracionObjetivo: null, descansoSeg: 90, trabajoSeg: null, transicionSeg: null,
       notas: "", tipoSerie: null });

export const textoRepsObjetivo =
    (ej: Pick<EjercicioDef, "repsObjetivo" | "tipoSerie"> | undefined | null): string => {
        if (!ej) return "–";
        if (tipoSerieDe(ej) === "fallo") return "al fallo";
        return ej.repsObjetivo != null ? String(ej.repsObjetivo) : "–";
    };

export const diaVacio = (): DiaRutina =>
    ({ id: "", nombre: "", diasSemana: [], ejercicios: [], etiquetasPersonalizadas: [] });

export const tipoEjercicioDe =
    (ej: Pick<EjercicioDef, "tipoEjercicio" | "tipoBloqueEspecial"> | undefined | null): TipoEjercicio =>
        ej?.tipoBloqueEspecial ? "tiempo" : ej?.tipoEjercicio ?? "peso";

export const tipoSerieDe = (
    plan: Pick<EjercicioDef, "tipoSerie"> | undefined | null,
    serie?: Pick<SerieSesion, "tipoSerie"> | null,
): TipoSerie => serie?.tipoSerie ?? plan?.tipoSerie ?? "trabajo";

export const camposVisiblesEjercicio = (
    ejercicio: Pick<EjercicioDef, "tipoEjercicio" | "tipoBloqueEspecial" | "tipoSerie" | "repsPesoDuranteTiempo">,
) => {
    const tipo = tipoEjercicioDe(ejercicio);
    return {
        tipo,
        reps: tipo === "peso",
        objetivoReps: tipo === "peso" && tipoSerieDe(ejercicio) !== "fallo",
        peso: tipo === "peso" || (tipo === "tiempo" && ejercicio.repsPesoDuranteTiempo === true),
        duracion: tipo === "tiempo",
        registroTiempo: tipo === "tiempo",
        trabajo: tipo === "intervalo",
        transicion: tipo === "intervalo",
        descanso: tipo !== "intervalo",
    };
};

export const repsObjetivoDe =
    (ej: Pick<EjercicioDef, "repsObjetivo" | "tipoSerie"> | undefined | null): number | null =>
        tipoSerieDe(ej) === "fallo" ? null : ej?.repsObjetivo ?? null;

export const finDesde = (inicio: string, semanas: number): string =>
    sumarDias(inicio, Math.max(1, Number(semanas) || 1) * 7 - 1);

export const semanasTotales = (rutina: Rutina): number => {
    const s = diffDias(rutina.inicio, rutina.fin) + 1;
    return s > 0 ? Math.ceil(s / 7) : (Number(rutina.semanas) || 0);
};

export const rutaDatosDe = (id: string): string => `${carpetaDatos()}/${id}${SUFIJO_MD}`;

export const esRutinaFormatoActual = (
    rutina: Rutina | null | undefined,
): rutina is Rutina => rutina?.versionDatos === 2;

export const leerRutina = async (id: string): Promise<LecturaNota<Rutina>> => {
    const limp = String(id ?? "").trim();
    if (!limp) return { error: "No tengo el id de la rutina.", ruta: "" };
    const r = await leerNotaDatos<Rutina>(rutaDatosDe(limp));
    if (r.error) return r;
    if (!esRutinaFormatoActual(r.datos)) {
        return { error: `El archivo ${r.ruta} usa un formato anterior; se ignora y no se modifica.`, ruta: r.ruta };
    }
    if (!r.datos?.id) return { error: `El archivo ${r.ruta} no tiene una rutina dentro.`, ruta: r.ruta };
    const catalogo = await leerCatalogoEjercicios();
    r.datos.dias = (r.datos.dias ?? []).map(d => ({ ...d, ejercicios: (d.ejercicios ?? []).map(e => enriquecerDefinicion(e, catalogo)) }));
    return r;
};

const camposPrescripcion = [
    "series", "repsObjetivo", "pesoObjetivo", "duracionObjetivo", "repsPesoDuranteTiempo",
    "descansoSeg", "trabajoSeg", "transicionSeg", "notas", "tipoSerie", "tipoEjercicio", "tipoBloqueEspecial",
] as const;

const snapshotDias = (dias: DiaRutina[]): DiaRutina[] =>
    JSON.parse(JSON.stringify(dias ?? [])) as DiaRutina[];

const clavePrescripcion = (dias: DiaRutina[]): string => JSON.stringify((dias ?? []).map(dia => ({
    id: dia.id,
    ejercicios: (dia.ejercicios ?? []).map(ejercicio => ({
        id: ejercicio.id,
        ...Object.fromEntries(camposPrescripcion.map(campo => [campo, ejercicio[campo]])),
    })),
})));

const cambiosPrescripcion = (antes: DiaRutina[], despues: DiaRutina[]): string[] => {
    const mapa = (dias: DiaRutina[]) => new Map((dias ?? []).flatMap(dia =>
        (dia.ejercicios ?? []).map(ejercicio => [
            dia.id + "::" + ejercicio.id,
            { nombre: ejercicio.nombre || ejercicio.id, valor: JSON.stringify({
                id: ejercicio.id,
                ...Object.fromEntries(camposPrescripcion.map(campo => [campo, ejercicio[campo]])),
            }) },
        ] as const)));
    const a = mapa(antes), b = mapa(despues);
    const claves = new Set([...a.keys(), ...b.keys()]);
    return [...claves].filter(clave => a.get(clave)?.valor !== b.get(clave)?.valor)
        .map(clave => b.get(clave)?.nombre ?? a.get(clave)?.nombre ?? clave);
};
export const escribirRutina = async (rutina: Rutina): Promise<string> => {
    if (!rutina?.id) throw new Error("La rutina no tiene id.");
    const ruta = rutaDatosDe(rutina.id);
    await guardarDefinicionesEjercicio((rutina.dias ?? []).flatMap(d => d.ejercicios ?? []));
    let anterior: Rutina | undefined;
    if (aplicacion().vault.getAbstractFileByPath(ruta)) {
        const previa = await leerNotaDatos<Rutina>(ruta);
        if (previa.error) throw new Error(previa.error);
        if (!esRutinaFormatoActual(previa.datos)) {
            throw new Error(`El archivo ${ruta} usa un formato anterior; no se modifica.`);
        }
        anterior = previa.datos;
    }
    delete (rutina as Rutina & { plantillaOrigen?: string | null }).plantillaOrigen;
    const motivo = String(rutina.motivoProximaRevision ?? "").trim();
    delete rutina.motivoProximaRevision;
    if (anterior && clavePrescripcion(anterior.dias ?? []) !== clavePrescripcion(rutina.dias ?? [])) {
        const catalogoRevision = await leerCatalogoEjercicios();
        const antesDias = (anterior.dias ?? []).map(dia => ({ ...dia, ejercicios: (dia.ejercicios ?? []).map(ejercicio => enriquecerDefinicion(ejercicio, catalogoRevision)) }));
        const despuesDias = (rutina.dias ?? []).map(dia => ({ ...dia, ejercicios: (dia.ejercicios ?? []).map(ejercicio => enriquecerDefinicion(ejercicio, catalogoRevision)) }));
        const cambios = cambiosPrescripcion(antesDias, despuesDias);
        const revisiones: RevisionPrescripcion[] = [...(anterior.revisionesPrescripcion ?? rutina.revisionesPrescripcion ?? [])];
        revisiones.push({
            id: uid("revision"),
            fecha: hoy(),
            motivo: motivo || "Corrección de prescripción",
            alcance: cambios.length === 1 ? "ejercicio" : "rutina",
            cambios,
            antes: snapshotDias(antesDias),
            despues: snapshotDias(despuesDias),
        });
        rutina.revisionesPrescripcion = revisiones;
    } else if (anterior?.revisionesPrescripcion && !rutina.revisionesPrescripcion) {
        rutina.revisionesPrescripcion = anterior.revisionesPrescripcion;
    }
    rutina.versionDatos = 2;
    const serializada: Rutina = {
        ...rutina,
        dias: (rutina.dias ?? []).map(dia => ({
            ...dia,
            etiquetasPersonalizadas: normalizarGrupos(dia.etiquetasPersonalizadas),
            ejercicios: (dia.ejercicios ?? []).map(ejercicio => {
                const { nombre: _nombre, grupos: _grupos, implemento: _implemento,
                    modalidadCarga: _modalidad, numeroMancuernas: _mancuernas, ...prescripcion } = ejercicio;
                return prescripcion as unknown as EjercicioDef;
            }),
        })),
    };
    serializada.modificado = hoy();
    await escribirSeguro(ruta, contenidoNotaDatos(serializada));
    return ruta;
};

export const borrarRutina = async (id: string): Promise<void> => {
    const ruta = rutaDatosDe(id);
    const f = aplicacion().vault.getAbstractFileByPath(ruta);
    if (f instanceof TFile) {
        const lectura = await leerNotaDatos<Rutina>(ruta);
        if (lectura.error) throw new Error(lectura.error);
        if (!esRutinaFormatoActual(lectura.datos)) {
            throw new Error(`El archivo ${ruta} usa un formato anterior; no se modifica.`);
        }
        await aplicacion().fileManager.trashFile(f);
    }
};

export const idNuevo = async (nombre: string, prefijoFecha = hoy().slice(0, 7)): Promise<string> => {
    const base = `rutina-${prefijoFecha}-${slug(nombre) || "sin-nombre"}`;
    let id = base, n = 2;
    while (aplicacion().vault.getAbstractFileByPath(rutaDatosDe(id))) id = `${base}-${n++}`;
    return id;
};
