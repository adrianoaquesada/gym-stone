import {
    compararPlanes, normalizarGrupos, textoRepsObjetivo, tipoEjercicioDe, tipoSerieDe,
} from "../datos";
import { pesoTexto } from "../unidades";
import type { DiaRutina, EjercicioDef, PlantillaRutina, Rutina } from "../tipos";
import { el, tablaEn } from "./componentes";

const textoDia = (dia: DiaRutina | null): string => {
    if (!dia) return "—";
    const partes = [dia.nombre || "Día sin nombre"];
    if (dia.diasSemana?.length) partes.push(`días ${dia.diasSemana.join(", ")}`);
    const etiquetas = normalizarGrupos(dia.etiquetasPersonalizadas);
    if (etiquetas.length) partes.push(`etiquetas: ${etiquetas.join(", ")}`);
    return partes.join(" · ");
};

const textoEjercicio = (ejercicio: EjercicioDef | null): string => {
    if (!ejercicio) return "—";
    const tipo = tipoEjercicioDe(ejercicio);
    const grupos = normalizarGrupos(ejercicio.grupos);
    const prefijo = `${ejercicio.nombre || "Ejercicio"}${grupos.length ? ` · grupos: ${grupos.join(", ")}` : ""}`;
    let objetivo: string;
    if (tipo === "peso") {
        objetivo = `${ejercicio.series}×${textoRepsObjetivo(ejercicio)} reps · ${pesoTexto(ejercicio.pesoObjetivo)}`;
    } else if (tipo === "tiempo") {
        const duracion = Math.round(Number(ejercicio.duracionObjetivo) || 0);
        objetivo = ejercicio.repsPesoDuranteTiempo
            ? `${ejercicio.series} series · reps y peso durante ${duracion || "?"} s`
            : `${ejercicio.series}×hold${duracion ? ` de ${duracion} s` : ""}`;
    } else {
        const trabajo = Math.round(Number(ejercicio.trabajoSeg) || 0);
        const descanso = Math.round(Number(ejercicio.transicionSeg ?? ejercicio.descansoSeg) || 0);
        objetivo = `${ejercicio.series} ciclos · ${trabajo || "?"} s trabajo · ${descanso} s descanso entre ciclos`;
    }
    const descanso = Number(ejercicio.descansoSeg) || 0;
    const extra = [
        ejercicio.tipoSerie && tipoSerieDe(ejercicio) !== "trabajo" ? `serie: ${tipoSerieDe(ejercicio)}` : "",
        tipo !== "intervalo" && descanso > 0 ? `descanso: ${descanso} s` : "",
        ejercicio.notas?.trim() ? `notas: ${ejercicio.notas.trim()}` : "",
    ].filter(Boolean);
    return `${prefijo} · ${objetivo}${extra.length ? ` · ${extra.join(" · ")}` : ""}`;
};

export const crearComparacionPlan = (
    plantilla: PlantillaRutina,
    rutina: Rutina,
): HTMLDivElement => {
    const raiz = el("div", "margin:12px 0;");
    const filas = compararPlanes(plantilla, rutina);
    const cambios = filas.filter(f => f.estado !== "sin-cambios").length;
    raiz.appendChild(el("div", "gym-tit", `Plan base y ajustes actuales · ${cambios} cambios`));
    raiz.appendChild(el("div", "opacity:.7;font-size:.82em;margin:6px 0;",
        "Comparación de la planificación; los resultados registrados aparecen en el historial."));
    if (!filas.length) {
        raiz.appendChild(el("div", "opacity:.7;font-size:.86em;",
            "La plantilla y la rutina no tienen ejercicios definidos."));
        return raiz;
    }
    tablaEn(raiz, ["Estado", "Día base", "Día activo", "Ejercicio", "Plan base", "Plan activo"],
        filas.map(f => [
            f.estado === "sin-cambios" ? "Sin cambios"
                : f.estado === "ajustado" ? "Ajustado"
                    : f.estado === "añadido" ? "Añadido a la rutina" : "Retirado de la rutina",
            textoDia(f.diaBase),
            textoDia(f.diaActivo),
            f.activo?.nombre ?? f.base?.nombre ?? f.ejercicioId,
            textoEjercicio(f.base),
            textoEjercicio(f.activo),
        ]), { filasVisibles: 8 });
    return raiz;
};
