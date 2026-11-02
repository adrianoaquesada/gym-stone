import { TFile } from "obsidian";
import { aplicacion } from "../estado";
import { carpetaPlantillas } from "../ajustes";
import { limpiarNombre, uid } from "../util/texto";
import { contenidoNotaDatos, archivosMdEnCarpeta, escribirSeguro, leerNotaDatos } from "./archivos";
import { normalizarGrupos } from "./grupos";
import type { LecturaNota, PlantillaRutina, Rutina } from "../tipos";

export const listarPlantillas = (): string[] => {
    try {
        return archivosMdEnCarpeta(carpetaPlantillas())
            .map(f => f.basename)
            .sort((a, b) => a.localeCompare(b, "es"));
    } catch { return []; }
};

export const leerPlantilla = async (nombre: string): Promise<LecturaNota<PlantillaRutina>> => {
    const r = await leerNotaDatos<PlantillaRutina>(`${carpetaPlantillas()}/${nombre}.md`);
    if (r.error) return r;
    if (r.datos?.versionDatos !== 2) {
        return { error: `La plantilla ${r.ruta} usa un formato anterior; se ignora y no se modifica.`, ruta: r.ruta };
    }
    if (typeof r.datos.id !== "string" || !r.datos.id.trim()) {
        return { error: `La plantilla ${r.ruta} no tiene un ID válido; no se modifica.`, ruta: r.ruta };
    }
    return r;
};

export type ResultadoPlantillaOrigen =
    | { estado: "sin-origen" | "eliminada"; plantilla: null }
    | { estado: "disponible"; plantilla: PlantillaRutina }
    | { estado: "error"; error: string };

export const leerPlantillaOrigen = async (
    rutina: Pick<Rutina, "plantillaOrigen">,
): Promise<ResultadoPlantillaOrigen> => {
    const origen = rutina.plantillaOrigen?.trim();
    if (!origen) return { estado: "sin-origen", plantilla: null };
    let primerError: string | null = null;
    for (const nombre of listarPlantillas()) {
        const lectura = await leerPlantilla(nombre);
        if (lectura.error) {
            if (!lectura.error.includes("formato anterior; se ignora") && !primerError) {
                primerError = lectura.error;
            }
            continue;
        }
        if (lectura.datos?.id === origen) {
            return { estado: "disponible", plantilla: lectura.datos };
        }
    }
    if (primerError) return { estado: "error", error: primerError };
    return { estado: "eliminada", plantilla: null };
};

export const plantillaExiste = (nombre: string): boolean => Boolean(
    typeof nombre === "string" && limpiarNombre(nombre) &&
    aplicacion().vault.getAbstractFileByPath(`${carpetaPlantillas()}/${limpiarNombre(nombre)}.md`));

export const escribirPlantilla = async (nombre: string, plantilla: PlantillaRutina): Promise<string> => {
    const limpio = limpiarNombre(nombre);
    if (!limpio) throw new Error("El nombre de la plantilla no puede quedar vacío.");
    if (plantillaExiste(limpio)) {
        throw new Error(`Ya existe una plantilla «${limpio}.md»: bórrala o renómbrala primero si quieres actualizarla.`);
    }
    const ruta = `${carpetaPlantillas()}/${limpio}.md`;
    const id = plantilla.id?.trim() || uid("plantilla");
    if (await existeIdPlantilla(id)) throw new Error(`Ya existe una plantilla con el ID «${id}».`);
    await escribirSeguro(ruta, contenidoNotaDatos(normalizarPlantilla(plantilla, id)));
    return ruta;
};

const existeIdPlantilla = async (id: string): Promise<boolean> => {
    for (const nombre of listarPlantillas()) {
        const lectura = await leerPlantilla(nombre);
        if (lectura.datos?.id === id) return true;
    }
    return false;
};

const normalizarPlantilla = (plantilla: PlantillaRutina, id: string): PlantillaRutina => ({
    ...plantilla,
    versionDatos: 2,
    id,
    dias: (plantilla.dias ?? []).map(dia => ({
        ...dia,
        etiquetasPersonalizadas: normalizarGrupos(dia.etiquetasPersonalizadas),
        ejercicios: (dia.ejercicios ?? []).map(ejercicio => ({
            ...ejercicio,
            grupos: normalizarGrupos(ejercicio.grupos),
        })),
    })),
});

export const plantillaDeRutina = (rutina: Rutina): PlantillaRutina => ({
    versionDatos: 2,
    nombre: rutina.nombre,
    objetivo: rutina.objetivo,
    semanas: rutina.semanas,
    diasSemana: rutina.diasSemana,
    dias: (rutina.dias ?? []).map(d => ({
        id: d.id,
        nombre: d.nombre,
        diasSemana: [...(d.diasSemana ?? [])],
        etiquetasPersonalizadas: normalizarGrupos(d.etiquetasPersonalizadas),
        ejercicios: (d.ejercicios ?? []).map(e => ({
            id: e.id,
            nombre: e.nombre,
            grupos: normalizarGrupos(e.grupos),
            tipoEjercicio: e.tipoEjercicio ?? null,
            series: e.series,
            repsObjetivo: e.repsObjetivo,
            pesoObjetivo: e.pesoObjetivo ?? null,
            duracionObjetivo: e.duracionObjetivo ?? null,
            repsPesoDuranteTiempo: e.repsPesoDuranteTiempo ?? false,
            descansoSeg: e.descansoSeg ?? null,
            trabajoSeg: e.trabajoSeg ?? null,
            transicionSeg: e.transicionSeg ?? null,
            notas: e.notas ?? "",
            tipoSerie: e.tipoSerie ?? null,
        })),
    })),
});

export const esArchivoPlantilla = (f: TFile): boolean => f.path.startsWith(carpetaPlantillas() + "/");
