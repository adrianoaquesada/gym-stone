import { carpetaDatos, SUFIJO_MD } from "../ajustes";
import { archivosMdEnCarpeta, leerNotaDatos } from "./archivos";
import type { Indice, IndiceRutina, Rutina } from "../tipos";

export const indiceVacio = (): Indice => ({ version: 1, rutinas: [] });

export const entradaDeRutina = (rutina: Rutina): IndiceRutina => ({
    id: rutina.id,
    nombre: rutina.nombre || "Sin nombre",
    estado: (["activa", "pausada", "finalizada"].includes(String(rutina.estado))
        ? rutina.estado : "activa"),
    tipo: rutina.tipo === "libre" ? "libre" : "planificada",
    inicio: rutina.inicio || "",
    fin: rutina.fin || "",
    semanas: Number(rutina.semanas) || 0,
    sesiones: (rutina.sesiones ?? []).filter(s => !s.enCurso).length,
    creada: rutina.creado || "",
    modificada: rutina.modificado || "",
});

/** Construye el índice en memoria. Nunca crea ni modifica archivos del vault. */
export const leerIndice = async (): Promise<{ indice: Indice; error?: string }> => {
    const archivos = archivosMdEnCarpeta(carpetaDatos())
        .filter(archivo => archivo.name.endsWith(SUFIJO_MD));

    const resultados = await Promise.all(archivos.map(async archivo => {
        const lectura = await leerNotaDatos<Rutina>(archivo.path);
        if (lectura.error) return { error: lectura.error };
        const rutina = lectura.datos;
        if (!rutina || rutina.versionDatos !== 2 || typeof rutina.id !== "string" || !rutina.id) {
            return { error: `El archivo ${archivo.path} no contiene una rutina válida; se omite.` };
        }
        const idArchivo = archivo.name.slice(0, -SUFIJO_MD.length);
        if (rutina.id !== idArchivo) {
            return { error: `El id de la rutina no coincide con el nombre del archivo ${archivo.path}; se omite.` };
        }
        return { entrada: entradaDeRutina(rutina) };
    }));

    const rutinas = resultados
        .flatMap(resultado => "entrada" in resultado && resultado.entrada ? [resultado.entrada] : [])
        .sort((a, b) =>
            (b.modificada ?? "").localeCompare(a.modificada ?? "")
            || a.nombre.localeCompare(b.nombre, "es"));
    const errores = resultados.flatMap(resultado => "error" in resultado && resultado.error ? [resultado.error] : []);

    return {
        indice: { version: 1, rutinas },
        ...(errores.length ? {
            error: `No se pudieron incluir ${errores.length} archivo(s) de rutina: ${errores.join(" · ")}`,
        } : {}),
    };
};
