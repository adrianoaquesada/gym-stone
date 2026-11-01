import { TFile } from "obsidian";
import { CONFIG } from "../config";
import { aplicacion } from "../estado";
import { carpetaDatos, SUFIJO_MD } from "../ajustes";
import { hoy, sumarDias, diffDias } from "../util/fechas";
import { slug } from "../util/texto";
import { contenidoNotaDatos, escribirSeguro, leerNotaDatos } from "./archivos";
import { guardarEnIndice, quitarDeIndice } from "./indice";
import type { DiaRutina, EjercicioDef, LecturaNota, Rutina, SerieSesion, TipoEjercicio, TipoSerie } from "../tipos";

export const rutinaVacia = (): Rutina => ({
    id: "", nombre: "", objetivo: "",
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
    ({ id: "", nombre: "", tipoEjercicio: null, series: 3, repsObjetivo: 8, pesoObjetivo: null,
       duracionObjetivo: null, descansoSeg: 90, trabajoSeg: null, transicionSeg: null,
       notas: "", tipoSerie: null });

export const textoRepsObjetivo =
    (ej: Pick<EjercicioDef, "repsObjetivo" | "tipoSerie"> | undefined | null): string => {
        if (!ej) return "–";
        if (tipoSerieDe(ej) === "fallo") return "al fallo";
        return ej.repsObjetivo != null ? String(ej.repsObjetivo) : "–";
    };

export const diaVacio = (): DiaRutina => ({ id: "", nombre: "", diasSemana: [], ejercicios: [] });

export const tipoEjercicioDe =
    (ej: Pick<EjercicioDef, "tipoEjercicio"> | undefined | null): TipoEjercicio =>
        ej?.tipoEjercicio ?? "peso";

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

export const leerRutina = async (id: string): Promise<LecturaNota<Rutina>> => {
    const limp = String(id ?? "").trim();
    if (!limp) return { error: "No tengo el id de la rutina.", ruta: "" };
    const r = await leerNotaDatos<Rutina>(rutaDatosDe(limp));
    if (r.error) return r;
    if (!r.datos?.id) return { error: `El archivo ${r.ruta} no tiene una rutina dentro.`, ruta: r.ruta };
    return r;
};

export const escribirRutina = async (rutina: Rutina): Promise<string> => {
    if (!rutina?.id) throw new Error("La rutina no tiene id.");
    rutina.modificado = hoy();
    const ruta = rutaDatosDe(rutina.id);
    await escribirSeguro(ruta, contenidoNotaDatos(rutina));
    await guardarEnIndice(rutina);
    return ruta;
};

export const borrarRutina = async (id: string): Promise<void> => {
    const ruta = rutaDatosDe(id);
    const f = aplicacion().vault.getAbstractFileByPath(ruta);
    if (f instanceof TFile) {
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
