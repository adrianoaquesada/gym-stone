import { CONFIG, DIAS_LARGO } from "../config";
import { rutaMedidas } from "../ajustes";
import {
    catalogoEjercicios, escribirRutina, esLibre,
    leerMedidas, leerRutina, medidasVacias, resumenLibre, rutaDatosDe, semanaActual,
    semanasTotales, tipoEjercicioDe, transcurrida,
} from "../datos";
import { fechaLegible, hoy, msgError, sumarDias } from "../util";
import type { LecturaNota, MedidasDatos, Rutina } from "../tipos";
import { btn, el, KPI, toast } from "./componentes";
import { textoObjetivoDe } from "./registro";
import { pintarCabecera, pintarNavegacion } from "./cabecera";
import { abrirFormulario, abrirLista } from "./vistas";
import { abrirTemporizador } from "./temporizador";
import { pintarResumenProgresion } from "./progresion";
import { elegirDiaGuiada } from "./sesion-guiada";
import { fijarPintar, type Pintar } from "./pintar";
import { seccionCalendario } from "./calendario";
import { abrirRegistro, formularioAnotacion, formularioMedidas } from "./registro";
import { seccionEstadisticas } from "./estadisticas";
import { seccionHistorial } from "./historial";

export interface OpcionesDashboard {

    rutina?: Rutina;

    alRepintar?: Pintar;

    seccion?: "rutina" | "progresion" | "estadisticas" | "historial";

    alCambiarSeccion?: (seccion: "rutina" | "progresion" | "estadisticas" | "historial") => void;
}

export const pintarDashboard = async (
    cont: HTMLElement, rutinaId: string, ops: OpcionesDashboard = {},
): Promise<void> => {
    cont.empty();

    let rutina = ops.rutina;
    if (!rutina) {
        const r = await leerRutina(rutinaId);
        if (r.error) return pintarError(cont, r.error);
        rutina = r.datos;
    }
    if (!rutina?.id) return pintarError(cont, `El archivo ${rutaDatosDe(rutinaId)} no tiene una rutina dentro.`);

    let medidas: LecturaNota<MedidasDatos> = await leerMedidas();
    if (medidas.error) {

        toast("⚠️ " + medidas.error, false);
        medidas = { datos: medidasVacias(), ruta: rutaMedidas() };
    }

    const cont2 = el("div", "gym-g");
    cont.appendChild(cont2);

    pintarCabecera(cont2, [
        { texto: `🏋️ ${rutina.nombre || "Sin nombre"}` },
    ], {
        subtitulo: `${rutina.objetivo ? rutina.objetivo + " · " : ""}` +
            `${fechaLegible(rutina.inicio)} → ${fechaLegible(rutina.fin)}`,
    });

    const pintar: Pintar = () => (ops.alRepintar ? ops.alRepintar() : pintarDashboard(cont, rutinaId));
    const cambiarSeccion = (seccion: "rutina" | "progresion" | "estadisticas" | "historial"): void => {
        if (ops.alCambiarSeccion) {
            ops.alCambiarSeccion(seccion);
            return;
        }
        void pintarDashboard(cont, rutinaId, { ...ops, rutina, seccion });
    };

    pintarNavegacion(cont2, [
        { texto: "← Inicio", alPulsar: () => void abrirLista() },
        {
            texto: "🏋️ Rutina",
            activo: !ops.seccion || ops.seccion === "rutina",
            alPulsar: () => cambiarSeccion("rutina"),
        },
        { texto: "✏️ Editar", alPulsar: () => void abrirFormulario({ modo: "editar", rutinaId }) },
        { texto: "🎯 Empezar sesión guiada", alPulsar: () => elegirDiaGuiada(rutina, pintar), principal: true },
        { texto: "＋ Registrar sesión", alPulsar: () => abrirRegistro(rutina, { fecha: hoy(), diaId: rutina.dias?.[0]?.id }, pintar) },
        { texto: "📝 Anotación", alPulsar: () => formularioAnotacion(rutina, hoy(), pintar) },
        { texto: "⚖️ Registrar medidas", alPulsar: () => formularioMedidas(medidas, pintar) },
        {
            texto: "📈 Estadísticas",
            activo: ops.seccion === "estadisticas",
            alPulsar: () => cambiarSeccion("estadisticas"),
        },
        {
            texto: "📈 Progresión",
            activo: ops.seccion === "progresion",
            alPulsar: () => cambiarSeccion("progresion"),
        },
        {
            texto: "🗓 Historial",
            activo: ops.seccion === "historial",
            alPulsar: () => cambiarSeccion("historial"),
        },
        { texto: "⏱ Temporizador", alPulsar: () => void abrirTemporizador(), derecha: true },
    ]);

    if (ops.seccion === "progresion") {
        const contenido = el("div", "gym-rutina-contenido");
        cont2.appendChild(contenido);
        await pintarResumenProgresion(contenido, { rutinaId: rutina.id });
    } else if (ops.seccion === "estadisticas") {
        const contenido = el("div", "gym-rutina-contenido");
        cont2.appendChild(contenido);
        seccionEstadisticas(contenido, rutina, medidas);
    } else if (ops.seccion === "historial") {
        const contenido = el("div", "gym-rutina-contenido");
        cont2.appendChild(contenido);
        seccionHistorial(contenido, rutina);
    } else {
        seccionDetalles(cont2, rutina, pintar);
        seccionCalendario(cont2, rutina, pintar);
    }

    fijarPintar(pintar);
};

const pintarError = (cont: HTMLElement, msg: string): void => {
    const c = el("div", "gym-aviso");
    c.append(`⚠️ ${msg}`, el("br"));
    c.append(el("span", "gym-tenue", "No toco nada hasta que el archivo de datos vuelva a estar legible."));
    cont.appendChild(c);
};

const seccionDetalles = (c: HTMLElement, rutina: Rutina, pintar: Pintar): void => {
    const fila = el("div", "display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px;");
    c.appendChild(fila);

    const semTotal = semanasTotales(rutina) || 1;
    const semActual = semanaActual(rutina);
    const avance = Math.max(0, Math.min(1, semActual / semTotal));

    fila.appendChild(KPI("Estado", estadoTxt(rutina), colorEstado(rutina),
        transcurrida(rutina) ? "pasada su fecha de fin" : `${semTotal} semanas`));
    fila.appendChild(KPI("Progreso", `Sem. ${semActual || "–"}/${semTotal}`, CONFIG.NARANJA,
        barraAvance(avance)));
    if (esLibre(rutina)) {

        const res = resumenLibre(rutina);
        const cat = catalogoEjercicios(rutina);
        fila.appendChild(KPI("Días entrenados", String(res.dias), CONFIG.AZUL,
            res.racha ? `racha de ${res.racha} semana${res.racha > 1 ? "s" : ""} seguidas`
                      : "sin plan semanal: registras lo que haces"));
        fila.appendChild(KPI("Ejercicios", String(cat.length), CONFIG.VERDE,
            `${(rutina.sesiones ?? []).length} ${rutina.sesiones?.length === 1 ? "sesión" : "sesiones"} registradas`));
    } else {
        fila.appendChild(KPI("Días / semana", String(new Set((rutina.diasSemana ?? []).map(Number)).size || "–"), CONFIG.AZUL,
            (rutina.diasSemana ?? []).map(n => DIAS_LARGO[(Number(n) || 1) - 1]?.slice(0, 3)).filter(Boolean).join(" · ") || "sin días asignados"));
        fila.appendChild(KPI("Ejercicios", String((rutina.dias ?? []).reduce((t, d) => t + (d.ejercicios?.length ?? 0), 0)), CONFIG.VERDE,
            `${(rutina.dias ?? []).length} ${rutina.dias?.length === 1 ? "día" : "días"}`));
    }

    if (esLibre(rutina)) {
        const cat = catalogoEjercicios(rutina);
        const box = el("div", "gym-caja gym-margen");
        box.append(el("div", "gym-tit-naranja", "🗒 Rutina libre"));
        box.append(el("div", "gym-caja-sub",
            "Sin días de la semana ni ejercicios fijos: cada día anotas lo que haces de verdad. " +
            "Las variantes cuentan aparte («Press banca» y «Press banca con mancuernas» tienen su propia progresión)."));
        if (cat.length) {
            const chips = el("div", "gym-caja-chips");
            for (const x of cat.slice(0, 40)) chips.append(el("span", "gym-chip", x.nombre));
            box.append(chips);
            if (cat.length > 40) box.append(el("div", "gym-caja-mas", `…y ${cat.length - 40} más`));
        } else {
            box.append(el("div", "gym-caja-vacio", "Todavía no has registrado ningún ejercicio."));
        }
        c.appendChild(box);
    } else {
        const est = el("div", "display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin:6px 0 4px;");
        for (const d of rutina.dias ?? []) {
            const box = el("div", "gym-caja");
            const diasTxt = (d.diasSemana ?? []).map(n => DIAS_LARGO[(Number(n) || 1) - 1]).filter(Boolean).join(", ");
            box.append(el("div", "gym-tit-naranja", d.nombre));
            box.append(el("div", "gym-caja-dias", diasTxt || "sin días asignados"));
            const ul = el("ul", "gym-caja-ul");
            for (const e of d.ejercicios ?? []) {
                const li = el("li");

                const descSeg = Number(e.descansoSeg);
                const desc = tipoEjercicioDe(e) === "intervalo"
                    ? (descSeg > 0 ? ` · desc. ${Math.round(descSeg)}s` : " · sin descanso")
                    : (e.descansoSeg ? ` · desc. ${e.descansoSeg}s` : "");
                li.append(e.nombre, " ",
                    el("span", "gym-tenue", `· ${textoObjetivoDe(e)}${desc}`));
                ul.appendChild(li);
            }
            box.appendChild(ul);
            est.appendChild(box);
        }
        c.appendChild(est);
    }

    if (transcurrida(rutina)) {
        const acciones = el("div", "gym-botones");
        acciones.appendChild(btn("➕ Extender 4 semanas", "", () => void extender(rutina, pintar)));
        c.appendChild(acciones);
    }
};

const estadoTxt = (r: Rutina): string =>
    r.estado === "pausada" ? "⏸ Pausada" : r.estado === "finalizada" ? "🏁 Finalizada"
        : transcurrida(r) ? "✔ Transcurrida" : "🟢 Activa";
const colorEstado = (r: Rutina): string =>
    r.estado === "pausada" ? "var(--text-muted)" : r.estado === "finalizada" || transcurrida(r)
        ? CONFIG.AZUL : CONFIG.VERDE;

const barraAvance = (avance: number): HTMLSpanElement => {
    const marco = el("span", "gym-progreso");
    const relleno = el("span", "gym-progreso-fill");
    relleno.style.width = `${(Math.max(0, Math.min(1, avance)) * 100).toFixed(0)}%`;
    marco.appendChild(relleno);
    return marco;
};

const extender = async (rutina: Rutina, pintar: Pintar): Promise<void> => {
    try {
        rutina.fin = sumarDias(rutina.fin, 28);
        rutina.semanas = (semanasTotales(rutina) || 0) + 4;
        if (rutina.estado === "finalizada") rutina.estado = "activa";
        await escribirRutina(rutina);
        toast(`✅ Rutina extendida hasta el ${rutina.fin}`);
        await pintar();
    } catch (e: unknown) {
        console.error("[Gym Stone extender]", e);
        toast("⚠️ No pude extender la rutina: " + msgError(e), false);
    }
};
