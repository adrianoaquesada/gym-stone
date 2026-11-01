import { ItemView, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { leerRutina } from "../datos";
import type { Rutina } from "../tipos";
import { crear, editar } from "./creador";
import { VISTA_FORM, abrirLista, abrirRutina } from "./vistas";

interface EstadoForm { [k: string]: unknown; modo?: "crear" | "editar"; rutinaId?: string | null; }

export class VistaForm extends ItemView {
    private modo: "crear" | "editar" = "crear";
    private rutinaId: string | null = null;

    constructor(leaf: WorkspaceLeaf) { super(leaf); }

    getViewType(): string { return VISTA_FORM; }
    getDisplayText(): string { return this.modo === "editar" ? "Editar rutina" : "Nueva rutina"; }
    getIcon(): string { return this.modo === "editar" ? "pencil" : "plus"; }

    getState(): EstadoForm { return { modo: this.modo, rutinaId: this.rutinaId }; }

    async setState(state: EstadoForm, result: ViewStateResult): Promise<void> {
        this.modo = state?.modo === "editar" ? "editar" : "crear";
        this.rutinaId = state?.rutinaId ?? null;
        await super.setState(state, result);
        await this.pintar();
    }

    async onOpen(): Promise<void> {
        const st = this.leaf.getViewState()?.state;
        this.modo = st?.modo === "editar" ? "editar" : "crear";
        this.rutinaId = typeof st?.rutinaId === "string" ? st.rutinaId : null;
        this.acciones();
        await this.pintar();
    }

    private accionesHechas = false;

    private acciones(): void {
        if (this.accionesHechas) return;
        this.accionesHechas = true;

        this.addAction("arrow-left", "Volver", () => {
            if (this.modo === "editar" && this.rutinaId) void abrirRutina(this.rutinaId);
            else void abrirLista();
        });
    }

    private async pintar(): Promise<void> {
        const cont = this.contentEl;
        cont.empty();
        cont.addClass("gym-vista");
        this.acciones();

        if (this.modo === "editar" && this.rutinaId) {
            const r = await leerRutina(this.rutinaId);
            if (r.error) {
                cont.createDiv({ cls: "gym-error-vista", text: "⚠️ " + r.error });
                return;
            }
            await editar(cont, r.datos as Rutina);
        } else {
            await crear(cont);
        }
    }
}
