import { rutaGrupos } from "../ajustes";
import { contenidoNotaDatos, escribirSeguro, leerNotaDatos } from "./archivos";
import type { GruposDatos, LecturaNota } from "../tipos";

export { rutaGrupos };

let cache: Record<string, string> | null = null;
let cargando: Promise<Record<string, string>> | null = null;

export const leerGrupos = async (): Promise<LecturaNota<GruposDatos>> => {
    const ruta = rutaGrupos();
    const r = await leerNotaDatos<GruposDatos>(ruta);
    if (r.error) {

        if (r.error.includes("No existe")) return { datos: { grupos: {} }, ruta };
        return r;
    }
    const grupos = r.datos && typeof r.datos.grupos === "object" && r.datos.grupos !== null
        ? r.datos.grupos
        : {};
    return { datos: { ...r.datos, grupos }, ruta };
};

export const gruposEnMemoria = (): Record<string, string> => cache ?? {};

export const cargarGrupos = async (): Promise<Record<string, string>> => {
    if (cache) return cache;
    if (!cargando) {
        cargando = leerGrupos()
            .then(r => { cache = r.datos?.grupos ?? {}; cargando = null; return cache; })
            .catch(e => { cargando = null; throw e; });
    }
    return cargando;
};

export const fijarGrupo = async (id: string, grupo: string): Promise<void> => {
    if (!cache) await cargarGrupos();
    const limpio = grupo.trim();
    const ruta = rutaGrupos();

    const ultima = await leerGrupos();
    const actual = { ...(ultima.datos?.grupos ?? {}) };
    if (limpio) actual[id] = limpio; else delete actual[id];
    cache = actual;
    const datos: GruposDatos = { grupos: actual };
    await escribirSeguro(ruta, contenidoNotaDatos(datos));
};

export const purgarGruposSinUsar = async (idsEnUso: Set<string>): Promise<string[]> => {
    const ultima = await leerGrupos();
    const actual = { ...(ultima.datos?.grupos ?? {}) };
    const fuera = Object.keys(actual).filter(id => !idsEnUso.has(id));
    if (!fuera.length) return [];
    for (const id of fuera) delete actual[id];
    cache = actual;
    const datos: GruposDatos = { grupos: actual };
    await escribirSeguro(ultima.ruta, contenidoNotaDatos(datos));
    return fuera;
};
