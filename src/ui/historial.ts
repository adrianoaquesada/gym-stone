import {
    compararPlanes, diaPorId, ejerciciosConDatos, esSaltada, leerPlantillaOrigen,
    nombreDia, normalizarGrupos, segundosEjercicio, textoRepsObjetivo,
    tipoEjercicioDe, tipoSerieDe, volumenEjercicio,
} from "../datos";
import { esFechaValida, fechaLegible, hoy, msgError } from "../util";
import { pesoTexto } from "../unidades";
import type { DiaRutina, EjercicioDef, PlantillaRutina, Rutina } from "../tipos";
import { el, tablaEn } from "./componentes";

let filtroEjercicio = "";
let filtroDia = "";
let filtroDesde = "";
let filtroHasta = "";

interface FilaHistorial {
    fecha: string;
    dia: string;
    ejercicio: string;
    series: string;
    volumen: string;
    notas: string;
}

export function seccionHistorial(c: HTMLElement, rutina: Rutina): void {

    const c3 = c;
    const ejercicios = ejerciciosConDatos(rutina);

    const filtros = el("div", "display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;");
    const cEj = el("div", "flex:1 1 200px;min-width:0;");
    const selEj = el("select");
    const opTodas = createEl("option");
    opTodas.value = ""; opTodas.textContent = "Todos los ejercicios";
    selEj.appendChild(opTodas);
    for (const e of ejercicios) {
        const o = createEl("option");
        o.value = e.id; o.textContent = e.nombre;
        selEj.appendChild(o);
    }
    cEj.appendChild(el("div", "gym-et", "Ejercicio")); cEj.appendChild(selEj);
    const cDia = el("div", "flex:1 1 150px;min-width:0;");
    const selDia = el("select");
    const opTodos = createEl("option");
    opTodos.value = ""; opTodos.textContent = "Todos los días";
    selDia.appendChild(opTodos);
    for (const d of rutina.dias ?? []) {
        const o = createEl("option");
        o.value = d.id; o.textContent = d.nombre;
        selDia.appendChild(o);
    }
    cDia.appendChild(el("div", "gym-et", "Día")); cDia.appendChild(selDia);
    const cDes = el("div", "flex:0 1 150px;min-width:0;");
    const inDes = el("input"); inDes.type = "date";
    cDes.appendChild(el("div", "gym-et", "Desde")); cDes.appendChild(inDes);
    const cHas = el("div", "flex:0 1 150px;min-width:0;");
    const inHas = el("input"); inHas.type = "date";
    cHas.appendChild(el("div", "gym-et", "Hasta")); cHas.appendChild(inHas);

    const cHoy = el("div", "flex:0 1 auto;min-width:0;");
    const bHoy = el("button", "gym-mini", "📅 Hoy");
    bHoy.type = "button";
    bHoy.title = "Ver solo lo registrado hoy";
    cHoy.appendChild(el("div", "gym-et", "\u00a0"));
    cHoy.appendChild(bHoy);
    filtros.appendChild(cEj); filtros.appendChild(cDia); filtros.appendChild(cDes); filtros.appendChild(cHas);
    filtros.appendChild(cHoy);

    selEj.value = filtroEjercicio;
    selDia.value = filtroDia;
    inDes.value = filtroDesde;
    inHas.value = filtroHasta;
    c3.appendChild(filtros);

    const contTabla = el("div");
    c3.appendChild(contTabla);

    const contComparacion = el("div");
    c3.appendChild(contComparacion);
    const textoDiaPlan = (dia: DiaRutina | null): string => {
        if (!dia) return "—";
        const partes = [dia.nombre || "Día sin nombre"];
        if (dia.diasSemana?.length) partes.push(`días ${dia.diasSemana.join(", ")}`);
        const etiquetas = normalizarGrupos(dia.etiquetasPersonalizadas);
        if (etiquetas.length) partes.push(`etiquetas: ${etiquetas.join(", ")}`);
        return partes.join(" · ");
    };
    const textoEjercicioPlan = (ejercicio: EjercicioDef | null): string => {
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
    const pintarComparacion = (plantilla: PlantillaRutina): void => {
        contComparacion.empty();
        const detalles = el("details", "margin:12px 0;");
        const filas = compararPlanes(plantilla, rutina);
        const resumen = el("summary", "cursor:pointer;font-weight:700;",
            `Plan base y ajustes actuales · ${filas.filter(f => f.estado !== "sin-cambios").length} cambios`);
        detalles.appendChild(resumen);
        detalles.appendChild(el("div", "opacity:.7;font-size:.82em;margin:6px 0;",
            "Comparación de la planificación; los resultados registrados aparecen en las filas del historial."));
        if (!filas.length) {
            detalles.appendChild(el("div", "opacity:.7;font-size:.86em;", "La plantilla y la rutina no tienen ejercicios definidos."));
        } else {
            tablaEn(detalles, ["Estado", "Día base", "Día activo", "Ejercicio", "Plan base", "Plan activo"],
                filas.map(f => [
                    f.estado === "sin-cambios" ? "Sin cambios"
                        : f.estado === "ajustado" ? "Ajustado"
                            : f.estado === "añadido" ? "Añadido a la rutina" : "Retirado de la rutina",
                    textoDiaPlan(f.diaBase),
                    textoDiaPlan(f.diaActivo),
                    f.activo?.nombre ?? f.base?.nombre ?? f.ejercicioId,
                    textoEjercicioPlan(f.base),
                    textoEjercicioPlan(f.activo),
                ]), { filasVisibles: 8 });
        }
        contComparacion.appendChild(detalles);
    };
    const pintarEstadoComparacion = (texto: string): void => {
        contComparacion.empty();
        contComparacion.appendChild(el("div", "opacity:.7;font-size:.86em;margin:12px 0;", texto));
    };
    pintarEstadoComparacion("Cargando comparación con la plantilla de origen…");
    void leerPlantillaOrigen(rutina).then(resultado => {
        if (resultado.estado === "disponible") pintarComparacion(resultado.plantilla);
        else if (resultado.estado === "sin-origen")
            pintarEstadoComparacion("Esta rutina no tiene plantilla de origen para comparar.");
        else if (resultado.estado === "eliminada")
            pintarEstadoComparacion("La plantilla de origen ya no existe; el historial y la rutina activa siguen disponibles, pero no se puede comparar el plan base.");
        else if ("error" in resultado)
            pintarEstadoComparacion(`No se pudo leer la plantilla de origen: ${resultado.error}`);
    }).catch((e: unknown) => {
        console.error("[Gym Stone comparación del historial]", e);
        pintarEstadoComparacion(`No se pudo cargar la comparación con la plantilla: ${msgError(e)}`);
    });

    const pintar = () => {
        contTabla.empty();
        let filas: FilaHistorial[] = [];
        for (const s of rutina.sesiones ?? []) {
            if (!esFechaValida(s.fecha)) continue;
            if (selDia.value && s.diaId !== selDia.value) continue;
            if (inDes.value && s.fecha < inDes.value) continue;
            if (inHas.value && s.fecha > inHas.value) continue;
            for (const e of s.ejercicios ?? []) {
                if (selEj.value && e.ejercicioId !== selEj.value) continue;
                const def = diaPorId(rutina, s.diaId)?.ejercicios?.find(x => x.id === e.ejercicioId);

                const tipo = tipoEjercicioDe(e);
                const seg = segundosEjercicio(e);
                filas.push({
                    fecha: s.fecha,
                    dia: nombreDia(rutina, s.diaId),
                    ejercicio: e.nombre || def?.nombre || e.ejercicioId,

                    series: (e.series ?? []).map(x => esSaltada(x)
                        ? "⏭ saltada"
                        : tipo === "peso"
                            ? `${x.reps ?? "–"}×${pesoTexto(x.peso)}`
                            : tipo === "tiempo" && e.repsPesoDuranteTiempo
                                ? `${x.reps ?? "–"}×${pesoTexto(x.peso)} · ${x.duracionSeg ?? "–"} s`
                            : `${x.duracionSeg ?? "–"} s`).join(" · ") || "–",
                    volumen: tipo === "peso" ? pesoTexto(volumenEjercicio(e)) : seg > 0 ? `${seg} s` : "–",
                    notas: e.notas ?? "",
                });
            }
        }
        filas.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));

        if (!filas.length) {
            contTabla.appendChild(el("div", "opacity:.7;font-size:.86em;", "Nada registrado con esos filtros."));
            return;
        }

        const total = filas.length;
        tablaEn(contTabla, ["Fecha", "Día", "Ejercicio", "Series", "Volumen / tiempo", "Notas"],
            filas.slice(0, 200).map(f => [
                fechaLegible(f.fecha), f.dia, el("b", null, f.ejercicio), f.series, f.volumen, f.notas,
            ]), { filasVisibles: 10 });
        if (total > 200) contTabla.appendChild(el("div", "opacity:.7;font-size:.8em;margin-top:6px;",
            `Se muestran las 200 más recientes de ${total}: afina los filtros para ver el resto.`));
    };

    const esHoy = () => inDes.value === hoy() && inHas.value === hoy();
    const refrescarHoy = () => {
        bHoy.classList.toggle("activo", esHoy());
        bHoy.textContent = esHoy() ? "✕ Quitar" : "📅 Hoy";
        bHoy.title = esHoy() ? "Quitar el filtro de hoy" : "Ver solo lo registrado hoy";
    };
    const guardarFiltros = () => {
        filtroEjercicio = selEj.value;
        filtroDia = selDia.value;
        filtroDesde = inDes.value;
        filtroHasta = inHas.value;
    };
    bHoy.onclick = () => {
        if (esHoy()) { inDes.value = ""; inHas.value = ""; }
        else { inDes.value = hoy(); inHas.value = hoy(); }
        guardarFiltros();
        refrescarHoy();
        pintar();
    };
    [selEj, selDia, inDes, inHas].forEach(x => x.onchange = () => { guardarFiltros(); refrescarHoy(); pintar(); });
    refrescarHoy();
    pintar();
}
