import { carpetaDatos } from "../ajustes";
import { limpiarNombre } from "../util";
import { archivosMdEnCarpeta, leerNotaDatos } from "./archivos";
import { cargarGrupos, gruposEnMemoria, normalizarGrupos } from "./grupos";
import { esBloqueEspecial } from "./calculos";
import { leerCatalogoEjercicios, guardarCatalogoEjercicios, type EjercicioCatalogoDef } from "./catalogo";
import type { Rutina } from "../tipos";

export interface EjercicioGestion extends EjercicioCatalogoDef {
    rutinas: string[];
    apariciones: number;
}

const archivosRutinas = (): { path: string }[] => {
    try { return archivosMdEnCarpeta(carpetaDatos()).filter(f => f.name.endsWith(".gym-stone.md")); }
    catch { return []; }
};

export const catalogoGestion = async (): Promise<EjercicioGestion[]> => {
    await cargarGrupos();
    const base = await leerCatalogoEjercicios();
    const uso = new Map<string, { rutinas: Set<string>; n: number; nombre?: string }>();
    for (const f of archivosRutinas()) {
        const r = await leerNotaDatos<Rutina>(f.path);
        if (r.error || r.datos?.versionDatos !== 2 || !r.datos.id) continue;
        for (const d of r.datos.dias ?? []) for (const e of d.ejercicios ?? []) {
            if (!e.id || esBloqueEspecial(e)) continue;
            const v = uso.get(e.id) ?? { rutinas: new Set<string>(), n: 0 };
            v.rutinas.add(r.datos.id); v.n++; if (e.nombre) v.nombre = e.nombre; uso.set(e.id, v);
        }
        for (const s of r.datos.sesiones ?? []) for (const e of s.ejercicios ?? []) {
            if (!e.ejercicioId || esBloqueEspecial(e)) continue;
            const v = uso.get(e.ejercicioId) ?? { rutinas: new Set<string>(), n: 0 };
            v.rutinas.add(r.datos.id); v.n++; uso.set(e.ejercicioId, v);
        }
    }
    const grupos = gruposEnMemoria();
    const todos = new Map(base.map(e => [e.id, e]));
    for (const [id, u] of uso) if (!todos.has(id)) {
        todos.set(id, { id, nombre: u.nombre ?? id, grupos: normalizarGrupos(grupos[id]), implemento: "otro", modalidadCarga: "externa", numeroMancuernas: 2 });
    }
    return [...todos.values()].map(e => ({ ...e, grupos: Object.prototype.hasOwnProperty.call(grupos,e.id) ? grupos[e.id] : e.grupos,
        rutinas: [...(uso.get(e.id)?.rutinas ?? [])], apariciones: uso.get(e.id)?.n ?? 0 }))
        .sort((a,b)=>a.nombre.localeCompare(b.nombre,"es") || a.id.localeCompare(b.id));
};

export interface ResultadoRenombre { rutinas: number; }
export const renombrarEjercicio = async (id: string, nombreNuevo: string): Promise<ResultadoRenombre> => {
    const limpio = limpiarNombre(nombreNuevo);
    if (!limpio) throw new Error("El nombre no puede quedar vacío.");
    const catalogo = await leerCatalogoEjercicios();
    const e = catalogo.find(x=>x.id===id);
    if (!e) throw new Error("El ejercicio no existe en el catálogo independiente.");
    e.nombre = limpio;
    await guardarCatalogoEjercicios(catalogo);
    return { rutinas: 0 };
};
