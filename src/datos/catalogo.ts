import { rutaCatalogoEjercicios } from "../ajustes";
import { contenidoNotaDatos, escribirSeguro, leerNotaDatos } from "./archivos";
import type { EjercicioDef, TipoImplemento, ModalidadCarga } from "../tipos";

export interface EjercicioCatalogoDef {
    id: string;
    nombre: string;
    grupos: string[];
    implemento: TipoImplemento;
    modalidadCarga: ModalidadCarga;
    numeroMancuernas: 1 | 2;
}
interface DatosCatalogo { versionDatos: 1; ejercicios: EjercicioCatalogoDef[]; }

const normalizarLista = (valor: unknown): string[] => {
    if (!Array.isArray(valor)) return [];
    const vistos = new Set<string>();
    return valor.flatMap(item => {
        if (typeof item !== "string") return [];
        const nombre = item.trim().replace(/\s+/g, " ");
        const clave = nombre.toLocaleLowerCase("es");
        if (!nombre || vistos.has(clave)) return [];
        vistos.add(clave); return [nombre];
    });
};

const normalizarEjercicio = (e: Partial<EjercicioCatalogoDef> & {id:string; nombre:string}): EjercicioCatalogoDef => ({
    id: e.id, nombre: String(e.nombre ?? "").trim(), grupos: normalizarLista(e.grupos),
    implemento: e.implemento === "barra" || e.implemento === "mancuernas" || e.implemento === "corporal" ? e.implemento : "otro",
    modalidadCarga: e.modalidadCarga === "corporal" || e.modalidadCarga === "corporal-extra" ? e.modalidadCarga : "externa",
    numeroMancuernas: e.numeroMancuernas === 1 ? 1 : 2,
});

export const leerCatalogoEjercicios = async (): Promise<EjercicioCatalogoDef[]> => {
    const ruta = rutaCatalogoEjercicios();
    const r = await leerNotaDatos<DatosCatalogo>(ruta);
    if (r.error) {
        if (r.error.startsWith("No existe el archivo")) return [];
        throw new Error(r.error);
    }
    if (r.datos?.versionDatos !== 1 || !Array.isArray(r.datos.ejercicios)) {
        throw new Error(`El catálogo ${ruta} tiene un formato no compatible.`);
    }
    return r.datos.ejercicios.filter(e => e && typeof e.id === "string" && typeof e.nombre === "string")
        .map(normalizarEjercicio);
};

export const guardarCatalogoEjercicios = async (ejercicios: EjercicioCatalogoDef[]): Promise<void> => {
    const unicos = new Map<string, EjercicioCatalogoDef>();
    for (const e of ejercicios) if (e.id && e.nombre.trim()) unicos.set(e.id, normalizarEjercicio(e));
    await escribirSeguro(rutaCatalogoEjercicios(), contenidoNotaDatos({ versionDatos: 1, ejercicios: [...unicos.values()] }));
};

export const guardarDefinicionesEjercicio = async (defs: EjercicioDef[]): Promise<void> => {
    if (!defs.length) return;
    const actuales = await leerCatalogoEjercicios();
    const mapa = new Map(actuales.map(e => [e.id, e]));
    for (const d of defs) {
        // Los bloques especiales no forman parte del catálogo y pueden no tener nombre.
        if (d.tipoBloqueEspecial || !d.id || typeof d.nombre !== "string" || !d.nombre.trim()) continue;
        mapa.set(d.id, normalizarEjercicio({
            id: d.id, nombre: d.nombre, grupos: d.grupos ?? [],
            implemento: d.implemento, modalidadCarga: d.modalidadCarga, numeroMancuernas: d.numeroMancuernas,
        }));
    }
    await guardarCatalogoEjercicios([...mapa.values()]);
};

export const enriquecerDefinicion = (d: EjercicioDef, catalogo: EjercicioCatalogoDef[]): EjercicioDef => {
    const meta = catalogo.find(e => e.id === d.id);
    return meta ? { ...d, nombre: meta.nombre, grupos: [...meta.grupos], implemento: meta.implemento,
        modalidadCarga: meta.modalidadCarga, numeroMancuernas: meta.numeroMancuernas } : d;
};
