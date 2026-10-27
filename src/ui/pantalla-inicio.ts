/* ═══════════════════════════════════════════════════════════════════════════
   La pantalla «Inicio»: el índice hecho interfaz, con tres secciones a pantalla
   completa que se cambian desde el carrusel de navegación (sin barra de
   desplazamiento):

     · Rutinas      → los KPIs del resumen + la lista de todas las rutinas
                      (nombre, estado, fechas, semana en curso y sesiones
                      hechas). ES LA SECCIÓN POR DEFECTO al abrir el plugin.
     · Medidas e IMC→ peso corporal, evolución e IMC (la misma sección que en
                      «rutina/estadisticas»).
     · Ejercicios   → el catálogo global, también a pantalla completa.

   NO es una vista de Obsidian: solo PINTA en el contenedor que le pasa la
   pestaña que la aloja (ui/vista-app.ts). Inicio y la ficha de una rutina son
   dos pantallas de UNA misma pestaña, así que cambiar de una a otra no
   destruye ni remonta la vista: los componentes que comparten (cabecera
   naranja, carrusel de navegación, KPIs) se repintan en el mismo sitio y no
   hay salto visual.

   No lee cada archivo de datos: todo sale del índice (Rutinas.md), que se
   regenera solo al guardar.
   ═══════════════════════════════════════════════════════════════════════════ */

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
import { elegirDiaGuiada } from "./sesion-guiada";
import { abrirTemporizador } from "./temporizador";
import { abrirFormulario, abrirRutina } from "./vistas";

/* Las secciones de Inicio, en el orden del carrusel de navegación. */
type SeccionInicio = "rutinas" | "medidas" | "ejercicios";

export class PantallaInicio {
    /* Sección que se muestra ahora. Rutinas es la de por defecto al llegar
       (también al volver desde una rutina): la restablece la pestaña en su
       setState. No viaja en el estado de la pestaña. */
    seccion: SeccionInicio = "rutinas";

    /* Repinta la pestaña entera: se lo pasa la vista que la aloja. */
    constructor(private readonly alRepintar: () => void) {}

    private irA(s: SeccionInicio): void {
        this.seccion = s;
        this.alRepintar();
    }

    /* Rellena el contenedor con la sección activa (la pestaña lo monta ya
       construido, de una sola tacada: ver VistaApp#pintar). */
    async pintar(cont: HTMLElement): Promise<void> {
        // Cabecera naranja: el título de esta pantalla («casa»)
        pintarCabecera(cont, [{ texto: "🏋️ Inicio" }]);

        // Carrusel de navegación: las tres secciones de Inicio, la acción
        // principal (según la sección) y, al final, a la derecha, el
        // temporizador. En «Ejercicios» no hay acción principal: el catálogo
        // no crea rutinas, así que el botón desaparece.
        const botones: BotonNav[] = [
            { texto: "📋 Rutinas", activo: this.seccion === "rutinas",
              alPulsar: () => this.irA("rutinas") },
            { texto: "⚖️ Medidas e IMC", activo: this.seccion === "medidas",
              alPulsar: () => this.irA("medidas") },
            { texto: "🗂 Ejercicios", activo: this.seccion === "ejercicios",
              alPulsar: () => this.irA("ejercicios") },
        ];
        // En «Medidas e IMC» la acción principal registra medidas; en
        // «Rutinas», crea una rutina nueva; en «Ejercicios», ninguna.
        if (this.seccion === "medidas") {
            botones.push({ texto: "＋ Registrar medidas", principal: true, alPulsar: () => void this.abrirMedidas() });
        } else if (this.seccion !== "ejercicios") {
            botones.push({ texto: "＋ Nueva rutina", principal: true, alPulsar: () => void abrirFormulario({ modo: "crear" }) });
        }
        botones.push({ texto: "⏱ Temporizador", alPulsar: () => void abrirTemporizador(), derecha: true });
        pintarNavegacion(cont, botones);

        if (this.seccion === "medidas") return this.pintarMedidas(cont);
        if (this.seccion === "ejercicios") return this.pintarEjercicios(cont);
        return this.pintarRutinas(cont);
    }

    /* ── Sección 1 · Rutinas (la de por defecto) ──
       Igual que «Medidas e IMC»: de arriba a abajo, título con subrayado,
       los KPIs del resumen y DEBAJO la lista. Sin el marco que antes
       rodeaba toda la sección. */
    private async pintarRutinas(cont: HTMLElement): Promise<void> {
        const { indice, error } = await leerIndice();
        pintarTituloSeccion(cont, "📋 Rutinas", "Pulsa una rutina para abrir su dashboard");
        if (error) {
            cont.createDiv({
                cls: "gym-error-vista",
                text: "⚠️ " + error + " — no lo sobrescribo: repáralo a mano (o bórralo y se regenerará vacío).",
            });
        }

        // ── Los datos de la sección: resumen del vault y de las medidas ──
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

        // ── La lista de rutinas ──
        if (!indice.rutinas.length) {
            cont.createDiv({
                cls: "gym-vacio",
                text: "🏋️ Aún no hay rutinas: pulsa «＋ Nueva rutina» para crear la primera.",
            });
            return;
        }

        const lista = cont.createDiv({ cls: "gym-lista-rutinas" });
        // Las activas primero; dentro de cada grupo, las más recientes
        const orden = [...indice.rutinas].sort((a, b) =>
            (a.estado === "activa" ? 0 : a.estado === "pausada" ? 1 : 2) - (b.estado === "activa" ? 0 : b.estado === "pausada" ? 1 : 2)
            || (b.modificada ?? "").localeCompare(a.modificada ?? ""));
        for (const f of orden) lista.appendChild(this.fila(f));
    }

    /* ── Sección 2 · Medidas e IMC ──
       La misma sección que «📈 Estadísticas» dentro de una rutina (peso
       corporal: evolución e IMC), a pantalla completa. */
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
        // Sin encabezado propio: el título de la sección («⚖️ Medidas e IMC»)
        // ya pone Inicio, y su línea punteada no debe aparecer debajo
        seccionMedidas(cont, medidas, { titulo: false });
    }

    /* ── Sección 3 · Ejercicios ──
       El mismo gestor del catálogo, pero ocupando todo el espacio de la
       pestaña en vez de abrirse como popup. */
    private pintarEjercicios(cont: HTMLElement): void {
        pintarTituloSeccion(cont, "🗂 Ejercicios", "nombres y grupos musculares de todo el vault");
        const caja = cont.createDiv({ cls: "gym-ejercicios-inline" });
        pintarGestionEjercicios(caja);
    }

    /* Una fila de la lista: nombre + estado + fechas + progreso, con editar y borrar */
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
        const bGuiada = btn("🎯", "gym-btn-icono", () => void this.sesionGuiada(f));
        bGuiada.title = "🎯 Empezar sesión guiada";
        acciones.appendChild(bGuiada);
        acciones.appendChild(btn("✏️", "gym-btn-icono", () => void abrirFormulario({ modo: "editar", rutinaId: f.id })));
        acciones.appendChild(btn("🗑", "gym-btn-icono", () => void this.borrar(f)));
        return fila;
    }

    /* Atajo de fila: arrancar la sesión guiada de esa rutina sin entrar a su
       ficha (la guiada es un overlay: se vive encima de la lista, y al guardar
       repinta ésta; los cambios de vault también la repintan solos). */
    private async sesionGuiada(f: IndiceRutina): Promise<void> {
        const r = await leerRutina(f.id);
        if (r.error || !r.datos) return toast("⚠️ " + (r.error ?? "No pude leer esa rutina."), false);
        elegirDiaGuiada(r.datos, () => this.alRepintar());
    }

    private async borrar(f: IndiceRutina): Promise<void> {
        const ok = await confirmar("🗑 Borrar rutina",
            `¿Borrar «${f.nombre}»? Se elimina su archivo de datos (queda copia .bak en la misma carpeta) y su fila del índice. Las plantillas y las medidas no se tocan.`,
            "Borrar", "Cancelar", true);   // botón en rojo: es destructivo
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

    /* ── Semana en curso, calculada solo con las fechas del índice ── */
    private semanaDe(f: IndiceRutina): number {
        const d = diffDias(f.inicio, hoy()) + 1;
        if (d <= 0) return 0;                    // aún no ha empezado
        return Math.min(Math.ceil(d / 7), f.semanas || 1);
    }

    private estadoTxt = (f: IndiceRutina): string =>
        f.estado === "pausada" ? "⏸ Pausada" : f.estado === "finalizada" ? "🏁 Finalizada"
            : this.semanaDe(f) > f.semanas ? "✔ Transcurrida" : "🟢 Activa";

    private estadoColor = (f: IndiceRutina): string =>
        f.estado === "pausada" ? "var(--text-muted)"
            : f.estado === "finalizada" || this.semanaDe(f) > f.semanas ? CONFIG.AZUL : CONFIG.VERDE;
}

/* Datos de los que solo depende Inicio (índice, medidas y los archivos de las
   rutinas): un cambio en el vault que no toque nada de eso no la repinta.
   Lo usa la pestaña que la aloja (vista-app.ts). */
export const esRutaDeInicio = (ruta: string): boolean =>
    ruta === rutaIndice() || ruta === rutaMedidas() || ruta.startsWith(carpetaDatos() + "/");
