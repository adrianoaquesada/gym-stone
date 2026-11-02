import { rutaGrupos } from "../ajustes";
import { contenidoNotaDatos, escribirSeguro, leerNotaDatos } from "./archivos";
import type { DiaRutina, EjercicioDef, GruposDatos, LecturaNota } from "../tipos";

export { rutaGrupos };

export interface EtiquetasDia {
    gruposDerivados: string[];
    personalizadas: string[];
    todas: string[];
}

export const normalizarGrupos = (valor: unknown): string[] => {
    if (!Array.isArray(valor)) return [];
    const vistos = new Set<string>();
    const grupos: string[] = [];
    for (const item of valor) {
        if (typeof item !== "string") continue;
        const nombre = item.trim().replace(/\s+/g, " ");
        const clave = nombre.toLocaleLowerCase("es");
        if (!nombre || vistos.has(clave)) continue;
        vistos.add(clave);
        grupos.push(nombre);
    }
    return grupos;
};

export const gruposDeEjercicio = (ejercicio: Pick<EjercicioDef, "grupos">): string[] =>
    normalizarGrupos(ejercicio.grupos);

export const etiquetasDeDia = (
    dia: Pick<DiaRutina, "ejercicios" | "etiquetasPersonalizadas">,
): EtiquetasDia => {
    const gruposDerivados = normalizarGrupos(
        (dia.ejercicios ?? []).flatMap(ejercicio => gruposDeEjercicio(ejercicio)),
    );
    const personalizadas = normalizarGrupos(dia.etiquetasPersonalizadas);
    return {
        gruposDerivados,
        personalizadas,
        todas: normalizarGrupos([...gruposDerivados, ...personalizadas]),
    };
};

let cache: Record<string, string[]> | null = null;
let cargando: Promise<Record<string, string[]>> | null = null;

export const leerGrupos = async (): Promise<LecturaNota<GruposDatos>> => {
    const ruta = rutaGrupos();
    const r = await leerNotaDatos<GruposDatos>(ruta);
    if (r.error) {
        if (r.error.startsWith("No existe el archivo")) {
            return { datos: { versionDatos: 3, grupos: {} }, ruta };
        }
        return r;
    }
    if (r.datos?.versionDatos !== 3) {
        return { error: `El archivo ${ruta} usa un formato anterior; se ignora y no se modifica.`, ruta };
    }
    if (!r.datos.grupos || typeof r.datos.grupos !== "object" || Array.isArray(r.datos.grupos)) {
        return { error: `El archivo ${ruta} tiene una estructura de grupos no válida; no se modifica.`, ruta };
    }
    const grupos: Record<string, string[]> = {};
    for (const [id, valor] of Object.entries(r.datos.grupos)) {
        if (!Array.isArray(valor) || valor.some(grupo => typeof grupo !== "string")) {
            return { error: `Los grupos de «${id}» en ${ruta} no son una lista de textos; no se modifica.`, ruta };
        }
        grupos[id] = normalizarGrupos(valor);
    }
    return { datos: { versionDatos: 3, grupos }, ruta };
};

export const gruposEnMemoria = (): Record<string, string[]> => cache ?? {};

export const cargarGrupos = async (): Promise<Record<string, string[]>> => {
    if (cache) return cache;
    if (!cargando) {
        cargando = leerGrupos()
            .then(r => {
                if (r.error?.includes("formato anterior; se ignora y no se modifica")) {
                    console.warn("[Gym Stone grupos]", r.error);
                    cache = {};
                    cargando = null;
                    return cache;
                }
                if (r.error || !r.datos) throw new Error(r.error ?? `No pude leer los grupos de ${r.ruta}.`);
                cache = r.datos.grupos;
                cargando = null;
                return cache;
            })
            .catch(e => { cargando = null; throw e; });
    }
    return cargando;
};

export const fijarGrupos = async (id: string, grupos: string[]): Promise<void> => {
    if (!cache) await cargarGrupos();
    const ultima = await leerGrupos();
    if (ultima.error || !ultima.datos) {
        throw new Error(ultima.error ?? `No pude leer los grupos de ${ultima.ruta}.`);
    }
    const actual = { ...ultima.datos.grupos };
    actual[id] = normalizarGrupos(grupos);
    const datos: GruposDatos = { versionDatos: 3, grupos: actual };
    await escribirSeguro(ultima.ruta, contenidoNotaDatos(datos));
    cache = actual;
};

export const purgarGruposSinUsar = async (idsEnUso: Set<string>): Promise<string[]> => {
    const ultima = await leerGrupos();
    if (ultima.error || !ultima.datos) {
        throw new Error(ultima.error ?? `No pude leer los grupos de ${ultima.ruta}.`);
    }
    const actual = { ...ultima.datos.grupos };
    const fuera = Object.keys(actual).filter(id => !idsEnUso.has(id));
    if (!fuera.length) return [];
    for (const id of fuera) delete actual[id];
    const datos: GruposDatos = { versionDatos: 3, grupos: actual };
    await escribirSeguro(ultima.ruta, contenidoNotaDatos(datos));
    cache = actual;
    return fuera;
};
