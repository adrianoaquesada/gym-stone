/* ═══════════════════════════════════════════════════════════════════════════
   Rutinas: estructuras por defecto, leer, escribir y borrar.

   Cada rutina vive en UN archivo (su plan + todas sus sesiones y anotaciones)
   y deja su fila en el índice (datos/indice.ts). No hay notas-dashboard ni
   frontmatter: el plugin es el dueño único de estos archivos.
   ═══════════════════════════════════════════════════════════════════════════ */

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
    tipo: "planificada",             // "planificada" | "libre"
    inicio: hoy(), fin: "", semanas: CONFIG.SEMANAS_POR_DEFECTO,
    diasSemana: [],                  // unión de los días de la semana de cada día (informativo)
    dias: [],                        // [{ id, nombre, diasSemana, ejercicios }]
    sesiones: [],                    // [{ fecha, diaId, duracionMin, anotaciones, ejercicios }]
    notasDia: [],                    // [{ fecha, texto }]
    estado: "activa",                // activa | pausada | finalizada
    creado: "", modificado: "",
});

export const ejercicioVacio = (): EjercicioDef =>
    ({ id: "", nombre: "", series: 3, repsObjetivo: 8, pesoObjetivo: null, descansoSeg: 90, notas: "", modoFallo: null });

/* Texto del objetivo de reps de un ejercicio, según su modo (tipos.ts):
     · fijo   → «10»
     · mínimo → «mín. 8 (fallo)» (sin número: «al fallo»)
     · todas  → «al fallo»
   Lo usan el dashboard, el chip «objetivo» del registro y la sesión guiada. */
export const textoRepsObjetivo =
    (ej: Pick<EjercicioDef, "repsObjetivo" | "modoFallo"> | undefined | null): string => {
        if (!ej) return "–";
        if (ej.modoFallo === "todas") return "al fallo";
        if (ej.modoFallo === "minimo") return ej.repsObjetivo ? `mín. ${ej.repsObjetivo} (fallo)` : "al fallo";
        return ej.repsObjetivo != null ? String(ej.repsObjetivo) : "–";
    };

export const diaVacio = (): DiaRutina => ({ id: "", nombre: "", diasSemana: [], ejercicios: [] });

/* ── Lecturas por defecto de los campos nuevos ──────────────────────────── */

/* Opcionales en disco: las notas escritas antes del cambio no los traen y
   hay que seguirlas leyendo (sin migración):
     · tipoEjercicio ausente/null → "peso"
     · tipoSerie ausente/null     → "trabajo" */
export const tipoEjercicioDe =
    (ej: Pick<EjercicioDef, "tipoEjercicio"> | undefined | null): TipoEjercicio =>
        ej?.tipoEjercicio ?? "peso";

/* Tipo de serie de una serie registrada: manda lo etiquetado al registrarla
   (SerieSesion.tipoSerie) y, si no lo lleva, el tipo del plan del ejercicio. */
export const tipoSerieDe = (
    plan: Pick<EjercicioDef, "tipoSerie"> | undefined | null,
    serie?: Pick<SerieSesion, "tipoSerie"> | null,
): TipoSerie => serie?.tipoSerie ?? plan?.tipoSerie ?? "trabajo";

// Fecha de fin a partir del inicio y las semanas
export const finDesde = (inicio: string, semanas: number): string =>
    sumarDias(inicio, Math.max(1, Number(semanas) || 1) * 7 - 1);

export const semanasTotales = (rutina: Rutina): number => {
    const s = diffDias(rutina.inicio, rutina.fin) + 1;
    return s > 0 ? Math.ceil(s / 7) : (Number(rutina.semanas) || 0);
};

export const rutaDatosDe = (id: string): string => `${carpetaDatos()}/${id}${SUFIJO_MD}`;

/* ── Lectura ────────────────────────────────────────────────────────────── */

export const leerRutina = async (id: string): Promise<LecturaNota<Rutina>> => {
    const limp = String(id ?? "").trim();
    if (!limp) return { error: "No tengo el id de la rutina.", ruta: "" };
    const r = await leerNotaDatos<Rutina>(rutaDatosDe(limp));
    if (r.error) return r;
    if (!r.datos?.id) return { error: `El archivo ${r.ruta} no tiene una rutina dentro.`, ruta: r.ruta };
    return r;
};

/* ── Escritura (siempre acompañada del índice) ──────────────────────────── */

export const escribirRutina = async (rutina: Rutina): Promise<string> => {
    if (!rutina?.id) throw new Error("La rutina no tiene id.");
    rutina.modificado = hoy();
    const ruta = rutaDatosDe(rutina.id);
    await escribirSeguro(ruta, contenidoNotaDatos(rutina));
    await guardarEnIndice(rutina);      // el índice siempre refleja lo último guardado
    return ruta;
};

/* Borrado: se lleva el archivo de datos y su fila del índice. La copia .bak
   del anterior queda en disco por si se arrepiente. */
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

/* Id nuevo para una rutina: rutina-YYYY-MM-<nombre>, desambiguado si ya existe */
export const idNuevo = async (nombre: string, prefijoFecha = hoy().slice(0, 7)): Promise<string> => {
    const base = `rutina-${prefijoFecha}-${slug(nombre) || "sin-nombre"}`;
    let id = base, n = 2;
    while (aplicacion().vault.getAbstractFileByPath(rutaDatosDe(id))) id = `${base}-${n++}`;
    return id;
};
