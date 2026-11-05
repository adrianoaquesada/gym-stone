import { CONFIG } from "../config";
import { carpetaDatos, rutaIndice, rutaMedidas } from "../ajustes";
import { borrarRutina, leerIndice, leerMedidas, leerRutina, ultimaMedida } from "../datos";
import type { IndiceRutina } from "../tipos";
import { diffDias, fechaLegible, hoy, msgError } from "../util";
import { pesoTexto, tallaTexto } from "../unidades";
import { KPI, btn, confirmar, el, toast } from "./componentes";
import { pintarCabecera, pintarNavegacion, pintarTituloSeccion, type BotonNav } from "./cabecera";
import { pintarGestionEjercicios } from "./ejercicios-ui";
import { formularioMedidas } from "./registro";
import { seccionMedidas } from "./estadisticas";
import { pintarResumenProgresion } from "./progresion";
import {
    elegirDiaGuiada, prepararBotonSesionGuiada, retomarSesionGuiadaMinimizada,
} from "./sesion-guiada";
import { abrirTemporizador } from "./temporizador";
import { abrirFormulario, abrirRutina } from "./vistas";

type SeccionInicio = "rutinas" | "estadisticas" | "medidas" | "ejercicios";

export class PantallaInicio {

    seccion: SeccionInicio = "rutinas";

    constructor(private readonly alRepintar: () => void) {}

    private irA(s: SeccionInicio): void {
        this.seccion = s;
        this.alRepintar();
    }

    async pintar(cont: HTMLElement): Promise<void> {

        pintarCabecera(cont, [{ texto: "🏋️ Inicio" }]);

        const botones: BotonNav[] = [
            { texto: "📋 Rutinas", activo: this.seccion === "rutinas",
              alPulsar: () => this.irA("rutinas") },
            { texto: "📊 Estadísticas", activo: this.seccion === "estadisticas",
              alPulsar: () => this.irA("estadisticas") },
            { texto: "⚖️ Medidas e IMC", activo: this.seccion === "medidas",
              alPulsar: () => this.irA("medidas") },
            { texto: "🗂 Ejercicios", activo: this.seccion === "ejercicios",
              alPulsar: () => this.irA("ejercicios") },
        ];

        if (this.seccion === "medidas") {
            botones.push({ texto: "＋ Registrar medidas", principal: true, alPulsar: () => void this.abrirMedidas() });
        } else if (this.seccion === "rutinas") {
            botones.push({ texto: "＋ Nueva rutina", principal: true, alPulsar: () => void abrirFormulario({ modo: "crear" }) });
        } else if (this.seccion === "estadisticas") {
            botones.push({ texto: "＋ Registrar medidas", principal: true, alPulsar: () => void this.abrirMedidas() });
        }
        botones.push({ texto: "⏱ Temporizador", alPulsar: () => void abrirTemporizador(), derecha: true });
        pintarNavegacion(cont, botones);

        if (this.seccion === "medidas") return this.pintarMedidas(cont);
        if (this.seccion === "ejercicios") return this.pintarEjercicios(cont);
        if (this.seccion === "estadisticas") {
            const contenido = el("div", "gym-inicio-contenido");
            cont.appendChild(contenido);
            return pintarResumenProgresion(contenido, { estadisticasGlobales: true });
        }
        return this.pintarRutinas(cont);
    }

    private async pintarRutinas(cont: HTMLElement): Promise<void> {
        const { indice, error } = await leerIndice();
        pintarTituloSeccion(cont, "📋 Rutinas", "Pulsa una rutina para abrir su dashboard");
        if (error) {
            cont.createDiv({
                cls: "gym-error-vista",
                text: "⚠️ " + error + " — no lo sobrescribo: repáralo a mano (o bórralo y se regenerará vacío).",
            });
        }

        const resumen = cont.createDiv({ cls: "gym-kpis" });
        const activas = indice.rutinas.filter(f => f.estado === "activa").length;
        const totalSesiones = indice.rutinas.reduce((n, f) => n + (f.sesiones || 0), 0);
        resumen.appendChild(KPI("Rutinas", String(indice.rutinas.length), CONFIG.NARANJA,
            indice.rutinas.length ? `${activas} activas` : undefined));
        resumen.appendChild(KPI("Sesiones hechas", String(totalSesiones), CONFIG.VERDE));

        const medidas = await leerMedidas();
        if (medidas.error) toast("⚠️ " + medidas.error, false);
        const ult = ultimaMedida(medidas.datos);
        if (ult.pesoKg != null) {
            resumen.appendChild(KPI("Peso actual", pesoTexto(ult.pesoKg), CONFIG.AZUL,
                ult.fecha ? fechaLegible(ult.fecha) : undefined));
        }
        if (ult.tallaCm != null) {
            resumen.appendChild(KPI("Talla", tallaTexto(ult.tallaCm), CONFIG.AZUL));
        }
        if (ult.imc != null) {
            resumen.appendChild(KPI("IMC", ult.imc.toFixed(1), CONFIG.VERDE));
        }

        if (!indice.rutinas.length) {
            cont.createDiv({
                cls: "gym-vacio",
                text: "🏋️ Aún no hay rutinas: pulsa «＋ Nueva rutina» para crear la primera.",
            });
            return;
        }

        const lista = cont.createDiv({ cls: "gym-lista-rutinas" });

        const orden = [...indice.rutinas].sort((a, b) =>
            (a.estado === "activa" ? 0 : a.estado === "pausada" ? 1 : 2) - (b.estado === "activa" ? 0 : b.estado === "pausada" ? 1 : 2)
            || (b.modificada ?? "").localeCompare(a.modificada ?? ""));
        for (const f of orden) lista.appendChild(this.fila(f));
    }

    private async pintarMedidas(cont: HTMLElement): Promise<void> {
        pintarTituloSeccion(cont, "⚖️ Medidas e IMC", "peso corporal, evolución e IMC");
        const medidas = await leerMedidas();
        if (medidas.error) {
            cont.createDiv({
                cls: "gym-error-vista",
                text: "⚠️ " + medidas.error + " — no lo sobrescribo: repáralo a mano (o bórralo y se regenerará vacío).",
            });
            return;
        }

        seccionMedidas(cont, medidas, { titulo: false });
    }

    private pintarEjercicios(cont: HTMLElement): void {
        pintarTituloSeccion(cont, "🗂 Ejercicios", "nombres y grupos musculares de todo el vault");
        const caja = cont.createDiv({ cls: "gym-ejercicios-inline" });
        pintarGestionEjercicios(caja);
    }

    private fila(f: IndiceRutina): HTMLElement {
        const fila = el("div", "gym-fila-rutina");

        const principal = btn("", "gym-fila-rutina-principal", () => void abrirRutina(f.id));
        principal.createSpan({ cls: "gym-fila-nombre", text: f.nombre });
        const sem = this.semanaDe(f);
        const meta = [
            this.estadoTxt(f),
            f.inicio ? `${fechaLegible(f.inicio)} → ${f.fin ? fechaLegible(f.fin) : "…"}` : "",
            sem > 0 ? `Semana ${sem}/${f.semanas || "?"}` : "",
            `${f.sesiones || 0} sesiones`,
        ].filter(Boolean).join(" · ");
        const m = principal.createSpan({ cls: "gym-fila-meta", text: meta });
        m.style.color = this.estadoColor(f);
        fila.appendChild(principal);

        const acciones = fila.createDiv({ cls: "gym-fila-rutina-acciones" });
        const bGuiada = btn("🎯", "gym-btn-icono", () => {
            if (!retomarSesionGuiadaMinimizada()) void this.sesionGuiada(f);
        });
        bGuiada.title = "🎯 Empezar sesión guiada";
        prepararBotonSesionGuiada(bGuiada, "🎯 ↩ Retomar sesión guiada");
        acciones.appendChild(bGuiada);
        acciones.appendChild(btn("✏️", "gym-btn-icono", () => void abrirFormulario({ modo: "editar", rutinaId: f.id })));
        acciones.appendChild(btn("🗑", "gym-btn-icono", () => void this.borrar(f)));
        return fila;
    }

    private async sesionGuiada(f: IndiceRutina): Promise<void> {
        const r = await leerRutina(f.id);
        if (r.error || !r.datos) return toast("⚠️ " + (r.error ?? "No pude leer esa rutina."), false);
        elegirDiaGuiada(r.datos, () => this.alRepintar());
    }

    private async borrar(f: IndiceRutina): Promise<void> {
        const ok = await confirmar("🗑 Borrar rutina",
            `¿Borrar «${f.nombre}»? Se elimina su archivo de datos (queda copia .bak en la misma carpeta) y su fila del índice. Las plantillas y las medidas no se tocan.`,
            "Borrar", "Cancelar", true);
        if (!ok) return;
        try {
            await borrarRutina(f.id);
            toast(`🗑 Rutina «${f.nombre}» borrada (copia .bak guardada)`);
            this.alRepintar();
        } catch (e: unknown) {
            console.error("[Gym Stone borrar]", e);
            toast("⚠️ No pude borrar la rutina: " + msgError(e), false);
        }
    }

    private async abrirMedidas(): Promise<void> {
        const medidas = await leerMedidas();
        if (medidas.error) toast("⚠️ " + medidas.error, false);
        formularioMedidas(medidas, () => this.alRepintar());
    }

    private semanaDe(f: IndiceRutina): number {
        const d = diffDias(f.inicio, hoy()) + 1;
        if (d <= 0) return 0;
        return Math.min(Math.ceil(d / 7), f.semanas || 1);
    }

    private estadoTxt = (f: IndiceRutina): string =>
        f.estado === "pausada" ? "⏸ Pausada" : f.estado === "finalizada" ? "🏁 Finalizada"
            : this.semanaDe(f) > f.semanas ? "✔ Transcurrida" : "🟢 Activa";

    private estadoColor = (f: IndiceRutina): string =>
        f.estado === "pausada" ? "var(--text-muted)"
            : f.estado === "finalizada" || this.semanaDe(f) > f.semanas ? CONFIG.AZUL : CONFIG.VERDE;
}

export const esRutaDeInicio = (ruta: string): boolean =>
    ruta === rutaIndice() || ruta === rutaMedidas() || ruta.startsWith(carpetaDatos() + "/");
