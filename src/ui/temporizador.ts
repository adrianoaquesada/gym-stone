/* ═══════════════════════════════════════════════════════════════════════════
   Temporizador libre (cuenta atrás para lo que quieras: descanso, series
   temporizadas, cocina…). No está atado a ninguna rutina ni a ninguna sesión.

   Se abre desde «Rutinas» —la lista o el dashboard de una rutina— o con el
   comando «Abrir el temporizador». Es la suma de tres referencias: el anillo
   circular con la hora a la que sonará, el ajuste a mano de h/m/s y los
   presets de un toque —en carrusel lateral—, más los controles del descanso
   de la sesión guiada (−15 s, ＋15 s…). Ni los presets arrancan: solo fijan
   la duración; el botón principal crea una cuenta atrás independiente. Las
   cuentas activas aparecen en una vista circular navegable o en una lista con
   pausa, reanudación y eliminación.

   El estado vive en el MÓDULO, no en el modal: se puede cerrar la ventana y
   las cuentas atrás siguen corriendo; al volver se reanudan donde estaban. Al
   llegar a 0 cada una suena y vibra de forma independiente (el sonido, su volumen y su interruptor
   viven en sonido.ts y en Ajustes → Gym Stone) y sale un aviso. El tiempo
   sale de Date.now() —no de tics—, así que con la pantalla apagada u
   Obsidian en segundo plano, al volver se recalcula solo: la misma lección
   que el descanso de la sesión guiada. Mientras corre (y con el ajuste
   «Mantener la pantalla encendida» activo, por defecto) la pantalla no se
   apaga sola —ver despierta.ts—; al pausar, eliminar o terminar se suelta.
   ═══════════════════════════════════════════════════════════════════════════ */

import { dos } from "../util";
import { ReclamoDespierta } from "../despierta";
import { aplicacion, conf, persistirAjustes } from "../estado";
import { normalizarAjustes } from "../ajustes";
import type { CronometroLibre, ParcialCronometro, TemporizadorLibre } from "../tipos";
import { el, modal, ponerX, toast } from "./componentes";
import { prepararAudio, reiniciarCuentaAtras, sonarCuentaAtras, sonarTemporizador, vibrar } from "./sonido";

/* ── Estado (del módulo: sobrevive al cierre del modal) ─────────────────── */
let totalMs = 5 * 60000;        // la duración elegida (5:00 al empezar)
let temporizadores: TemporizadorLibre[] = [];
let secuenciaTemporizador = 0;
let temporizadorEnAnilloId: string | null = null;
let vistaTemporizadores: "circular" | "lista" = "circular";
let configuracionTemporizadorAbierta = false;
let modo: "cuenta-atras" | "cronometro" = "cuenta-atras";
let cronometro: CronometroLibre = { tiempoAcumuladoMs: 0, iniciadoEn: null, estado: "pausado" };
let secuenciaCronometro = 0;
let cronometroSesionId = "";
let parcialesCronometro: ParcialCronometro[] = [];
let estadoParciales: "sin-cargar" | "listos" | "error" = "sin-cargar";
let idReloj: number | null = null;
let idColaAvisos: number | null = null;
let alPintar: (() => void) | null = null;   // repintado del modal, si está abierto
const colaAvisos: string[] = [];
const CLAVE_PARCIALES = "gym-stone-parciales-cronometro";

const esParcialCronometro = (dato: unknown): dato is ParcialCronometro => {
    if (typeof dato !== "object" || dato === null) return false;
    const parcial = dato as Record<string, unknown>;
    return typeof parcial.id === "string"
        && typeof parcial.sesionId === "string"
        && typeof parcial.parcialMs === "number" && Number.isFinite(parcial.parcialMs) && parcial.parcialMs >= 0
        && typeof parcial.acumuladoMs === "number" && Number.isFinite(parcial.acumuladoMs) && parcial.acumuladoMs >= 0;
};

const fmtReloj = (ms: number, redondearArriba = true): string => {
    const segundos = Math.max(0, redondearArriba ? Math.ceil(ms / 1000) : Math.floor(ms / 1000));
    const h = Math.floor(segundos / 3600);
    const m = Math.floor((segundos % 3600) / 60);
    return `${String(h).padStart(2, "0")}:${dos(m)}:${dos(segundos % 60)}`;
};

const cargarParcialesCronometro = (): boolean => {
    if (estadoParciales !== "sin-cargar") return estadoParciales === "listos";
    try {
        const guardados: unknown = aplicacion().loadLocalStorage(CLAVE_PARCIALES);
        if (guardados == null) {
            parcialesCronometro = [];
        } else if (Array.isArray(guardados) && guardados.every(esParcialCronometro)) {
            parcialesCronometro = guardados;
        } else {
            throw new Error("El formato guardado de los parciales del cronómetro no es válido.");
        }
        estadoParciales = "listos";
        return true;
    } catch (error) {
        estadoParciales = "error";
        console.error("Gym Stone: no se pudieron cargar los parciales del cronómetro.", error);
        toast("⚠️ No se pudieron cargar los parciales del cronómetro.", false);
        return false;
    }
};

const guardarParcialesCronometro = (parciales: ParcialCronometro[]): boolean => {
    try {
        aplicacion().saveLocalStorage(CLAVE_PARCIALES, parciales);
        parcialesCronometro = parciales;
        return true;
    } catch (error) {
        console.error("Gym Stone: no se pudieron guardar los parciales del cronómetro.", error);
        toast("⚠️ No se pudieron guardar los parciales del cronómetro.", false);
        return false;
    }
};

const ultimoAcumuladoSesion = (): number => parcialesCronometro
    .filter(parcial => parcial.sesionId === cronometroSesionId)
    .reduce((ultimo, parcial) => Math.max(ultimo, parcial.acumuladoMs), 0);

const pantallas = new Map<string, ReclamoDespierta>();
const observadoresActividad = new Set<(cantidad: number) => void>();
let ultimaCantidadActiva = -1;

const restante = (temporizador: TemporizadorLibre): number =>
    temporizador.estado === "en-marcha" && temporizador.finEn != null
        ? Math.max(0, temporizador.finEn - Date.now())
        : temporizador.restanteMs;

const tiempoCronometro = (): number => cronometro.tiempoAcumuladoMs
    + (cronometro.estado === "en-marcha" && cronometro.iniciadoEn != null
        ? Date.now() - cronometro.iniciadoEn
        : 0);

const pantallaDe = (id: string): ReclamoDespierta => {
    let pantalla = pantallas.get(id);
    if (!pantalla) {
        pantalla = new ReclamoDespierta();
        pantallas.set(id, pantalla);
    }
    return pantalla;
};

const mostrarAvisoPendiente = (): void => {
    if (idColaAvisos != null || colaAvisos.length === 0) return;
    toast(colaAvisos.shift() ?? "");
    idColaAvisos = window.setTimeout(() => {
        idColaAvisos = null;
        mostrarAvisoPendiente();
    }, 4200);
};

const avisar = (terminados: TemporizadorLibre[]): void => {
    if (terminados.length === 0) return;
    sonarTemporizador();
    vibrar();
    const duraciones = terminados.map(t => fmt(t.duracionMs));
    const detalle = terminados.length === 1
        ? `Terminó la cuenta atrás de ${duraciones[0]}.`
        : `Terminaron ${terminados.length} cuentas atrás: ${duraciones.join(", ")}.`;
    colaAvisos.push(`⏰ ¡Tiempo! ${detalle}`);
    mostrarAvisoPendiente();
};

const terminar = (temporizador: TemporizadorLibre): void => {
    temporizador.estado = "terminado";
    temporizador.restanteMs = 0;
    temporizador.finEn = null;
    pantallaDe(temporizador.id).quitar();
    reiniciarCuentaAtras(temporizador.id);
};

const tic = (): void => {
    const terminados: TemporizadorLibre[] = [];
    for (const temporizador of temporizadores) {
        if (temporizador.estado !== "en-marcha") continue;
        const ms = restante(temporizador);
        if (ms <= 0) {
            terminar(temporizador);
            terminados.push(temporizador);
            continue;
        }
        sonarCuentaAtras(temporizador.id, "temporizador", ms);
    }
    avisar(terminados);
    terminados.forEach(eliminarTemporizador);
    actualizarReloj();
    notificar();
};
const actualizarReloj = (): void => {
    const hayRelojesEnMarcha = cronometro.estado === "en-marcha"
        || temporizadores.some(t => t.estado === "en-marcha");
    if (hayRelojesEnMarcha && idReloj == null) {
        idReloj = window.setInterval(tic, 250);
    } else if (!hayRelojesEnMarcha && idReloj != null) {
        window.clearInterval(idReloj);
        idReloj = null;
    }
};
const notificar = (): void => {
    const cantidadActiva = temporizadores.filter(t => t.estado === "en-marcha").length;
    if (cantidadActiva !== ultimaCantidadActiva) {
        ultimaCantidadActiva = cantidadActiva;
        observadoresActividad.forEach(observar => observar(cantidadActiva));
    }
    alPintar?.();
};

export const observarTemporizadoresActivos = (observar: (cantidad: number) => void): (() => void) => {
    observadoresActividad.add(observar);
    observar(temporizadores.filter(t => t.estado === "en-marcha").length);
    return () => { observadoresActividad.delete(observar); };
};

const arrancar = (ms: number): void => {
    prepararAudio();
    const duracionMs = Math.max(1000, ms);
    const temporizador: TemporizadorLibre = {
        id: `temporizador-${Date.now().toString(36)}-${(++secuenciaTemporizador).toString(36)}`,
        duracionMs,
        restanteMs: duracionMs,
        finEn: Date.now() + duracionMs,
        estado: "en-marcha",
    };
    temporizadores.push(temporizador);
    temporizadorEnAnilloId = temporizador.id;
    configuracionTemporizadorAbierta = false;
    pantallaDe(temporizador.id).poner();
    actualizarReloj();
    notificar();
};

const alternarPausa = (temporizador: TemporizadorLibre): void => {
    if (temporizador.estado === "en-marcha") {
        const restanteMs = restante(temporizador);
        if (restanteMs <= 0) {
            terminar(temporizador);
            avisar([temporizador]);
            eliminarTemporizador(temporizador);
        } else {
            temporizador.restanteMs = restanteMs;
            temporizador.finEn = null;
            temporizador.estado = "pausado";
            pantallaDe(temporizador.id).quitar();
            reiniciarCuentaAtras(temporizador.id);
        }
    } else if (temporizador.estado === "pausado") {
        temporizador.finEn = Date.now() + temporizador.restanteMs;
        temporizador.estado = "en-marcha";
        pantallaDe(temporizador.id).poner();
    }
    actualizarReloj();
    notificar();
};

const eliminarTemporizador = (temporizador: TemporizadorLibre): void => {
    pantallaDe(temporizador.id).quitar();
    pantallas.delete(temporizador.id);
    reiniciarCuentaAtras(temporizador.id);
    temporizadores = temporizadores.filter(t => t.id !== temporizador.id);
    if (temporizadorEnAnilloId === temporizador.id) {
        temporizadorEnAnilloId = temporizadores[0]?.id ?? null;
    }
    actualizarReloj();
    notificar();
};

/* Detiene el intervalo al descargar el plugin (lo llama main.onunload) */
export const pararTemporizador = (): void => {
    if (idReloj != null) window.clearInterval(idReloj);
    if (idColaAvisos != null) window.clearTimeout(idColaAvisos);
    idReloj = null;
    idColaAvisos = null;
    colaAvisos.length = 0;
    for (const temporizador of temporizadores) {
        pantallaDe(temporizador.id).quitar();
        reiniciarCuentaAtras(temporizador.id);
    }
    temporizadores = [];
    temporizadorEnAnilloId = null;
    pantallas.clear();
    cronometro = { tiempoAcumuladoMs: 0, iniciadoEn: null, estado: "pausado" };
    modo = "cuenta-atras";
    alPintar = null;
};

/* ── Formato ────────────────────────────────────────────────────────────── */
const fmt = (ms: number, redondearArriba = true): string => {
    const segundos = redondearArriba ? Math.ceil(ms / 1000) : Math.floor(ms / 1000);
    const s = Math.max(0, segundos);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return (h ? `${h}:${dos(m)}` : String(m)) + `:${dos(s % 60)}`;
};

const formatoHora = (ts: number): string => {
    const d = new Date(ts);
    const horas = d.getHours();
    return `${horas % 12 || 12}:${dos(d.getMinutes())} ${horas < 12 ? "AM" : "PM"}`;
};

const fmtTotal = (ms: number): string => {
    const segundos = Math.max(0, Math.ceil(ms / 1000));
    if (segundos < 60) return `${segundos} s`;
    const unidad = segundos >= 3600 ? "h" : "m";
    return `${fmt(ms)} ${unidad}`;
};

const NS_SVG = "http://www.w3.org/2000/svg";
const svgEl = (tag: string, attrs: Record<string, string>): SVGElement => {
    const n = document.createElementNS(NS_SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
};

/* ═══════════════════════════════════════════════════════════════════════════
   El modal. Se puede cerrar (✕, Escape o clic fuera) sin parar la cuenta
   atrás: al reabrirlo se ve donde iba.
   ═══════════════════════════════════════════════════════════════════════════ */
export function abrirTemporizador(): void {
    const m = modal("⏱ Temporizador", "cuentas atrás independientes · al cerrarlo siguen corriendo");
    m.caja.classList.add("gym-temp-caja");
    ponerX(m, "Cerrar (la cuenta atrás sigue corriendo)");

    // ── Anillo con el tiempo dentro (arriba el total, abajo la hora del aviso) ──
    const anillo = el("div", "gym-temp-anillo");
    const svg = svgEl("svg", { viewBox: "0 0 200 200", "aria-hidden": "true" });
    const R = 88, C = 2 * Math.PI * R;
    svg.append(
        svgEl("circle", { cx: "100", cy: "100", r: String(R), class: "pista" }),
        svgEl("circle", { cx: "100", cy: "100", r: String(R), class: "barra" }),
    );
    const barra = svg.lastElementChild as SVGElement;
    barra.style.strokeDasharray = String(C);   // perímetro completo: con offset = 0 el anillo está lleno
    barra.setAttribute("transform", "rotate(-90 100 100)");   // empieza arriba
    const cen = el("div", "gym-temp-cen");
    const tTotal = el("div", "gym-temp-sub");
    const tGrande = el("div", "gym-temp-t");
    const tHora = el("div", "gym-temp-sub");
    let animacionTarjeta: Animation | null = null;
    const animarCambioTarjeta = (direccion: number): void => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        animacionTarjeta?.cancel();
        animacionTarjeta = anillo.animate(
            [
                { opacity: 0.2, transform: `translateX(${direccion * 52}px) scale(.96)` },
                { opacity: 1, transform: "translateX(0) scale(1)" },
            ],
            { duration: 280, easing: "cubic-bezier(.22,.75,.25,1)" },
        );
    };
    cen.append(tTotal, tGrande, tHora);
    anillo.append(svg, cen);
    m.caja.appendChild(anillo);
    const puntosTemporizadores = el("div", "gym-temp-puntos");
    m.caja.appendChild(puntosTemporizadores);

    // ── Estado (el «Running» de la referencia) ──
    const estado = el("div", "gym-temp-estado");
    m.caja.appendChild(estado);
    const accionesCirculares = el("div", "gym-temp-acciones-circulares");
    const pausaCircular = el("button", "gym-btn-g gym-temp-fila-accion");
    pausaCircular.type = "button";
    pausaCircular.onclick = () => {
        const temporizador = temporizadores.find(t => t.id === temporizadorEnAnilloId);
        if (temporizador) alternarPausa(temporizador);
    };
    const eliminarCircular = el("button", "gym-btn-g gym-temp-fila-accion gym-temp-fila-eliminar", "×");
    eliminarCircular.type = "button";
    eliminarCircular.setAttribute("aria-label", "Eliminar cuenta atrás");
    eliminarCircular.title = "Eliminar esta cuenta atrás";
    eliminarCircular.onclick = () => {
        const temporizador = temporizadores.find(t => t.id === temporizadorEnAnilloId);
        if (temporizador) eliminarEnDosToques(temporizador);
    };
    accionesCirculares.append(pausaCircular, eliminarCircular);
    m.caja.appendChild(accionesCirculares);

    const barraHerramientas = el("div", "gym-temp-herramientas");
    const bModo = el("button", "gym-btn-g gym-temp-modo");
    bModo.type = "button";
    bModo.onclick = () => {
        if (modo === "cuenta-atras") {
            if (!cronometroSesionId) {
                cronometroSesionId = `cronometro-${Date.now()}-${++secuenciaCronometro}`;
            }
            modo = "cronometro";
        } else {
            modo = "cuenta-atras";
        }
        actualizarReloj();
        notificar();
    };
    barraHerramientas.appendChild(bModo);

    const bAjustes = el("button", "gym-btn-g gym-temp-herramienta", "+");
    bAjustes.type = "button";
    bAjustes.setAttribute("aria-label", "Mostrar ajustes y opciones rápidas");
    bAjustes.title = "Añadir temporizador";
    bAjustes.onclick = () => {
        configuracionTemporizadorAbierta = !configuracionTemporizadorAbierta;
        notificar();
    };
    barraHerramientas.appendChild(bAjustes);

    const bVista = el("button", "gym-btn-g gym-temp-herramienta");
    bVista.type = "button";
    bVista.setAttribute("aria-label", "Mostrar temporizadores en lista");
    bVista.title = "Cambiar vista";
    const iconoLista = el("span", "gym-temp-icono-lista");
    for (let i = 0; i < 3; i++) iconoLista.appendChild(el("span", "gym-temp-icono-linea"));
    bVista.appendChild(iconoLista);
    bVista.onclick = () => {
        vistaTemporizadores = vistaTemporizadores === "circular" ? "lista" : "circular";
        notificar();
    };
    barraHerramientas.appendChild(bVista);
    m.caja.insertBefore(barraHerramientas, anillo);

    const bCronometro = el("button", "gym-btn gym-temp-iniciar primario");
    bCronometro.type = "button";
    bCronometro.onclick = () => {
        if (cronometro.estado === "en-marcha") {
            cronometro.tiempoAcumuladoMs = tiempoCronometro();
            cronometro.iniciadoEn = null;
            cronometro.estado = "pausado";
        } else {
            cronometro.iniciadoEn = Date.now();
            cronometro.estado = "en-marcha";
        }
        actualizarReloj();
        notificar();
    };

    cargarParcialesCronometro();
    const secParciales = el("div", "gym-temp-sec gym-temp-parciales");
    secParciales.appendChild(el("div", "gym-et gym-temp-tit", "Parciales"));
    const bParcial = el("button", "gym-btn-g", "＋ Registrar parcial");
    bParcial.type = "button";
    bParcial.onclick = () => {
        if (cronometro.estado === "en-marcha") {
            const acumuladoMs = tiempoCronometro();
            const ultimoMs = ultimoAcumuladoSesion();
            if (acumuladoMs <= ultimoMs) return;
            const parcial: ParcialCronometro = {
                id: `parcial-${Date.now()}-${parcialesCronometro.length}`,
                sesionId: cronometroSesionId,
                parcialMs: acumuladoMs - ultimoMs,
                acumuladoMs,
            };
            if (guardarParcialesCronometro([...parcialesCronometro, parcial])) notificar();
            return;
        }
        if (estadoParciales !== "listos") {
            toast("No se pueden restablecer los parciales porque no se pudieron cargar.", false);
            return;
        }
        if (parcialesCronometro.length > 0 && !guardarParcialesCronometro([])) return;
        cronometro = { tiempoAcumuladoMs: 0, iniciadoEn: null, estado: "pausado" };
        cronometroSesionId = `cronometro-${Date.now()}-${++secuenciaCronometro}`;
        notificar();
    };
    const listaParciales = el("div", "gym-temp-lista");
    secParciales.appendChild(listaParciales);
    m.caja.appendChild(secParciales);

    type FilaParcial = { fila: HTMLDivElement; tiempo: HTMLDivElement; acumulado: HTMLDivElement };
    const filasParciales = new Map<string, FilaParcial>();
    const pintarParciales = (): void => {
        const idsActuales = new Set(parcialesCronometro.map(parcial => parcial.id));
        for (const [id, fila] of filasParciales) {
            if (idsActuales.has(id)) continue;
            fila.fila.remove();
            filasParciales.delete(id);
        }
        parcialesCronometro.forEach((parcial, indice) => {
            let fila = filasParciales.get(parcial.id);
            if (!fila) {
                const elemento = el("div", "gym-temp-fila");
                const tiempo = el("div", "gym-temp-fila-tiempo");
                const acumulado = el("div", "gym-temp-fila-estado");
                elemento.append(tiempo, acumulado);
                listaParciales.appendChild(elemento);
                fila = { fila: elemento, tiempo, acumulado };
                filasParciales.set(parcial.id, fila);
            }
            fila.tiempo.textContent = `Parcial ${indice + 1} · ${fmtReloj(parcial.parcialMs, false)}`;
            fila.acumulado.textContent = `Acumulado · ${fmtReloj(parcial.acumuladoMs, false)}`;
        });
        secParciales.classList.toggle("gym-oculto", modo !== "cronometro");
        const enMarcha = modo === "cronometro" && cronometro.estado === "en-marcha";
        const acumulado = tiempoCronometro();
        const parcialDisponible = estadoParciales === "listos"
            && acumulado > ultimoAcumuladoSesion();
        bCronometro.textContent = cronometro.estado === "en-marcha"
            ? "⏹ Detener"
            : acumulado > 0 ? "▶ Reanudar" : "▶ Iniciar";
        bCronometro.setAttribute("aria-label", bCronometro.textContent);
        bCronometro.classList.toggle("pausa", enMarcha);
        bParcial.textContent = enMarcha ? "＋ Parcial" : "↺ Restablecer";
        bParcial.setAttribute("aria-label", bParcial.textContent);
        bParcial.title = enMarcha ? "Registrar tiempo parcial" : "Restablecer el cronómetro";
        bParcial.disabled = enMarcha
            ? !parcialDisponible
            : acumulado <= 0 && parcialesCronometro.length === 0;
    };

    const secLista = el("div", "gym-temp-sec gym-temp-lista-sec");
    secLista.appendChild(el("div", "gym-temp-lista-vacia", "No hay temporizadores. Usa + para añadir uno."));
    const listaTemporizadores = el("div", "gym-temp-lista");
    secLista.appendChild(listaTemporizadores);
    m.caja.appendChild(secLista);

    type FilaTemporizador = {
        fila: HTMLDivElement;
        alarma: HTMLSpanElement;
        duracion: HTMLSpanElement;
        tiempo: HTMLSpanElement;
        progreso: HTMLDivElement;
        progresoRelleno: HTMLDivElement;
        alternar: HTMLButtonElement;
        eliminar: HTMLButtonElement;
    };
    const filas = new Map<string, FilaTemporizador>();
    const puntos = new Map<string, HTMLButtonElement>();
    let temporizadorPendienteEliminarId: string | null = null;
    const eliminarEnDosToques = (temporizador: TemporizadorLibre): void => {
        if (temporizadorPendienteEliminarId === temporizador.id) {
            temporizadorPendienteEliminarId = null;
            eliminarTemporizador(temporizador);
            return;
        }
        temporizadorPendienteEliminarId = temporizador.id;
        notificar();
    };
    m.caja.addEventListener("click", evento => {
        if (temporizadorPendienteEliminarId === null
            || !(evento.target instanceof Element)
            || evento.target.closest(".gym-temp-fila-eliminar")) return;
        temporizadorPendienteEliminarId = null;
        notificar();
    });
    const seleccionarTemporizadorAdyacente = (paso: number): void => {
        if (temporizadores.length < 2) return;
        const indiceActual = temporizadores.findIndex(t => t.id === temporizadorEnAnilloId);
        const indiceBase = indiceActual < 0 ? 0 : indiceActual;
        const indiceSiguiente = (indiceBase + paso + temporizadores.length) % temporizadores.length;
        temporizadorEnAnilloId = temporizadores[indiceSiguiente].id;
        animarCambioTarjeta(paso);
        notificar();
    };
    let inicioDeslizamiento: number | null = null;
    anillo.addEventListener("pointerdown", evento => {
        inicioDeslizamiento = evento.clientX;
        anillo.setPointerCapture(evento.pointerId);
    });
    anillo.addEventListener("pointerup", evento => {
        if (inicioDeslizamiento == null) return;
        const desplazamiento = evento.clientX - inicioDeslizamiento;
        inicioDeslizamiento = null;
        if (Math.abs(desplazamiento) >= 40) seleccionarTemporizadorAdyacente(desplazamiento < 0 ? 1 : -1);
    });
    anillo.addEventListener("pointercancel", () => { inicioDeslizamiento = null; });

    // ── Duración de la próxima cuenta atrás ──
    const secConfiguracion = el("div", "gym-temp-configuracion");
    const secAjustar = el("div", "gym-temp-sec");
    const filaAjuste = el("div", "gym-temp-ajuste");
    const entradas: HTMLInputElement[] = [];
    for (const [etq, max] of [["Horas", 99], ["Minutos", 59], ["Segundos", 59]] as [string, number][]) {
        const campo = el("div", "gym-temp-campo");
        const i = el("input");
        i.type = "number";
        i.min = "0";
        i.max = String(max);
        i.inputMode = "numeric";
        campo.append(el("div", "gym-et", etq), i);
        filaAjuste.appendChild(campo);
        entradas.push(i);
    }
    secAjustar.appendChild(filaAjuste);
    secConfiguracion.appendChild(secAjustar);

    const msDeEntradas = (): number =>
        (Number(entradas[0].value) || 0) * 3600000
        + (Number(entradas[1].value) || 0) * 60000
        + (Number(entradas[2].value) || 0) * 1000;

    const actualizarDesdeEntradas = (): void => {
        totalMs = msDeEntradas();
        notificar();
    };
    entradas.forEach(entrada => entrada.addEventListener("input", actualizarDesdeEntradas));

    const fijarEntradas = (ms: number): void => {
        const s = Math.round(ms / 1000);
        entradas[0].value = String(Math.floor(s / 3600));
        entradas[1].value = String(Math.floor((s % 3600) / 60));
        entradas[2].value = String(s % 60);
    };

    // ── Presets de un toque: carrusel lateral ──
    const secRapidos = el("div", "gym-temp-sec gym-temp-rapidos");
    const filaPres = el("div", "gym-temp-presets");
    const chips = new Map<number, HTMLButtonElement>();
    let rapidoPendienteDeEliminar: number | null = null;
    let rapidosEnEdicion = false;
    let rapidoEnfocadoMs: number | null = null;
    const guardarOpcionesRapidas = async (opciones: number[], salirDeEdicion = false): Promise<void> => {
        const ordenadas = [...opciones].sort((a, b) => a - b);
        const ajustes = normalizarAjustes({ ...conf(), opcionesRapidasTemporizador: ordenadas });
        await persistirAjustes(ajustes);
        rapidoPendienteDeEliminar = null;
        if (salirDeEdicion) rapidosEnEdicion = false;
        renderizarRapidos();
        notificar();
        toast("Opciones rápidas actualizadas.");
    };
    const renderizarRapidos = (): void => {
        filaPres.empty();
        chips.clear();
        for (const ms of conf().opcionesRapidasTemporizador) {
            const texto = fmt(ms);
            const chip = el("button", "gym-chip gym-temp-chip", texto);
            chip.type = "button";
            chip.classList.toggle("enfocado", !rapidosEnEdicion && rapidoEnfocadoMs === ms);
            chip.title = rapidosEnEdicion
                ? `Marcar ${texto} para eliminar`
                : rapidoEnfocadoMs === ms
                    ? `Iniciar la cuenta atrás de ${texto}`
                    : `Enfocar la cuenta atrás de ${texto}`;
            chip.setAttribute("aria-label", rapidosEnEdicion
                ? `Marcar ${texto} para eliminar; pulsa de nuevo para eliminar`
                : rapidoEnfocadoMs === ms
                    ? `Iniciar la cuenta atrás de ${texto}`
                    : `Enfocar la cuenta atrás de ${texto}`);
            if (rapidosEnEdicion) chip.appendChild(el("span", "gym-temp-chip-x", "×"));
            chip.onclick = () => {
                if (!rapidosEnEdicion) {
                    rapidoPendienteDeEliminar = null;
                    if (rapidoEnfocadoMs === ms) {
                        rapidoEnfocadoMs = null;
                        configuracionTemporizadorAbierta = false;
                        arrancar(ms);
                    } else {
                        rapidoEnfocadoMs = ms;
                        elegirDuracion(ms);
                        renderizarRapidos();
                    }
                    return;
                }
                if (rapidoPendienteDeEliminar === ms) {
                    void guardarOpcionesRapidas(conf().opcionesRapidasTemporizador.filter(opcion => opcion !== ms))
                        .catch(error => {
                            console.error("Gym Stone: no se pudo eliminar la opción rápida.", error);
                            toast("No se pudo eliminar la opción rápida.", false);
                        });
                    return;
                }
                rapidoPendienteDeEliminar = ms;
                chips.forEach((elemento, duracion) =>
                    elemento.classList.toggle("marcado-eliminar", duracion === ms));
            };
            filaPres.appendChild(chip);
            chips.set(ms, chip);
        }
        const editarRapidos = el("button", "gym-chip gym-temp-chip gym-temp-editar", rapidosEnEdicion ? "+" : "✎");
        editarRapidos.type = "button";
        editarRapidos.setAttribute("aria-label", rapidosEnEdicion
            ? "Añadir el tiempo de ajustar a opciones rápidas y salir de edición"
            : "Editar opciones rápidas");
        editarRapidos.title = rapidosEnEdicion
            ? "Añadir el tiempo de ajustar a opciones rápidas y salir de edición"
            : "Editar opciones rápidas";
        editarRapidos.onclick = () => {
            if (!rapidosEnEdicion) {
                rapidosEnEdicion = true;
                rapidoPendienteDeEliminar = null;
                rapidoEnfocadoMs = null;
                renderizarRapidos();
                return;
            }
            const duracion = Math.round(msDeEntradas() / 1000) * 1000;
            const opciones = conf().opcionesRapidasTemporizador;
            if (!Number.isFinite(duracion) || duracion < 1000 || duracion > 99 * 3600000) {
                rapidosEnEdicion = false;
                renderizarRapidos();
                toast("El tiempo debe estar entre 00:00:01 y 99:00:00.", false);
                return;
            }
            if (opciones.includes(duracion)) {
                rapidosEnEdicion = false;
                renderizarRapidos();
                toast("Ese tiempo ya existe en opciones rápidas.", false);
                return;
            }
            void guardarOpcionesRapidas([...opciones, duracion], true).catch(error => {
                console.error("Gym Stone: no se pudo añadir la opción rápida.", error);
                toast("No se pudo añadir la opción rápida.", false);
            });
        };
        filaPres.appendChild(editarRapidos);
    };
    renderizarRapidos();
    secRapidos.appendChild(filaPres);
    secConfiguracion.appendChild(secRapidos);

    // ── Controles: los ajustes del descanso de la sesión guiada (−15 s,
    //    ＋15 s). El botón principal y «Eliminar» van debajo, cada uno en su
    //    propia fila. ──
    const controles = el("div", "gym-temp-controles");
    const bMenos = el("button", "gym-btn-g", "−15 s"); bMenos.type = "button";
    bMenos.title = "Restar 15 segundos";
    const bMas = el("button", "gym-btn-g", "＋15 s"); bMas.type = "button";
    bMas.title = "Sumar 15 segundos";
    const ajustarDesdeControles = (deltaMs: number): void => {
        if (configuracionTemporizadorAbierta) {
            totalMs = Math.max(1000, msDeEntradas() + deltaMs);
            fijarEntradas(totalMs);
            notificar();
            return;
        }
        const temporizadorEnfocado = modo === "cuenta-atras"
            ? temporizadores.find(t => t.id === temporizadorEnAnilloId && t.estado !== "terminado")
            : undefined;
        if (temporizadorEnfocado) {
            const restanteMs = restante(temporizadorEnfocado);
            if (temporizadorEnfocado.estado === "en-marcha" && restanteMs <= 0) {
                terminar(temporizadorEnfocado);
                avisar([temporizadorEnfocado]);
                eliminarTemporizador(temporizadorEnfocado);
                actualizarReloj();
                notificar();
                return;
            }
            const restanteNuevo = Math.max(1000, restanteMs + deltaMs);
            const transcurrido = Math.max(0, temporizadorEnfocado.duracionMs - restanteMs);
            temporizadorEnfocado.restanteMs = restanteNuevo;
            temporizadorEnfocado.finEn = temporizadorEnfocado.estado === "en-marcha"
                ? Date.now() + restanteNuevo : null;
            temporizadorEnfocado.duracionMs = transcurrido + restanteNuevo;
            reiniciarCuentaAtras(temporizadorEnfocado.id);
            notificar();
            return;
        }
        totalMs = Math.max(1000, msDeEntradas() + deltaMs);
        fijarEntradas(totalMs);
        notificar();
    };
    bMenos.onclick = () => ajustarDesdeControles(-15000);
    bMas.onclick = () => ajustarDesdeControles(15000);
    controles.append(bMenos, bMas);

    // Inicia una nueva cuenta atrás sin afectar las que ya están en la lista.
    const bIniciar = el("button", "gym-btn gym-temp-iniciar primario", "▶ Iniciar");
    bIniciar.type = "button";
    bIniciar.onclick = () => {
        const ms = msDeEntradas();
        if (ms < 1000) return toast("⚠️ Pon al menos 1 segundo.", false);
        configuracionTemporizadorAbierta = false;
        arrancar(ms);
    };
    m.caja.appendChild(secConfiguracion);
    const pieControles = el("div", "gym-temp-pie gym-temp-pie-controles");
    pieControles.append(controles, bIniciar);
    m.caja.appendChild(pieControles);
    const controlesCronometro = el("div", "gym-temp-pie gym-temp-pie-cronometro");
    const filaControlesCronometro = el("div", "gym-temp-cronometro-controles");
    filaControlesCronometro.append(bParcial, bCronometro);
    controlesCronometro.appendChild(filaControlesCronometro);
    m.caja.appendChild(controlesCronometro);
    m.caja.addEventListener("click", evento => {
        if (!rapidosEnEdicion) return;
        const rutaEvento = evento.composedPath();
        if ([secAjustar, secRapidos, controles].some(area => rutaEvento.includes(area))) return;
        rapidosEnEdicion = false;
        rapidoPendienteDeEliminar = null;
        renderizarRapidos();
        notificar();
    });

    // ── Repintado: lee el estado del módulo y lo refleja en pantalla ──
    const pintarTemporizadores = (): void => {
        const idsActuales = new Set(temporizadores.map(t => t.id));
        for (const [id, fila] of filas) {
            if (idsActuales.has(id)) continue;
            fila.fila.remove();
            filas.delete(id);
        }
        for (const temporizador of temporizadores) {
            let fila = filas.get(temporizador.id);
            if (!fila) {
                const elemento = el("div", "gym-temp-fila");
                const metadatos = el("div", "gym-temp-fila-meta");
                const alarma = el("span", "gym-temp-fila-alarma");
                const duracion = el("span", "gym-temp-fila-duracion");
                metadatos.append(alarma, el("span", "gym-temp-fila-separador", "·"), duracion);
                elemento.onclick = evento => {
                    if (!(evento.target instanceof Element)
                        || evento.target.closest(".gym-temp-fila-acciones")) return;
                    if (temporizadorPendienteEliminarId !== temporizador.id) {
                        temporizadorPendienteEliminarId = null;
                    }
                    temporizadorEnAnilloId = temporizador.id;
                    notificar();
                };
                const detalle = el("div", "gym-temp-detalle");
                const tiempo = el("span", "gym-temp-fila-tiempo");
                const progreso = el("div", "gym-temp-fila-progreso");
                progreso.setAttribute("role", "meter");
                progreso.setAttribute("aria-label", "Tiempo restante de la cuenta atrás");
                progreso.setAttribute("aria-valuemin", "0");
                progreso.setAttribute("aria-valuemax", "100");
                const progresoRelleno = el("div", "gym-temp-fila-progreso-relleno");
                progreso.appendChild(progresoRelleno);
                detalle.appendChild(tiempo);
                const alternar = el("button", "gym-btn-g gym-temp-fila-accion");
                alternar.type = "button";
                alternar.onclick = () => alternarPausa(temporizador);
                const eliminar = el("button", "gym-btn-g gym-temp-fila-accion gym-temp-fila-eliminar", "×");
                eliminar.type = "button";
                eliminar.setAttribute("aria-label", "Eliminar cuenta atrás");
                eliminar.title = "Eliminar esta cuenta atrás";
                eliminar.onclick = () => eliminarEnDosToques(temporizador);
                const acciones = el("div", "gym-temp-fila-acciones");
                acciones.append(alternar, eliminar);
                const resumen = el("div", "gym-temp-fila-resumen");
                resumen.append(detalle, acciones);
                elemento.append(metadatos, resumen, progreso);
                listaTemporizadores.appendChild(elemento);
                fila = { fila: elemento, alarma, duracion, tiempo, progreso, progresoRelleno, alternar, eliminar };
                filas.set(temporizador.id, fila);
            }
            const restanteMs = restante(temporizador);
            fila.tiempo.textContent = fmtReloj(restanteMs);
            fila.alarma.textContent = temporizador.estado === "terminado"
                ? "Temporizador terminado" : `🔔 ${formatoHora(Date.now() + restanteMs)}`;
            fila.duracion.textContent = fmtTotal(temporizador.duracionMs);
            const porcentaje = Math.min(100, Math.max(0, restanteMs / temporizador.duracionMs * 100));
            fila.progresoRelleno.style.width = `${porcentaje}%`;
            fila.progreso.setAttribute("aria-valuenow", String(Math.round(porcentaje)));
            fila.progreso.setAttribute("aria-valuetext", `${Math.round(porcentaje)} % restante`);
            fila.fila.classList.toggle("en-marcha", temporizador.estado === "en-marcha");
            fila.fila.classList.toggle("terminado", temporizador.estado === "terminado");
            fila.fila.classList.toggle("enfocado", temporizadorEnAnilloId === temporizador.id);
            fila.alternar.textContent = temporizador.estado === "en-marcha"
                ? "⏸️" : temporizador.estado === "pausado" ? "▶" : "✓";
            fila.alternar.setAttribute("aria-label", temporizador.estado === "en-marcha"
                ? "Pausar cuenta atrás" : temporizador.estado === "pausado" ? "Reanudar cuenta atrás" : "Cuenta atrás terminada");
            fila.alternar.title = temporizador.estado === "en-marcha"
                ? "Pausar" : temporizador.estado === "pausado" ? "Reanudar" : "Terminada";
            fila.alternar.classList.toggle("gym-temp-fila-reanudar", temporizador.estado !== "en-marcha");
            fila.alternar.disabled = temporizador.estado === "terminado";
            const eliminacionArmada = temporizadorPendienteEliminarId === temporizador.id;
            fila.eliminar.classList.toggle("gym-temp-fila-eliminar-armado", eliminacionArmada);
            fila.eliminar.title = eliminacionArmada
                ? "Pulsa de nuevo para eliminar esta cuenta atrás" : "Eliminar esta cuenta atrás";
        }
        secLista.classList.toggle("gym-oculto",
            modo !== "cuenta-atras" || vistaTemporizadores !== "lista");
        secLista.querySelector(".gym-temp-lista-vacia")?.classList.toggle("gym-oculto", temporizadores.length > 0);
    };

    const pintarPuntos = (): void => {
        const idsActuales = new Set(temporizadores.map(t => t.id));
        for (const [id, punto] of puntos) {
            if (idsActuales.has(id)) continue;
            punto.remove();
            puntos.delete(id);
        }
        temporizadores.forEach((temporizador, indice) => {
            let punto = puntos.get(temporizador.id);
            if (!punto) {
                punto = el("button", "gym-temp-punto");
                punto.type = "button";
                punto.onclick = () => {
                    const indiceActual = temporizadores.findIndex(t => t.id === temporizadorEnAnilloId);
                    const indiceNuevo = temporizadores.findIndex(t => t.id === temporizador.id);
                    const distanciaSiguiente = (indiceNuevo - indiceActual + temporizadores.length) % temporizadores.length;
                    temporizadorEnAnilloId = temporizador.id;
                    if (indiceActual !== indiceNuevo) {
                        animarCambioTarjeta(distanciaSiguiente <= temporizadores.length / 2 ? 1 : -1);
                    }
                    notificar();
                };
                puntosTemporizadores.appendChild(punto);
                puntos.set(temporizador.id, punto);
            }
            punto.setAttribute("aria-label", `Mostrar temporizador ${indice + 1} de ${temporizadores.length}`);
            punto.setAttribute("aria-current", String(temporizador.id === temporizadorEnAnilloId));
            punto.classList.toggle("activo", temporizador.id === temporizadorEnAnilloId);
        });
        puntosTemporizadores.classList.toggle("gym-oculto",
            modo !== "cuenta-atras" || vistaTemporizadores !== "circular" || temporizadores.length < 2);
    };

    const pintar = (): void => {
        if (!m.overlay.isConnected) { alPintar = null; return; }   // ya se cerró
        const esCronometro = modo === "cronometro";
        const vista = msDeEntradas();
        totalMs = vista;
        m.caja.classList.toggle("gym-temp-cronometro-activo", esCronometro);
        anillo.classList.remove("listo", "pausa");
        if (esCronometro) {
            const transcurrido = tiempoCronometro();
            const vuelta = (transcurrido % 60000) / 60000;
            barra.style.strokeDashoffset = String(C * (1 - vuelta));
            tTotal.textContent = "Cronómetro";
            tGrande.textContent = fmtReloj(transcurrido, false);
            tHora.textContent = "Tiempo transcurrido";
            estado.textContent = cronometro.estado === "en-marcha" ? "● En marcha" : "⏸ En pausa";
            estado.className = "gym-temp-estado" + (cronometro.estado === "en-marcha" ? " on" : "");
        } else {
            const seleccion = temporizadores.find(t => t.id === temporizadorEnAnilloId);
            if (seleccion) {
                const restanteMs = restante(seleccion);
                const progreso = seleccion.duracionMs > 0
                    ? Math.min(1, Math.max(0, restanteMs / seleccion.duracionMs))
                    : 0;
                barra.style.strokeDashoffset = String(C * (1 - progreso));
                tTotal.textContent = fmtTotal(seleccion.duracionMs);
                tGrande.textContent = fmtReloj(restanteMs);
                tHora.textContent = seleccion.estado === "en-marcha"
                    ? `🔔 ${formatoHora(Date.now() + restanteMs)}`
                    : seleccion.estado === "pausado" ? "En pausa" : "Terminado";
                estado.textContent = seleccion.estado === "en-marcha"
                    ? "● En marcha" : seleccion.estado === "pausado" ? "⏸ En pausa" : "✓ Terminado";
                estado.className = "gym-temp-estado" + (seleccion.estado === "en-marcha" ? " on" : "");
            } else {
                barra.style.strokeDashoffset = String(C);
                tTotal.textContent = fmtTotal(vista);
                tGrande.textContent = fmtReloj(vista);
                tHora.textContent = `🔔 ${formatoHora(Date.now() + vista)}`;
                estado.textContent = "Duración de la próxima cuenta atrás";
                estado.className = "gym-temp-estado";
            }
        }
        bModo.textContent = esCronometro ? "◷ Cuenta atrás" : "⏱ Cronómetro";
        bModo.setAttribute("aria-label", esCronometro ? "Cambiar al modo cuenta atrás" : "Cambiar al modo cronómetro");
        const hayTemporizadores = temporizadores.length > 0;
        const mostrarConfiguracion = !esCronometro
            && (!hayTemporizadores || configuracionTemporizadorAbierta);
        m.caja.classList.toggle("gym-temp-config-abierta", mostrarConfiguracion);
        m.caja.classList.toggle("gym-temp-lista-activa",
            !esCronometro && hayTemporizadores && !mostrarConfiguracion && vistaTemporizadores === "lista");
        secConfiguracion.classList.toggle("gym-oculto", !mostrarConfiguracion);
        bIniciar.classList.toggle("gym-oculto", !mostrarConfiguracion);
        bAjustes.classList.toggle("gym-oculto", esCronometro || !hayTemporizadores || mostrarConfiguracion);
        bAjustes.setAttribute("aria-expanded", String(configuracionTemporizadorAbierta));
        bVista.classList.toggle("gym-oculto", esCronometro || !hayTemporizadores || mostrarConfiguracion);
        bVista.setAttribute("aria-label", vistaTemporizadores === "circular"
            ? "Mostrar temporizadores en lista" : "Mostrar temporizador en círculo");
        bVista.setAttribute("aria-pressed", String(vistaTemporizadores === "lista"));
        bVista.classList.toggle("gym-temp-vista-lista", vistaTemporizadores === "lista");
        anillo.classList.toggle("gym-oculto", !esCronometro && vistaTemporizadores === "lista");
        estado.classList.toggle("gym-oculto", !esCronometro && vistaTemporizadores === "lista");
        const temporizadorCircular = temporizadores.find(t => t.id === temporizadorEnAnilloId);
        const mostrarAccionesCirculares = !esCronometro && !mostrarConfiguracion
            && vistaTemporizadores === "circular" && temporizadorCircular != null;
        accionesCirculares.classList.toggle("gym-oculto", !mostrarAccionesCirculares);
        if (temporizadorCircular && mostrarAccionesCirculares) {
            pausaCircular.textContent = temporizadorCircular.estado === "en-marcha"
                ? "⏸️" : temporizadorCircular.estado === "pausado" ? "▶" : "✓";
            pausaCircular.setAttribute("aria-label", temporizadorCircular.estado === "en-marcha"
                ? "Pausar cuenta atrás"
                : temporizadorCircular.estado === "pausado" ? "Reanudar cuenta atrás" : "Cuenta atrás terminada");
            pausaCircular.disabled = temporizadorCircular.estado === "terminado";
            const eliminacionArmada = temporizadorPendienteEliminarId === temporizadorCircular.id;
            eliminarCircular.classList.toggle("gym-temp-fila-eliminar-armado", eliminacionArmada);
            eliminarCircular.title = eliminacionArmada
                ? "Pulsa de nuevo para eliminar esta cuenta atrás" : "Eliminar esta cuenta atrás";
        }
        controlesCronometro.classList.toggle("gym-oculto", !esCronometro);
        bIniciar.disabled = vista < 1000;
        const temporizadorEnfocado = modo === "cuenta-atras"
            ? temporizadores.find(t => t.id === temporizadorEnAnilloId && t.estado !== "terminado")
            : undefined;
        bMenos.disabled = temporizadorEnfocado
            ? restante(temporizadorEnfocado) <= 1000
            : vista <= 1000;
        controles.classList.toggle("gym-oculto", esCronometro);
        pintarTemporizadores();
        pintarPuntos();
        pintarParciales();
        chips.forEach((chip, ms) => {
            chip.classList.toggle("on", totalMs === ms && rapidoPendienteDeEliminar !== ms);
            chip.classList.toggle("marcado-eliminar", rapidoPendienteDeEliminar === ms);
        });
    };

    // Elegir un preset: fija la duración (campos «Ajustar» y anillo a la vez)
    // y deja el temporizador PARADO, a la espera de «▶ Iniciar». Si había una
    // cuenta atrás previa, no la modifica.
    const elegirDuracion = (ms: number): void => {
        totalMs = Math.max(1000, ms);
        fijarEntradas(totalMs);
        notificar();
    };

    fijarEntradas(totalMs);
    alPintar = pintar;
    pintar();
}
