import { ItemView, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { aplicacion } from "../estado";
import { rutaIndice } from "../ajustes";
import { leerRutina, rutaDatosDe } from "../datos";
import type { Rutina } from "../tipos";
import { el } from "./componentes";
import { pintarDashboard } from "./gestor";
import { PantallaInicio, esRutaDeInicio } from "./pantalla-inicio";
import { pintarResumenProgresion } from "./progresion";
import { VISTA_APP, VISTA_LISTA, VISTA_RUTINA, abrirLista, abrirRutina } from "./vistas";

type Pantalla = "lista" | "rutina" | "progresion";

interface EstadoApp {
    [k: string]: unknown;
    pantalla?: Pantalla;
    rutinaId?: string | null;
    seccionRutina?: "rutina" | "progresion" | "estadisticas" | "historial";
}

export class VistaApp extends ItemView {

    protected pantallaPorDefecto: Pantalla = "lista";

    private pantalla: Pantalla = "lista";
    private seccionRutina: "rutina" | "progresion" | "estadisticas" | "historial" = "rutina";
    private rutinaId: string | null = null;
    private nombre = "";
    private pintadaEn: Pantalla | null = null;
    private pintando = 0;
    private readonly inicio: PantallaInicio;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.inicio = new PantallaInicio(() => void this.pintar());
    }

    getViewType(): string { return VISTA_APP; }
    getDisplayText(): string {
        if (this.pantalla === "rutina") return this.nombre || (this.rutinaId ? `Gym stone · ${this.rutinaId}` : "Gym stone");
        if (this.pantalla === "progresion") return "Progresión";
        return "Gym stone";
    }
    getIcon(): string { return "dumbbell"; }

    getState(): EstadoApp {
        return { pantalla: this.pantalla, rutinaId: this.rutinaId, seccionRutina: this.seccionRutina };
    }

    async setState(state: EstadoApp, result: ViewStateResult): Promise<void> {
        await super.setState(state, result);
        const p = state?.pantalla;
        this.pantalla = p === "lista" || p === "rutina" || p === "progresion"
            ? p : this.pantallaPorDefecto;
        this.rutinaId = state?.rutinaId ?? null;
        const seccion = state?.seccionRutina;
        this.seccionRutina = seccion === "progresion" || seccion === "estadisticas" || seccion === "historial"
            ? seccion : "rutina";

        if (this.pantalla === "lista") this.inicio.seccion = "rutinas";
        await this.pintar();
    }

    async onOpen(): Promise<void> {

        const st = this.leaf.getViewState()?.state;
        if (!this.rutinaId && typeof st?.rutinaId === "string") this.rutinaId = st.rutinaId;

        this.registerEvent(aplicacion().vault.on("modify", f => this.trasCambio(f.path)));
        this.registerEvent(aplicacion().vault.on("create", f => this.trasCambio(f.path)));
        this.registerEvent(aplicacion().vault.on("delete", f => this.trasCambio(f.path)));
        await this.pintar();
    }

    private trasCambio(ruta: string): void {
        const toca = this.pantalla === "rutina"
            ? Boolean(this.rutinaId) && ruta === rutaDatosDe(this.rutinaId!)
            : esRutaDeInicio(ruta);
        if (toca) void this.pintar();
    }

    private accionesHechas = false;

    private acciones(): void {
        if (this.accionesHechas) return;
        this.accionesHechas = true;

        this.addAction("refresh-cw", "Recargar", () => void this.pintar());
    }

    rutaMarkdown(): string | null {
        return this.pantalla === "rutina"
            ? (this.rutinaId ? rutaDatosDe(this.rutinaId) : null)
            : this.pantalla === "lista" ? rutaIndice() : null;
    }

    async pintar(): Promise<void> {
        const raiz = this.contentEl;
        raiz.addClass("gym-vista");
        this.acciones();

        const generacion = ++this.pintando;
        const pantalla = this.pantalla;
        const despl = raiz.scrollTop;

        const desplNav = raiz.querySelector<HTMLElement>(".gym-nav")?.scrollLeft ?? 0;
        const cont = el("div");
        let nombre = "";

        if (pantalla === "rutina") {
            if (!this.rutinaId) { void abrirLista(); return; }
            const r = await leerRutina(this.rutinaId);
            if (r.error) {
                cont.createDiv({ cls: "gym-error-vista", text: "⚠️ " + r.error });
            } else {
                nombre = r.datos?.nombre || "";

                await pintarDashboard(cont, this.rutinaId, {
                    rutina: r.datos as Rutina,
                    seccion: this.seccionRutina,
                    alCambiarSeccion: seccion => {
                        this.seccionRutina = seccion;
                        void this.pintar();
                    },
                    alRepintar: () => void this.pintar(),
                });
            }
        } else if (pantalla === "progresion") {
            await pintarResumenProgresion(cont, {
                rutinaId: this.rutinaId,
                alVolver: () => {
                    if (this.rutinaId) void abrirRutina(this.rutinaId);
                    else void abrirLista();
                },
            });
        } else {
            await this.inicio.pintar(cont);
        }

        if (generacion !== this.pintando) return;
        this.nombre = nombre;

        const mismaPantalla = this.pintadaEn === pantalla;
        raiz.empty();
        while (cont.firstChild) raiz.appendChild(cont.firstChild);
        if (mismaPantalla) {
            raiz.scrollTop = despl;
            const nav = raiz.querySelector<HTMLElement>(".gym-nav");
            if (nav) nav.scrollLeft = desplNav;
        } else {
            raiz.scrollTop = 0;
        }
        this.pintadaEn = pantalla;
        this.actualizarTitulo();
    }

    private actualizarTitulo(): void {

        const hoja = this.leaf as WorkspaceLeaf & { updateHeader?: () => void };
        hoja.updateHeader?.();
    }
}

export class VistaLista extends VistaApp {
    constructor(leaf: WorkspaceLeaf) { super(leaf); this.pantallaPorDefecto = "lista"; }
    getViewType(): string { return VISTA_LISTA; }
}

export class VistaRutina extends VistaApp {
    constructor(leaf: WorkspaceLeaf) { super(leaf); this.pantallaPorDefecto = "rutina"; }
    getViewType(): string { return VISTA_RUTINA; }
}
