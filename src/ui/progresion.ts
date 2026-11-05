import { CONFIG } from "../config";
import {
    leerIndice, leerMedidas, progresionGlobal, type EntradaHistorialGlobal, type ProgresionEjercicioGlobal,
} from "../datos";
import type { IndiceRutina, TipoEjercicio } from "../tipos";
import { fechaLegible, msgError, tsDe } from "../util";
import { pesoActual, pesoMostrar, pesoTexto } from "../unidades";
import { el, KPI } from "./componentes";
import { pintarNavegacion, pintarTituloSeccion, type BotonNav } from "./cabecera";
import { grafica } from "./grafica";
import { seccionMedidas } from "./estadisticas";

interface OpcionesProgresion {
    rutinaId?: string | null;
    alVolver?: () => void;
    estadisticasGlobales?: boolean;
}

const tipoTexto = (tipo: TipoEjercicio): string =>
    tipo === "peso" ? "Peso" : tipo === "tiempo" ? "Tiempo" : "Intervalo";

const tiempoTexto = (segundos: number): string => {
    const s = Math.max(0, Math.round(segundos));
    if (s < 60) return `${s} s`;
    const min = Math.floor(s / 60), resto = s % 60;
    return resto ? `${min} min ${resto} s` : `${min} min`;
};

const claveEjercicio = (ejercicio: ProgresionEjercicioGlobal): string =>
    `${ejercicio.ejercicioId}\u0000${ejercicio.tipoEjercicio}`;

const tiempoIntervalo = (entrada: EntradaHistorialGlobal): number =>
    entrada.series.reduce((total, serie) => total + (Number(serie.duracionSeg) || 0), 0);

const valorReciente = (ejercicio: ProgresionEjercicioGlobal): string => {
    const entrada = ejercicio.historial[ejercicio.historial.length - 1];
    if (!entrada) return "Sin sesiones";
    if (ejercicio.tipoEjercicio === "peso") return pesoTexto(entrada.mejor.peso);
    if (ejercicio.tipoEjercicio === "tiempo") return tiempoTexto(entrada.mejorSeg);
    return tiempoTexto(tiempoIntervalo(entrada));
};

export async function pintarResumenProgresion(
    cont: HTMLElement, opciones: OpcionesProgresion = {},
): Promise<void> {
    cont.empty();
    const { rutinaId, alVolver, estadisticasGlobales = false } = opciones;
    let rutinasDisponibles: IndiceRutina[] = [];
    pintarTituloSeccion(cont,
        estadisticasGlobales ? "📊 Estadísticas" : "📈 Progresión",
        estadisticasGlobales
            ? "resumen de rutinas, medidas y evolución de tus ejercicios"
            : "evolución de tus ejercicios a lo largo del tiempo");
    let ejercicios: ProgresionEjercicioGlobal[];
    try {
        ejercicios = await progresionGlobal();
    } catch (err: unknown) {
        console.error("[Gym Stone progresión]", err);
        cont.appendChild(el("div", "gym-error-vista",
            `⚠️ No pude cargar el historial de progresión: ${msgError(err)}`));
        return;
    }

    if (estadisticasGlobales) {
        const [{ indice, error }, medidas] = await Promise.all([leerIndice(), leerMedidas()]);
        if (error) {
            cont.appendChild(el("div", "gym-error-vista", `⚠️ No pude cargar el resumen de rutinas: ${error}`));
        } else {
            rutinasDisponibles = indice.rutinas;
        }
        const resumenGlobal = el("div", "gym-kpis");
        const activas = indice.rutinas.filter(r => r.estado === "activa").length;
        const pausadas = indice.rutinas.filter(r => r.estado === "pausada").length;
        const finalizadas = indice.rutinas.filter(r => r.estado === "finalizada").length;
        const sesiones = indice.rutinas.reduce((total, r) => total + r.sesiones, 0);
        resumenGlobal.append(
            KPI("Rutinas", String(indice.rutinas.length), CONFIG.NARANJA),
            KPI("Activas", String(activas), CONFIG.VERDE),
            KPI("En pausa", String(pausadas), "var(--text-muted)"),
            KPI("Finalizadas", String(finalizadas), CONFIG.AZUL),
            KPI("Sesiones registradas", String(sesiones), CONFIG.VERDE),
        );
        cont.appendChild(resumenGlobal);
        if (medidas.error) {
            cont.appendChild(el("div", "gym-error-vista", `⚠️ No pude cargar las medidas: ${medidas.error}`));
        } else {
            seccionMedidas(cont, medidas);
        }
        cont.appendChild(el("div", "gym-tit", "Evolución e historial por ejercicio"));
    }

    let modo: "global" | "rutina" = rutinaId ? "rutina" : "global";
    let consulta = "";
    let seleccion = "";
    let botonGlobal: HTMLButtonElement | null = null;
    let botonRutina: HTMLButtonElement | null = null;

    if (alVolver || rutinaId) {
        const botones: BotonNav[] = [];
        if (alVolver) {
            botones.push({
                texto: rutinaId ? "← Rutina" : "← Inicio",
                alPulsar: alVolver,
            });
        }
        if (rutinaId) {
            botones.push({
                texto: "Global",
                activo: modo === "global",
                alPulsar: () => {
                    modo = "global";
                    botonGlobal?.classList.add("activo");
                    botonRutina?.classList.remove("activo");
                    pintarLista();
                },
            }, {
                texto: "Esta rutina",
                activo: modo === "rutina",
                alPulsar: () => {
                    modo = "rutina";
                    botonGlobal?.classList.remove("activo");
                    botonRutina?.classList.add("activo");
                    pintarLista();
                },
            });
        }
        const nav = pintarNavegacion(cont, botones);
        const botonesNav = nav.querySelectorAll<HTMLButtonElement>(".gym-nav-btn");
        const desplazamiento = alVolver ? 1 : 0;
        if (rutinaId) {
            botonGlobal = botonesNav[desplazamiento] ?? null;
            botonRutina = botonesNav[desplazamiento + 1] ?? null;
        }
    }

    const resumen = el("div", "gym-progresion-resumen");
    cont.appendChild(resumen);
    const busqueda = el("input", "gym-progresion-busqueda");
    busqueda.type = "search";
    busqueda.placeholder = "Buscar ejercicio";
    busqueda.setAttribute("aria-label", "Buscar ejercicio");
    cont.appendChild(busqueda);

    let rutinaFiltro = "";
    let desde = "";
    let hasta = "";
    let filtroGlobal: HTMLDivElement | null = null;
    let selRutina: HTMLSelectElement | null = null;
    let inDesde: HTMLInputElement | null = null;
    let inHasta: HTMLInputElement | null = null;
    if (estadisticasGlobales) {
        selRutina = el("select");
        const todasRutinas = el("option");
        todasRutinas.value = "";
        todasRutinas.textContent = "Todas las rutinas";
        selRutina.appendChild(todasRutinas);
        for (const { id, nombre } of [...rutinasDisponibles].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))) {
            const opcion = el("option");
            opcion.value = id;
            opcion.textContent = nombre;
            selRutina.appendChild(opcion);
        }
        inDesde = el("input");
        inDesde.type = "date";
        inHasta = el("input");
        inHasta.type = "date";
        filtroGlobal = el("div", "display:flex;gap:10px;flex-wrap:wrap;margin:8px 0;");
        const campo = (titulo: string, control: HTMLElement, ancho: string): HTMLDivElement => {
            const campoEl = el("div", `flex:1 1 ${ancho};min-width:0;`);
            campoEl.append(el("div", "gym-et", titulo), control);
            return campoEl;
        };
        filtroGlobal.append(
            campo("Rutina", selRutina, "180px"),
            campo("Desde", inDesde, "130px"),
            campo("Hasta", inHasta, "130px"),
        );
        cont.appendChild(filtroGlobal);
    }

    const explorador = el("div", "gym-progresion-explorador");
    const lista = el("div", "gym-progresion-lista");
    lista.setAttribute("aria-label", "Ejercicios con progresión");
    const detalle = el("div", "gym-progresion-detalle");
    explorador.append(lista, detalle);
    cont.appendChild(explorador);

    const historialVisible = (ejercicio: ProgresionEjercicioGlobal): ProgresionEjercicioGlobal["historial"] =>
        ejercicio.historial.filter(h =>
            (modo === "global" || h.rutinaId === rutinaId)
            && (!rutinaFiltro || h.rutinaId === rutinaFiltro)
            && (!desde || h.fecha >= desde)
            && (!hasta || h.fecha <= hasta));

    const visibles = (): ProgresionEjercicioGlobal[] => {
        const q = consulta.trim().toLocaleLowerCase("es");
        return ejercicios.filter(e =>
            historialVisible(e).length > 0
            && (!q || `${e.nombre} ${tipoTexto(e.tipoEjercicio)}`.toLocaleLowerCase("es").includes(q)));
    };

    const pintarDetalle = (ejercicio: ProgresionEjercicioGlobal): void => {
        detalle.empty();
        const historial = historialVisible(ejercicio);
        detalle.appendChild(el("h3", "gym-progresion-titulo", ejercicio.nombre));
        detalle.appendChild(el("div", "gym-progresion-tipo", tipoTexto(ejercicio.tipoEjercicio)));
        const kpis = el("div", "gym-progresion-kpis");
        const tipo = ejercicio.tipoEjercicio;
        if (tipo === "peso") {
            const pesoMax = Math.max(0, ...historial.map(h => h.mejorPeso));
            const rmMax = Math.max(0, ...historial.map(h => h.oneRM));
            const repsMax = Math.max(0, ...historial.map(h => h.mejorReps));
            kpis.append(
                KPI("Mejor peso", pesoTexto(pesoMax || null), CONFIG.NARANJA),
                KPI("1RM estimado", pesoTexto(rmMax || null), CONFIG.AZUL),
                KPI("Más repeticiones", String(repsMax || "–"), CONFIG.VERDE),
                KPI("Sesiones", String(historial.length), "var(--text-muted)"),
            );
        } else if (tipo === "tiempo") {
            const mejor = Math.max(0, ...historial.map(h => h.mejorSeg));
            kpis.append(
                KPI("Mayor duración", tiempoTexto(mejor), CONFIG.NARANJA, "en una sesión"),
                KPI("Sesiones", String(historial.length), CONFIG.VERDE),
            );
        } else {
            const tiempos = historial.map(tiempoIntervalo);
            const mejor = Math.max(0, ...tiempos);
            const acumulado = tiempos.reduce((suma, tiempo) => suma + tiempo, 0);
            const ciclos = historial.reduce((total, h) => total + h.series.length, 0);
            kpis.append(
                KPI("Más tiempo de trabajo", tiempoTexto(mejor), CONFIG.NARANJA, "en una sesión"),
                KPI("Trabajo acumulado", tiempoTexto(acumulado), CONFIG.AZUL),
                KPI("Ciclos", String(ciclos), CONFIG.VERDE),
            );
        }
        if (!estadisticasGlobales) detalle.appendChild(kpis);

        const puntos = historial.map(h => ({
            ts: tsDe(h.fecha),
            v: tipo === "peso"
                ? (pesoMostrar(h.mejorPeso) ?? 0)
                : tipo === "tiempo" ? h.mejorSeg : tiempoIntervalo(h),
            titulo: tipo === "peso"
                ? `${pesoTexto(h.mejorPeso)} · ${h.rutinaNombre}`
                : `${tiempoTexto(tipo === "tiempo" ? h.mejorSeg : tiempoIntervalo(h))} · ${h.rutinaNombre}`,
        }));
        const cajaGrafica = el("div", "gym-progresion-grafica");
        if (tipo === "peso") {
            grafica(cajaGrafica, [
                {
                    nombre: `Mejor peso (${pesoActual()})`,
                    color: CONFIG.NARANJA,
                    puntos: puntos.map((p, i) => ({
                        ...p,
                        v: pesoMostrar(historial[i].mejorPeso) ?? 0,
                        titulo: `${pesoTexto(historial[i].mejorPeso)} · ${historial[i].rutinaNombre}`,
                    })),
                },
                {
                    nombre: "1RM estimado",
                    color: CONFIG.AZUL,
                    puntos: historial.map(h => ({
                        ts: tsDe(h.fecha),
                        v: pesoMostrar(h.oneRM) ?? 0,
                        titulo: `${pesoTexto(h.oneRM)} · ${h.rutinaNombre}`,
                    })),
                },
            ]);
        } else {
            grafica(cajaGrafica, [{
                nombre: tipo === "tiempo" ? "Mejor duración (s)" : "Trabajo por sesión (s)",
                color: CONFIG.NARANJA,
                puntos,
            }], { fmt: v => `${Math.round(v)} s` });
        }
        detalle.appendChild(el("div", "gym-tit", "Evolución"));
        detalle.appendChild(cajaGrafica);

        const filas = historial.map(h => {
            const series = tipo === "peso"
                ? h.series.map(s => `${s.reps ?? "–"} × ${pesoTexto(s.peso)}`).join(" · ")
                : h.series.map(s => tiempoTexto(Number(s.duracionSeg) || 0)).join(" · ");
            const mejor = tipo === "peso"
                ? `${h.mejor.reps ?? "–"} × ${pesoTexto(h.mejor.peso)}`
                : tiempoTexto(tipo === "tiempo" ? h.mejorSeg : tiempoIntervalo(h));
            const ejercicioSesion = h.sesion.ejercicios.find(e => e.ejercicioId === ejercicio.ejercicioId);
            const objetivo = ejercicioSesion?.objetivoPlan;
            let diferencia = "Sin objetivo guardado";
            if (objetivo) {
                const deltaSeries = h.series.length - objetivo.series;
                diferencia = `${objetivo.series} planificadas → ${h.series.length} hechas`;
                if (deltaSeries) diferencia += ` (${deltaSeries > 0 ? "+" : "−"}${Math.abs(deltaSeries)} series)`;
                if (tipo === "peso" && objetivo.pesoObjetivo != null) {
                    const pesos = h.series.map(serie => serie.peso).filter((peso): peso is number =>
                        typeof peso === "number" && Number.isFinite(peso));
                    const min = pesos.length ? Math.min(...pesos) : null;
                    const max = pesos.length ? Math.max(...pesos) : null;
                    const rango = min == null || max == null ? "sin peso registrado"
                        : min === max ? pesoTexto(min) : `${pesoTexto(min)}–${pesoTexto(max)}`;
                    diferencia += ` · ${pesoTexto(objetivo.pesoObjetivo)} → ${rango}`;
                }
            }
            const fila = [
                fechaLegible(h.fecha),
                `${h.rutinaNombre} · ${h.diaNombre || h.diaId}`,
                series || "–",
                mejor,
            ];
            if (tipo === "peso") fila.push(pesoTexto(h.oneRM || null));
            fila.push(diferencia, h.notas);
            return fila;
        });
        detalle.appendChild(el("div", "gym-tit", "Sesiones"));
        const tabla = el("table", "gym-tabla");
        const cabeza = el("thead");
        const filaCabecera = el("tr");
        const columnas = [
            "Fecha", "Rutina · día", "Series",
            tipo === "peso" ? "Mejor serie" : tipo === "tiempo" ? "Mejor duración" : "Trabajo",
            ...(tipo === "peso" ? ["1RM"] : []),
            "Plan vs. realizado", "Notas",
        ];
        for (const texto of columnas) filaCabecera.appendChild(el("th", null, texto));
        cabeza.appendChild(filaCabecera);
        tabla.appendChild(cabeza);
        const cuerpo = el("tbody");
        for (const fila of filas) {
            const tr = el("tr");
            for (const texto of fila) {
                tr.appendChild(el("td", null, texto));
            }
            cuerpo.appendChild(tr);
        }
        tabla.appendChild(cuerpo);
        const envoltorio = el("div", "gym-tabla-wrap gym-tabla-vista");
        envoltorio.appendChild(tabla);
        detalle.appendChild(envoltorio);
    };

    const pintarLista = (): void => {
        const disponibles = visibles();
        resumen.empty();
        if (estadisticasGlobales) {
            resumen.append(KPI("Ejercicios con registros", String(disponibles.length), CONFIG.NARANJA));
        } else {
            const sesiones = disponibles.reduce((total, e) => total + historialVisible(e).length, 0);
            resumen.append(
                KPI("Ejercicios", String(disponibles.length), CONFIG.NARANJA),
                KPI("Sesiones registradas", String(sesiones), CONFIG.VERDE),
            );
        }
        lista.empty();
        if (!disponibles.length) {
            lista.appendChild(el("div", "gym-progresion-vacia",
                consulta ? "No hay ejercicios que coincidan con la búsqueda."
                    : modo === "rutina" ? "Esta rutina aún no tiene progresión registrada."
                        : "Todavía no hay ejercicios con sesiones registradas."));
            detalle.empty();
            return;
        }
        if (!disponibles.some(e => claveEjercicio(e) === seleccion)) seleccion = claveEjercicio(disponibles[0]);
        for (const ejercicio of disponibles) {
            const clave = claveEjercicio(ejercicio);
            const boton = el("button", "gym-progresion-item" + (clave === seleccion ? " activo" : ""));
            boton.type = "button";
            boton.setAttribute("aria-pressed", String(clave === seleccion));
            boton.append(
                el("span", "gym-progresion-item-nombre", ejercicio.nombre),
                el("span", "gym-progresion-item-meta",
                    `${tipoTexto(ejercicio.tipoEjercicio)} · ${valorReciente({
                        ...ejercicio,
                        historial: historialVisible(ejercicio),
                    })}`),
            );
            boton.onclick = () => {
                seleccion = clave;
                pintarLista();
            };
            lista.appendChild(boton);
        }
        const actual = disponibles.find(e => claveEjercicio(e) === seleccion);
        if (actual) pintarDetalle(actual);
    };

    busqueda.oninput = () => { consulta = busqueda.value; pintarLista(); };
    if (selRutina && inDesde && inHasta) {
        selRutina.onchange = () => {
            rutinaFiltro = selRutina?.value ?? "";
            pintarLista();
        };
        inDesde.onchange = () => {
            desde = inDesde?.value ?? "";
            pintarLista();
        };
        inHasta.onchange = () => {
            hasta = inHasta?.value ?? "";
            pintarLista();
        };
    }
    pintarLista();
}
