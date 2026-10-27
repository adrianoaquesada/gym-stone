/* ═══════════════════════════════════════════════════════════════════════════
   Plantillas de rutina: estructura reutilizable sin fechas ni registros.
   ═══════════════════════════════════════════════════════════════════════════ */

import { TFile } from "obsidian";
import { aplicacion } from "../estado";
import { carpetaPlantillas } from "../ajustes";
import { limpiarNombre } from "../util/texto";
import { contenidoNotaDatos, archivosMdEnCarpeta, escribirSeguro, leerNotaDatos } from "./archivos";
import type { LecturaNota, PlantillaRutina, Rutina } from "../tipos";

export const listarPlantillas = (): string[] => {
    try {
        return archivosMdEnCarpeta(carpetaPlantillas())
            .map(f => f.basename)
            .sort((a, b) => a.localeCompare(b, "es"));
    } catch { return []; }
};

export const leerPlantilla = (nombre: string): Promise<LecturaNota<PlantillaRutina>> =>
    leerNotaDatos<PlantillaRutina>(`${carpetaPlantillas()}/${nombre}.md`);

// ¿Ya existe una plantilla con este nombre? (nunca se pisa sin permiso)
export const plantillaExiste = (nombre: string): boolean => Boolean(
    typeof nombre === "string" && limpiarNombre(nombre) &&
    aplicacion().vault.getAbstractFileByPath(`${carpetaPlantillas()}/${limpiarNombre(nombre)}.md`));

export const escribirPlantilla = async (nombre: string, plantilla: PlantillaRutina): Promise<string> => {
    if (plantillaExiste(nombre)) {
        throw new Error(`Ya existe una plantilla «${limpiarNombre(nombre)}.md»: bórrala o renómbrala primero si quieres actualizarla.`);
    }
    const ruta = `${carpetaPlantillas()}/${limpiarNombre(nombre)}.md`;
    await escribirSeguro(ruta, contenidoNotaDatos(plantilla));
    return ruta;
};

// Actualiza en su sitio una plantilla YA existente (gestor de ejercicios):
// la ruta sale del nombre que devuelve listarPlantillas (el basename).
export const actualizarPlantilla = async (nombre: string, plantilla: PlantillaRutina): Promise<string> => {
    const ruta = `${carpetaPlantillas()}/${nombre}.md`;
    await escribirSeguro(ruta, contenidoNotaDatos(plantilla));
    return ruta;
};

// De una rutina completa se queda solo con lo que sirve para plantillear
export const plantillaDeRutina = (rutina: Rutina): PlantillaRutina => ({
    nombre: rutina.nombre,
    objetivo: rutina.objetivo,
    semanas: rutina.semanas,
    diasSemana: rutina.diasSemana,
    dias: (rutina.dias ?? []).map(d => ({
        id: d.id,
        nombre: d.nombre,
        diasSemana: [...(d.diasSemana ?? [])],
        ejercicios: (d.ejercicios ?? []).map(e => ({
            id: e.id,
            nombre: e.nombre,
            series: e.series,
            repsObjetivo: e.repsObjetivo,
            pesoObjetivo: e.pesoObjetivo ?? null,
            descansoSeg: e.descansoSeg ?? null,
            notas: e.notas ?? "",
        })),
    })),
});

export const esArchivoPlantilla = (f: TFile): boolean => f.path.startsWith(carpetaPlantillas() + "/");
