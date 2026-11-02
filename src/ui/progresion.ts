import { CONFIG } from "../config";
import {
    progresionGlobal, type EntradaHistorialGlobal, type ProgresionEjercicioGlobal,
} from "../datos";
import type { TipoEjercicio } from "../tipos";
import { fechaLegible, msgError, tsDe } from "../util";
import { pesoActual, pesoMostrar, pesoTexto } from "../unidades";
import { el, KPI } from "./componentes";
import { pintarNavegacion, pintarTituloSeccion, type BotonNav } from "./cabecera";
import { grafica } from "./grafica";

interface OpcionesProgresion {
    rutinaId?: string | null;
    alVolver?: () => void;
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
    pintarTituloSeccion(cont, "📈 Progresión", "evolución de tus ejercicios a lo largo del tiempo");
    const { rutinaId, alVolver } = opciones;
    let ejercicios: ProgresionEjercicioGlobal[];
    try {
        ejercicios = await progresionGlobal();
    } catch (err: unknown) {
        console.error("[Gym Stone progresión]", err);
        cont.appendChild(el("div", "gym-error-vista",
            `⚠️ No pude cargar el historial de progresión: ${msgError(err)}`));
        return;
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

    const explorador = el("div", "gym-progresion-explorador");
    const lista = el("div", "gym-progresion-lista");
    lista.setAttribute("aria-label", "Ejercicios con progresión");
    const detalle = el("div", "gym-progresion-detalle");
    explorador.append(lista, detalle);
    cont.appendChild(explorador);

    const visibles = (): ProgresionEjercicioGlobal[] => {
        const q = consulta.trim().toLocaleLowerCase("es");
        return ejercicios.filter(e =>
            (modo === "global" || e.historial.some(h => h.rutinaId === rutinaId))
            && (!q || `${e.nombre} ${tipoTexto(e.tipoEjercicio)}`.toLocaleLowerCase("es").includes(q)));
    };

    const pintarDetalle = (ejercicio: ProgresionEjercicioGlobal): void => {
        detalle.empty();
        const historial = ejercicio.historial.filter(h =>
            modo === "global" || h.rutinaId === rutinaId);
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
        detalle.appendChild(kpis);

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
            const extra = tipo === "peso"
                ? pesoTexto(h.oneRM || null)
                : tiempoTexto(tipo === "tiempo" ? h.mejorSeg : tiempoIntervalo(h));
            return [
                fechaLegible(h.fecha),
                `${h.rutinaNombre} · ${h.diaNombre || h.diaId}`,
                series || "–",
                mejor,
                extra,
            ];
        });
        detalle.appendChild(el("div", "gym-tit", "Sesiones"));
        const tabla = el("table", "gym-tabla");
        const cabeza = el("thead");
        const filaCabecera = el("tr");
        const columnas = tipo === "peso"
            ? ["Fecha", "Rutina · día", "Series", "Mejor serie", "1RM"]
            : ["Fecha", "Rutina · día", "Series", tipo === "tiempo" ? "Mejor duración" : "Trabajo"];
        for (const texto of columnas) filaCabecera.appendChild(el("th", null, texto));
        cabeza.appendChild(filaCabecera);
        tabla.appendChild(cabeza);
        const cuerpo = el("tbody");
        for (const fila of filas) {
            const tr = el("tr");
            for (const texto of (tipo === "peso" ? fila : fila.slice(0, 4))) {
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
        const sesiones = disponibles.reduce((total, e) => total
            + e.historial.filter(h => modo === "global" || h.rutinaId === rutinaId).length, 0);
        resumen.empty();
        resumen.append(
            KPI("Ejercicios", String(disponibles.length), CONFIG.NARANJA),
            KPI("Sesiones registradas", String(sesiones), CONFIG.VERDE),
        );
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
                        historial: ejercicio.historial.filter(h =>
                            modo === "global" || h.rutinaId === rutinaId),
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
    pintarLista();
}
