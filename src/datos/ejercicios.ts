import { carpetaDatos } from "../ajustes";
import { limpiarNombre } from "../util";
import { archivosMdEnCarpeta, leerNotaDatos } from "./archivos";
import { escribirRutina } from "./rutinas";
import { actualizarPlantilla, leerPlantilla, listarPlantillas } from "./plantillas";
import { cargarGrupos, gruposEnMemoria } from "./grupos";
import type { Rutina } from "../tipos";

export interface EjercicioGestion {
    id: string;
    nombre: string;
    grupo: string;
    rutinas: string[];
    plantillas: string[];
    apariciones: number;
}

const archivosRutinas = (): { path: string }[] => {
    try {
        return archivosMdEnCarpeta(carpetaDatos());
    } catch { return []; }
};

interface Cuenta {
    nombres: Map<string, number>;
    rutinas: Set<string>;
    plantillas: Set<string>;
    n: number;
}

export const catalogoGestion = async (): Promise<EjercicioGestion[]> => {
    await cargarGrupos();
    const mapa = new Map<string, Cuenta>();
    const apuntar = (id: string, nombre: string, donde: string, esPlantilla: boolean): void => {
        if (!id) return;
        let c = mapa.get(id);
        if (!c) { c = { nombres: new Map(), rutinas: new Set(), plantillas: new Set(), n: 0 }; mapa.set(id, c); }
        const nom = String(nombre ?? "").trim();
        if (nom) c.nombres.set(nom, (c.nombres.get(nom) ?? 0) + 1);
        (esPlantilla ? c.plantillas : c.rutinas).add(donde);
        c.n++;
    };

    for (const f of archivosRutinas()) {
        const r = await leerNotaDatos<Rutina>(f.path);
        if (r.error || !r.datos?.id) continue;
        const rut = r.datos;
        for (const d of rut.dias ?? []) for (const e of d.ejercicios ?? []) apuntar(e.id, e.nombre, rut.id, false);
        for (const s of rut.sesiones ?? []) for (const e of s.ejercicios ?? []) apuntar(e.ejercicioId, e.nombre, rut.id, false);
    }
    for (const nom of listarPlantillas()) {
        const r = await leerPlantilla(nom);
        if (r.error || !r.datos) continue;
        for (const d of r.datos.dias ?? []) for (const e of d.ejercicios ?? []) apuntar(e.id, e.nombre, nom, true);
    }

    const grupos = gruposEnMemoria();
    const fuera: EjercicioGestion[] = [];
    for (const [id, c] of mapa) {
        let nombre = "";
        let mejor = -1;
        for (const [nom, n] of c.nombres) if (n > mejor) { nombre = nom; mejor = n; }
        fuera.push({
            id, nombre, grupo: grupos[id] ?? "",
            rutinas: [...c.rutinas], plantillas: [...c.plantillas], apariciones: c.n,
        });
    }
    fuera.sort((a, b) => a.nombre.localeCompare(b.nombre, "es") || a.id.localeCompare(b.id));
    return fuera;
};

export interface ResultadoRenombre { rutinas: number; plantillas: number; }

export const renombrarEjercicio = async (id: string, nombreNuevo: string): Promise<ResultadoRenombre> => {
    const limpio = limpiarNombre(nombreNuevo);
    if (!limpio) throw new Error("El nombre no puede quedar vacío.");
    let nRutinas = 0, nPlantillas = 0;

    for (const f of archivosRutinas()) {
        const r = await leerNotaDatos<Rutina>(f.path);
        if (r.error || !r.datos?.id) continue;
        let cambio = false;
        for (const d of r.datos.dias ?? []) for (const e of d.ejercicios ?? []) {
            if (e.id === id && e.nombre !== limpio) { e.nombre = limpio; cambio = true; }
        }
        for (const s of r.datos.sesiones ?? []) for (const e of s.ejercicios ?? []) {
            if (e.ejercicioId === id && e.nombre !== limpio) { e.nombre = limpio; cambio = true; }
        }
        if (cambio) { await escribirRutina(r.datos); nRutinas++; }
    }

    for (const nom of listarPlantillas()) {
        const r = await leerPlantilla(nom);
        if (r.error || !r.datos) continue;
        let cambio = false;
        for (const d of r.datos.dias ?? []) for (const e of d.ejercicios ?? []) {
            if (e.id === id && e.nombre !== limpio) { e.nombre = limpio; cambio = true; }
        }
        if (cambio) { await actualizarPlantilla(nom, r.datos); nPlantillas++; }
    }
    return { rutinas: nRutinas, plantillas: nPlantillas };
};
