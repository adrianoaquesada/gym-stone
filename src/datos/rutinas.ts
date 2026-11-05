import { TFile } from "obsidian";
import { CONFIG } from "../config";
import { aplicacion } from "../estado";
import { carpetaDatos, SUFIJO_MD } from "../ajustes";
import { hoy, sumarDias, diffDias } from "../util/fechas";
import { slug } from "../util/texto";
import { contenidoNotaDatos, escribirSeguro, leerNotaDatos } from "./archivos";
import { normalizarGrupos } from "./grupos";
import { guardarEnIndice, quitarDeIndice } from "./indice";
import type { DiaRutina, EjercicioDef, LecturaNota, Rutina, SerieSesion, TipoEjercicio, TipoSerie } from "../tipos";

export const rutinaVacia = (): Rutina => ({
    versionDatos: 2,
    id: "", nombre: "", objetivo: "",
    plantillaOrigen: null,
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
    return r;
};

export const escribirRutina = async (rutina: Rutina): Promise<string> => {
    if (!rutina?.id) throw new Error("La rutina no tiene id.");
    const ruta = rutaDatosDe(rutina.id);
    if (aplicacion().vault.getAbstractFileByPath(ruta)) {
        const previa = await leerNotaDatos<Rutina>(ruta);
        if (previa.error) throw new Error(previa.error);
        if (!esRutinaFormatoActual(previa.datos)) {
            throw new Error(`El archivo ${ruta} usa un formato anterior; no se modifica.`);
        }
        if (rutina.plantillaOrigen === undefined) {
            rutina.plantillaOrigen = previa.datos.plantillaOrigen ?? null;
        }
    }
    rutina.versionDatos = 2;
    rutina.dias = (rutina.dias ?? []).map(dia => ({
        ...dia,
        etiquetasPersonalizadas: normalizarGrupos(dia.etiquetasPersonalizadas),
        ejercicios: (dia.ejercicios ?? []).map(ejercicio => ({
            ...ejercicio,
            grupos: normalizarGrupos(ejercicio.grupos),
        })),
    }));
    rutina.modificado = hoy();
    await escribirSeguro(ruta, contenidoNotaDatos(rutina));
    await guardarEnIndice(rutina);
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
        const previo = await aplicacion().vault.read(f);
        const bak = aplicacion().vault.getAbstractFileByPath(`${ruta}.bak`);
        if (bak instanceof TFile) await aplicacion().vault.modify(bak, previo);
        else await aplicacion().vault.create(`${ruta}.bak`, previo);
        await aplicacion().fileManager.trashFile(f);
    }
    await quitarDeIndice(id);
};

export const idNuevo = async (nombre: string, prefijoFecha = hoy().slice(0, 7)): Promise<string> => {
    const base = `rutina-${prefijoFecha}-${slug(nombre) || "sin-nombre"}`;
    let id = base, n = 2;
    while (aplicacion().vault.getAbstractFileByPath(rutaDatosDe(id))) id = `${base}-${n++}`;
    return id;
};
