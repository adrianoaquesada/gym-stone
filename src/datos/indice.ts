import { rutaIndice } from "../ajustes";
import { contenidoNotaDatos, leerNotaDatos, escribirSeguro } from "./archivos";
import type { Indice, IndiceRutina, Rutina } from "../tipos";

export const indiceVacio = (): Indice => ({ version: 1, rutinas: [] });

export { rutaIndice };

export const entradaDeRutina = (rutina: Rutina): IndiceRutina => ({
    id: rutina.id,
    nombre: rutina.nombre || "Sin nombre",
    estado: rutina.estado || "activa",
    tipo: rutina.tipo === "libre" ? "libre" : "planificada",
    inicio: rutina.inicio,
    fin: rutina.fin,
    semanas: rutina.semanas,
    sesiones: (rutina.sesiones ?? []).filter(s => !s.enCurso).length,
    creada: rutina.creado,
    modificada: rutina.modificado,
});

export const leerIndice = async (): Promise<{ indice: Indice; error?: string }> => {
    const ruta = rutaIndice();
    const r = await leerNotaDatos<Indice>(ruta);
    if (r.error) {
        if (r.error.includes("No existe")) return { indice: indiceVacio() };
        return { indice: indiceVacio(), error: r.error };
    }
    const d = r.datos;
    if (!d || !Array.isArray(d.rutinas)) return { indice: indiceVacio() };

    const rutinas: IndiceRutina[] = d.rutinas
        .filter(f => f && typeof f.id === "string" && f.id)
        .map(f => ({
            id: String(f.id),
            nombre: String(f.nombre ?? "Sin nombre"),
            estado: (["activa", "pausada", "finalizada"].includes(String(f.estado)) ? f.estado : "activa"),
            tipo: f.tipo === "libre" ? "libre" : "planificada",
            inicio: String(f.inicio ?? ""),
            fin: String(f.fin ?? ""),
            semanas: Number(f.semanas) || 0,
            sesiones: Number(f.sesiones) || 0,
            creada: String(f.creada ?? ""),
            modificada: String(f.modificada ?? ""),
        }));
    return { indice: { version: 1, rutinas } };
};

export const escribirIndice = async (indice: Indice): Promise<void> => {

    indice.rutinas = [...indice.rutinas].sort((a, b) =>
        (b.modificada ?? "").localeCompare(a.modificada ?? "") || a.nombre.localeCompare(b.nombre, "es"));
    await escribirSeguro(rutaIndice(), contenidoNotaDatos(indice));
};

export const guardarEnIndice = async (rutina: Rutina): Promise<void> => {
    const { indice } = await leerIndice();
    const nueva = entradaDeRutina(rutina);
    const p = indice.rutinas.findIndex(f => f.id === nueva.id);
    if (p >= 0) indice.rutinas[p] = nueva;
    else indice.rutinas.push(nueva);
    await escribirIndice(indice);
};

export const quitarDeIndice = async (id: string): Promise<void> => {
    const { indice } = await leerIndice();
    const antes = indice.rutinas.length;
    indice.rutinas = indice.rutinas.filter(f => f.id !== id);
    if (indice.rutinas.length !== antes) await escribirIndice(indice);
};
