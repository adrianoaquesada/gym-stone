import { CONFIG } from "../config";
import {
    adherencia, compararPlanes, ejerciciosConDatos, esLibre, historialEjercicio,
    leerPlantillaOrigen, nombreDia, normalizarGrupos, resumenLibre,
    semanaActual, semanasTotales, segundosSesion, textoRepsObjetivo, tipoEjercicioDe,
    segundosEjercicio, serieConDatos, totalSeries, ultimaMedida, volumenEjercicio, volumenSesion,
} from "../datos";
import { decimal, dos, esFechaValida, fechaLegible, hoy, msgError, nombreMes, tsDe } from "../util";
import { pesoActual, pesoMostrar, pesoTexto, tallaTexto } from "../unidades";
import type { EjercicioDef, LecturaNota, MedidasDatos, Rutina, Sesion } from "../tipos";
import { el, KPI, tablaEn } from "./componentes";
import { grafica } from "./grafica";

let filtroEjercicio = "";
let filtroDia = "";
let filtroDesde = "";
let filtroHasta = "";

const tiempoTexto = (seg: number): string => {
    const s = Math.max(0, Math.round(seg));
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60), r = s % 60;
    return r ? `${m} min ${r} s` : `${m} min`;
};

export function seccionEstadisticas(
    c: HTMLElement, rutina: Rutina, medidas: LecturaNota<MedidasDatos>,
): void {

    const c2 = c;
    const sesiones = [...(rutina.sesiones ?? [])].filter(s => esFechaValida(s.fecha));
    const adher = adherencia(rutina);

    const fila = el("div", "display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px;");
    c2.appendChild(fila);
    const volumenTotal = sesiones.reduce((t, s) => t + volumenSesion(s), 0);
    const segundosTotal = sesiones.reduce((t, s) => t + segundosSesion(s), 0);
    const hayTiempo = segundosTotal > 0;
    const minutos = sesiones.map(s => Number(s.duracionMin)).filter(n => Number.isFinite(n) && n > 0);
    const mediaMin = minutos.length ? minutos.reduce((a, b) => a + b, 0) / minutos.length : NaN;

    if (esLibre(rutina)) {

        const res = resumenLibre(rutina);
        const semana = Math.max(1, semanaActual(rutina));
        const totalSem = semanasTotales(rutina) || "?";
        fila.appendChild(KPI("Sesiones", String(sesiones.length), CONFIG.VERDE,
            sesiones.length
                ? `desde ${fechaLegible([...sesiones].map(s => s.fecha).sort()[0])}`
                : "aún sin sesiones registradas"));
        fila.appendChild(KPI("Días entrenados", String(res.dias), CONFIG.AZUL,
            res.dias
                ? `~${decimal(res.dias / semana, 1)} por semana · semana ${semana} de ${totalSem}`
                : "aún sin días registrados"));
        fila.appendChild(KPI("Racha", String(res.racha), CONFIG.NARANJA,
            `mejor: ${res.mejorRacha} semanas seguidas`));
    } else {
        fila.appendChild(KPI("Sesiones", String(sesiones.length), CONFIG.VERDE, `${adher.hechas} de ${adher.programadas} días programados`));
        fila.appendChild(KPI("Adherencia", Number.isFinite(adher.pct) ? decimal(adher.pct) + " %" : "–",
            !Number.isFinite(adher.pct) ? "var(--text-muted)" : adher.pct >= 80 ? CONFIG.VERDE : adher.pct >= 50 ? CONFIG.NARANJA : CONFIG.ROJO,
            "días programados con sesión registrada"));
        fila.appendChild(KPI("Racha", String(adher.racha || 0), CONFIG.NARANJA, `mejor: ${adher.mejorRacha || 0} seguidas`));
    }

    if (volumenTotal > 0 || !hayTiempo) {
        fila.appendChild(KPI("Volumen total", pesoTexto(volumenTotal), CONFIG.AZUL, "Σ series × reps × peso (solo ejercicios de peso)"));
    }
    if (hayTiempo) {
        fila.appendChild(KPI("Tiempo de trabajo", tiempoTexto(segundosTotal), CONFIG.NARANJA, "series de tiempo e intervalo"));
    }
    fila.appendChild(KPI("Duración media", Number.isFinite(mediaMin) ? `${Math.round(mediaMin)} min` : "–", "var(--text-muted)",
        `${minutos.length} sesiones con duración`));

    if (volumenTotal > 0 || !hayTiempo) {
        const titSes = el("div", "gym-tit");
        titSes.append(el("span", null, "Volumen por sesión"),
            ` — cada punto es una sesión (${pesoActual()} × reps · solo peso)`);
        c2.appendChild(titSes);
        grafica(c2, [{
            nombre: "Volumen", color: CONFIG.NARANJA,
            puntos: sesiones.map(s => ({

                ts: tsDe(s.fecha), v: pesoMostrar(volumenSesion(s)) ?? 0,
                titulo: `${pesoTexto(volumenSesion(s))} · ${nombreDia(rutina, s.diaId)}`,
            })),
        }]);
    }

    if (hayTiempo) {
        const titTiempo = el("div", "gym-tit");
        titTiempo.append(el("span", null, "Tiempo por sesión"),
            " — cada punto es una sesión (segundos de trabajo)");
        c2.appendChild(titTiempo);
        grafica(c2, [{
            nombre: "Tiempo (s)", color: CONFIG.AZUL,
            puntos: sesiones.map(s => ({
                ts: tsDe(s.fecha), v: segundosSesion(s),
                titulo: `${tiempoTexto(segundosSesion(s))} · ${nombreDia(rutina, s.diaId)}`,
            })),
        }], { fmt: v => `${Math.round(v)} s` });
    }

    const porClave = (extraer: (f: string) => string): { clave: string; sesiones: number; vol: number; seg: number; min: number }[] => {
        const mapa = new Map<string, { clave: string; sesiones: number; vol: number; seg: number; min: number }>();
        for (const s of sesiones) {
            const k = extraer(s.fecha);
            if (!mapa.has(k)) mapa.set(k, { clave: k, sesiones: 0, vol: 0, seg: 0, min: 0 });
            const w = mapa.get(k)!;
            w.sesiones++; w.vol += volumenSesion(s); w.seg += segundosSesion(s);
            w.min += Number(s.duracionMin) || 0;
        }
        return [...mapa.values()].sort((a, b) => (a.clave < b.clave ? -1 : 1));
    };
    const semanas = porClave(f => {
        const d = new Date(tsDe(f));
        const lunes = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
        return `${lunes.getFullYear()}-${dos(lunes.getMonth() + 1)}-${dos(lunes.getDate())}`;
    });
    const meses = porClave(f => f.slice(0, 7));

    const titVolumen = el("div", "gym-tit");
    titVolumen.append(el("span", null, "Volumen y tiempo por semana y por mes"));
    c2.appendChild(titVolumen);
    const cabecera = hayTiempo
        ? ["Periodo", "Sesiones", "Volumen", "Tiempo", "Minutos"]
        : ["Periodo", "Sesiones", "Volumen", "Minutos"];
    const filaPeriodo = (etiqueta: string, w: { sesiones: number; vol: number; seg: number; min: number }): string[] => {

        const vol = w.vol > 0 ? pesoTexto(w.vol) : w.seg > 0 ? "–" : pesoTexto(0);
        const celdas = [etiqueta, String(w.sesiones), vol];
        if (hayTiempo) celdas.push(w.seg > 0 ? tiempoTexto(w.seg) : "–");
        celdas.push(String(w.min || "–"));
        return celdas;
    };
    tablaEn(c2, cabecera, [
        ...[...semanas].reverse().slice(0, 8).map(w =>
            filaPeriodo(`Sem. ${w.clave.slice(8)}/${w.clave.slice(5, 7)}`, w)),
        ...[...meses].reverse().slice(0, 6).map(m =>
            filaPeriodo(`${nombreMes(Number(m.clave.slice(5, 7)) - 1)} ${m.clave.slice(0, 4)}`, m)),
    ]);

    seccionSeguimientoEjercicio(c2, rutina);
    seccionMedidas(c2, medidas);
    seccionRecords(c2, rutina, sesiones);
}

function seccionSeguimientoEjercicio(c: HTMLElement, rutina: Rutina): void {
    const ejercicios = ejerciciosConDatos(rutina);
    const conHistorial = ejercicios.filter(e => (rutina.sesiones ?? []).some(s =>
        esFechaValida(s.fecha) && (s.ejercicios ?? []).some(x => x.ejercicioId === e.id)));
    const tit = el("div", "gym-tit");
    tit.append(el("span", null, "Seguimiento por ejercicio"),
        " — evolución, series y comparación con el plan");
    c.appendChild(tit);

    if (!conHistorial.length) {
        c.appendChild(el("div", "opacity:.7;font-size:.86em;", "Todavía no hay series registradas."));
        return;
    }

    const cont = el("div");
    const sel = el("select", "box-sizing:border-box;max-width:100%;min-width:220px;height:34px;min-height:34px;padding:4px 8px;border-radius:8px;border:1px solid var(--background-modifier-border);background:var(--background-secondary);color:var(--text-normal);font-size:.9em;");
    const opTodosEjercicios = createEl("option");
    opTodosEjercicios.value = "";
    opTodosEjercicios.textContent = "Todos los ejercicios";
    sel.appendChild(opTodosEjercicios);
    for (const e of conHistorial) {
        const o = createEl("option");
        o.value = e.id; o.textContent = e.nombre;
        sel.appendChild(o);
    }
    const selDia = el("select");
    const opTodosDias = createEl("option");
    opTodosDias.value = "";
    opTodosDias.textContent = "Todos los días";
    selDia.appendChild(opTodosDias);
    const dias = [...new Set((rutina.sesiones ?? []).map(s => s.diaId).filter(Boolean))];
    for (const id of dias) {
        const o = createEl("option");
        o.value = id;
        o.textContent = nombreDia(rutina, id);
        selDia.appendChild(o);
    }
    const inDesde = el("input");
    inDesde.type = "date";
    const inHasta = el("input");
    inHasta.type = "date";
    const botonHoy = el("button", "gym-mini", "📅 Hoy");
    botonHoy.type = "button";
    botonHoy.title = "Ver solo lo registrado hoy";
    const envoltorio = el("div", "display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-bottom:8px;");
    const campo = (titulo: string, control: HTMLElement, ancho: string): HTMLDivElement => {
        const contenedor = el("div", `flex:1 1 ${ancho};min-width:0;`);
        contenedor.append(el("div", "gym-et", titulo), control);
        return contenedor;
    };
    envoltorio.append(
        campo("Ejercicio", sel, "200px"),
        campo("Día", selDia, "150px"),
        campo("Desde", inDesde, "130px"),
        campo("Hasta", inHasta, "130px"),
        botonHoy,
    );
    sel.value = conHistorial.some(e => e.id === filtroEjercicio) ? filtroEjercicio : "";
    selDia.value = filtroDia;
    filtroEjercicio = sel.value;
    filtroDia = selDia.value;
    inDesde.value = filtroDesde;
    inHasta.value = filtroHasta;
    c.appendChild(envoltorio);
    c.appendChild(cont);

    let resultadoOrigen: Awaited<ReturnType<typeof leerPlantillaOrigen>> | null = null;
    const textoPlan = (ejercicio: EjercicioDef | null): string => {
        if (!ejercicio) return "—";
        const tipo = tipoEjercicioDe(ejercicio);
        const grupos = normalizarGrupos(ejercicio.grupos);
        const nombre = `${ejercicio.nombre || "Ejercicio"}${grupos.length ? ` · grupos: ${grupos.join(", ")}` : ""}`;
        if (tipo === "peso") {
            return `${nombre} · ${ejercicio.series}×${textoRepsObjetivo(ejercicio)} reps · ${pesoTexto(ejercicio.pesoObjetivo)}`;
        }
        if (tipo === "tiempo") {
            const duracion = Math.round(Number(ejercicio.duracionObjetivo) || 0);
            return ejercicio.repsPesoDuranteTiempo
                ? `${nombre} · ${ejercicio.series} series · reps y peso durante ${duracion || "?"} s`
                : `${nombre} · ${ejercicio.series}×hold${duracion ? ` de ${duracion} s` : ""}`;
        }
        const trabajo = Math.round(Number(ejercicio.trabajoSeg) || 0);
        const descanso = Math.round(Number(ejercicio.transicionSeg ?? ejercicio.descansoSeg) || 0);
        return `${nombre} · ${ejercicio.series} ciclos · ${trabajo || "?"} s trabajo · ${descanso} s descanso entre ciclos`;
    };

    const pintarEjercicio = () => {
        cont.empty();
        const info = ejercicios.find(e => e.id === sel.value) ?? null;
        const historiales = (info ? [info] : conHistorial).flatMap(e =>
            historialEjercicio(rutina, e.id)
                .filter(h => esFechaValida(h.fecha)
                    && (!selDia.value || h.diaId === selDia.value)
                    && (!inDesde.value || h.fecha >= inDesde.value)
                    && (!inHasta.value || h.fecha <= inHasta.value))
                .map(h => ({ ejercicio: e, historial: h })))
            .sort((a, b) => a.historial.fecha < b.historial.fecha ? -1
                : a.historial.fecha > b.historial.fecha ? 1 : 0);
        const hist = historiales.map(r => r.historial);
        const sesionesFiltradas = (rutina.sesiones ?? []).filter(s =>
            esFechaValida(s.fecha)
            && (!selDia.value || s.diaId === selDia.value)
            && (!inDesde.value || s.fecha >= inDesde.value)
            && (!inHasta.value || s.fecha <= inHasta.value));
        const registros = sesionesFiltradas.flatMap(s => (s.ejercicios ?? [])
            .filter(e => !info || e.ejercicioId === info.id)
            .map(e => ({ sesion: s, ejercicio: e })))
            .sort((a, b) => a.sesion.fecha < b.sesion.fecha ? 1
                : a.sesion.fecha > b.sesion.fecha ? -1 : 0);
        const origen = resultadoOrigen;

        const comparacion = el("div", "margin:8px 0 12px;");
        comparacion.appendChild(el("div", "gym-tit", "Plan base y ajuste actual"));
        if (!info) {
            comparacion.appendChild(el("div", "opacity:.7;font-size:.86em;",
                "Selecciona un ejercicio para consultar su comparación con el plan base."));
        } else if (!origen) {
            comparacion.appendChild(el("div", "opacity:.7;font-size:.86em;", "Cargando comparación con la plantilla de origen…"));
        } else if (origen.estado === "sin-origen") {
            comparacion.appendChild(el("div", "opacity:.7;font-size:.86em;", "Esta rutina no tiene plantilla de origen para comparar."));
        } else if (origen.estado === "eliminada") {
            comparacion.appendChild(el("div", "opacity:.7;font-size:.86em;", "La plantilla de origen fue eliminada; la rutina y sus estadísticas siguen disponibles, pero ya no se puede comparar el plan base."));
        } else if ("error" in origen) {
            comparacion.appendChild(el("div", "opacity:.7;font-size:.86em;", `No se pudo leer la plantilla de origen: ${origen.error}`));
        } else if (origen.estado === "disponible" && origen.plantilla) {
            const filasPlan = compararPlanes(origen.plantilla, rutina)
                .filter(f => f.ejercicioId === info.id);
            if (!filasPlan.length) {
                comparacion.appendChild(el("div", "opacity:.7;font-size:.86em;", "Este ejercicio no tiene una definición asociada al plan base o al plan activo."));
            } else {
                tablaEn(comparacion, ["Estado", "Día base", "Plan base", "Día activo", "Plan activo"],
                    filasPlan.map(f => [
                        f.estado === "sin-cambios" ? "Sin cambios"
                            : f.estado === "ajustado" ? "Ajustado"
                                : f.estado === "añadido" ? "Añadido a la rutina" : "Retirado de la rutina",
                        f.diaBase?.nombre ?? "—",
                        textoPlan(f.base),
                        f.diaActivo?.nombre ?? "—",
                        textoPlan(f.activo),
                    ]), { filasVisibles: 4 });
            }
        }
        cont.appendChild(comparacion);

        const tipo = hist[hist.length - 1]?.tipoEjercicio;
        const histTipo = tipo ? hist.filter(h => h.tipoEjercicio === tipo) : [];
        if (info && histTipo.length) {
            if (tipo === "peso") {
                grafica(cont, [
                    {
                        nombre: `Mejor peso (${pesoActual()})`, color: CONFIG.NARANJA,
                        puntos: histTipo.map(h => ({
                            ts: tsDe(h.fecha), v: pesoMostrar(h.mejorPeso) ?? 0,
                            titulo: `${pesoTexto(h.mejorPeso)} · ${fechaLegible(h.fecha)}`,
                        })),
                    },
                    {
                        nombre: "1RM estimado", color: CONFIG.AZUL,
                        puntos: histTipo.map(h => ({
                            ts: tsDe(h.fecha), v: pesoMostrar(h.oneRM) ?? 0,
                            titulo: `${pesoTexto(h.oneRM)} · ${fechaLegible(h.fecha)}`,
                        })),
                    },
                ]);
            } else {
                const esIntervalo = tipo === "intervalo";
                grafica(cont, [{
                    nombre: esIntervalo ? "Trabajo por sesión (s)" : "Mejor tiempo (s)",
                    color: CONFIG.NARANJA,
                    puntos: histTipo.map(h => {
                        const segundos = esIntervalo
                            ? h.series.reduce((total, serie) => total + (Number(serie.duracionSeg) || 0), 0)
                            : h.mejorSeg;
                        return {
                            ts: tsDe(h.fecha), v: segundos,
                            titulo: `${tiempoTexto(segundos)} · ${fechaLegible(h.fecha)}`,
                        };
                    }),
                }], { fmt: v => `${Math.round(v)} s` });
            }
        } else if (info) {
            cont.appendChild(el("div", "opacity:.7;font-size:.86em;", "Nada registrado con esos filtros."));
        } else {
            cont.appendChild(el("div", "opacity:.7;font-size:.86em;", "Selecciona un ejercicio para ver su evolución."));
        }

        if (!registros.length) {
            cont.appendChild(el("div", "opacity:.7;font-size:.86em;", "No hay registros con esos filtros."));
            return;
        }
        const cabecera = info
            ? ["Fecha", "Día", "Series", "Plan vs. realizado", "Volumen / tiempo", "Notas"]
            : ["Fecha", "Día", "Ejercicio", "Series", "Plan vs. realizado", "Volumen / tiempo", "Notas"];
        const filas = registros.map(({ sesion, ejercicio }) => {
            const tipo = tipoEjercicioDe(ejercicio);
            const esPeso = tipo === "peso";
            const seriesOriginales = ejercicio.series ?? [];
            const seriesHechas = seriesOriginales.filter(s => !s.saltada && serieConDatos(s));
            const seriesTxt = seriesOriginales.map(s => s.saltada
                ? "⏭ saltada"
                : esPeso
                    ? `${s.reps ?? "–"}×${pesoTexto(s.peso)}`
                    : ejercicio.repsPesoDuranteTiempo
                        ? `${s.reps ?? "–"}×${pesoTexto(s.peso)} · ${s.duracionSeg ?? "–"} s`
                        : `${s.duracionSeg ?? "–"} s`).join(" · ") || "–";
            const objetivo = ejercicio.objetivoPlan;
            let diferencia = "Sin objetivo guardado";
            if (objetivo) {
                const diferenciaSeries = seriesHechas.length - objetivo.series;
                diferencia = `${objetivo.series} planificadas → ${seriesHechas.length} hechas`;
                if (diferenciaSeries) {
                    diferencia += ` (${diferenciaSeries > 0 ? "+" : "−"}${Math.abs(diferenciaSeries)} series)`;
                }
                if (esPeso && objetivo.pesoObjetivo != null) {
                    const pesos = seriesHechas.map(s => s.peso).filter((peso): peso is number =>
                        typeof peso === "number" && Number.isFinite(peso));
                    const min = pesos.length ? Math.min(...pesos) : null;
                    const max = pesos.length ? Math.max(...pesos) : null;
                    const rango = min == null || max == null ? "sin peso registrado"
                        : min === max ? pesoTexto(min) : `${pesoTexto(min)}–${pesoTexto(max)}`;
                    diferencia += ` · ${pesoTexto(objetivo.pesoObjetivo)} → ${rango}`;
                }
            }
            const duracion = segundosEjercicio(ejercicio);
            const volumen = esPeso ? pesoTexto(volumenEjercicio(ejercicio)) : duracion ? tiempoTexto(duracion) : "–";
            const fila = [
                fechaLegible(sesion.fecha),
                nombreDia(rutina, sesion.diaId),
                ejercicio.nombre || ejercicios.find(e => e.id === ejercicio.ejercicioId)?.nombre || ejercicio.ejercicioId,
                seriesTxt,
                diferencia,
                volumen,
                ejercicio.notas ?? "",
            ];
            return info ? fila.filter((_, indice) => indice !== 2) : fila;
        });
        tablaEn(cont, cabecera, filas, { filasVisibles: 10 });
    };
    const esHoy = (): boolean => inDesde.value === hoy() && inHasta.value === hoy();
    const refrescarHoy = (): void => {
        botonHoy.classList.toggle("activo", esHoy());
        botonHoy.textContent = esHoy() ? "✕ Quitar" : "📅 Hoy";
        botonHoy.title = esHoy() ? "Quitar el filtro de hoy" : "Ver solo lo registrado hoy";
    };
    const guardarFiltros = (): void => {
        filtroEjercicio = sel.value;
        filtroDia = selDia.value;
        filtroDesde = inDesde.value;
        filtroHasta = inHasta.value;
    };
    botonHoy.onclick = () => {
        if (esHoy()) {
            inDesde.value = "";
            inHasta.value = "";
        } else {
            inDesde.value = hoy();
            inHasta.value = hoy();
        }
        guardarFiltros();
        refrescarHoy();
        pintarEjercicio();
    };
    [sel, selDia, inDesde, inHasta].forEach(control => {
        control.onchange = () => {
            guardarFiltros();
            refrescarHoy();
            pintarEjercicio();
        };
    });
    refrescarHoy();
    pintarEjercicio();
    void leerPlantillaOrigen(rutina).then(resultado => {
        resultadoOrigen = resultado;
        pintarEjercicio();
    }).catch((e: unknown) => {
        console.error("[Gym Stone comparación de estadísticas]", e);
        resultadoOrigen = { estado: "error", error: msgError(e) };
        pintarEjercicio();
    });
}

export function seccionMedidas(
    c: HTMLElement, medidas: LecturaNota<MedidasDatos>, { titulo = true }: { titulo?: boolean } = {},
): void {
    if (titulo) {
        const tit = el("div", "gym-tit");
        tit.append(el("span", null, "Peso corporal"), " — evolución e IMC");
        c.appendChild(tit);
    }
    const regs = (medidas.datos?.registros ?? []).filter(r => esFechaValida(r.fecha) && Number.isFinite(Number(r.pesoKg)));
    const u = ultimaMedida(medidas.datos);
    if (!regs.length) {
        c.appendChild(el("div", "opacity:.7;font-size:.86em;", "Sin medidas todavía: usa el botón «⚖️ Registrar medidas»."));
        return;
    }
    const kpis = el("div", "display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;");

    const deltaKg = regs.length > 1 ? Number(regs[regs.length - 1].pesoKg) - Number(regs[0].pesoKg) : 0;

    const delta = (deltaKg < 0 ? -1 : 1) * (pesoMostrar(Math.abs(deltaKg)) ?? 0);
    kpis.appendChild(KPI("Peso actual", pesoTexto(u.pesoKg), CONFIG.NARANJA, u.fecha ? `medida el ${fechaLegible(u.fecha)}` : ""));
    kpis.appendChild(KPI("Talla", tallaTexto(u.tallaCm), CONFIG.AZUL, "se hereda si no se repite"));
    kpis.appendChild(KPI("IMC", u.imc ? decimal(u.imc) : "–", u.imc ? (u.imc < 25 ? CONFIG.VERDE : CONFIG.NARANJA) : "var(--text-muted)",
        `${regs.length} medidas`));
    kpis.appendChild(KPI("Δ desde el inicio", `${delta > 0 ? "+" : ""}${decimal(delta, 1)} ${pesoActual()}`, delta <= 0 ? CONFIG.VERDE : CONFIG.NARANJA,
        `primera medida: ${pesoTexto(regs[0].pesoKg)}`));
    c.appendChild(kpis);
    grafica(c, [{
        nombre: `Peso (${pesoActual()})`, color: CONFIG.VERDE,
        puntos: regs.map(r => ({ ts: tsDe(r.fecha), v: pesoMostrar(r.pesoKg) ?? 0, titulo: pesoTexto(r.pesoKg) })),
    }], { alto: 160, fmt: v => decimal(v, 1) });
}

function seccionRecords(c: HTMLElement, rutina: Rutina, sesiones: Sesion[]): void {
    const tit = el("div", "gym-tit");
    tit.append(el("span", null, "🏆 Récords de sesión"));
    c.appendChild(tit);
    const filas: string[][] = [];

    if (sesiones.length) {
        const masSeries = [...sesiones].sort((a, b) => totalSeries(b) - totalSeries(a))[0];
        filas.push(["Sesión con más series", `${totalSeries(masSeries)} series — ${fechaLegible(masSeries.fecha)}`]);
        const conMin = sesiones.map(s => ({ s, m: Number(s.duracionMin) })).filter(x => Number.isFinite(x.m) && x.m > 0);
        if (conMin.length) {
            const larga = [...conMin].sort((a, b) => b.m - a.m)[0];
            filas.push(["Sesión más larga", `${larga.m} min — ${fechaLegible(larga.s.fecha)}`]);
        }
    }
    if (!filas.length) {
        c.appendChild(el("div", "opacity:.7;font-size:.86em;", "Registra tu primera sesión para ver los récords."));
        return;
    }
    tablaEn(c, ["Récord", "Valor"], filas.slice(0, 14).map(f => [f[0], el("b", null, f[1])]));
}
