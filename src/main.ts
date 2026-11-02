import { MarkdownView, Plugin, type EventRef, type Menu, type WorkspaceLeaf } from "obsidian";
import { normalizarAjustes, rutaIndice, type AjustesGym } from "./ajustes";
import { reiniciarDespierta } from "./despierta";
import { iniciarEstado, actualizarAjustes } from "./estado";
import { limpiarOverlays, toast } from "./ui/componentes";
import {
    abrirTemporizador, observarTemporizadoresActivos, pararTemporizador, restaurarEstadoTemporizadores,
} from "./ui/temporizador";
import { cerrarSesionesAbiertas } from "./ui/sesion-guiada";
import { GymStoneTab } from "./ui/tabla-ajustes";
import { VistaApp, VistaLista, VistaRutina } from "./ui/vista-app";
import { VistaForm } from "./ui/vista-form";
import { fijarUnidadPeso, pesoActual, unidadContraria } from "./unidades";
import { abrirProgresion } from "./ui/vistas";
import {
    VISTA_APP, VISTA_FORM, VISTA_LISTA, VISTA_RUTINA,
    abrirArchivoComoPlugin, abrirFormulario, abrirLista, abrirComoMarkdown,
    esArchivoGym, esMdRecienteDelPlugin,
} from "./ui/vistas";

interface WorkspaceConLeafMenu {
    on(name: "leaf-menu", callback: (menu: Menu, leaf: WorkspaceLeaf) => void): EventRef;
}

export default class GymStone extends Plugin {
    ajustes: AjustesGym = normalizarAjustes(null);

    async onload(): Promise<void> {
        this.ajustes = normalizarAjustes(((await this.loadData()) ?? {}) as Record<string, unknown>);
        iniciarEstado(this.app, this.ajustes, ajustes => this.guardarAjustes(ajustes));
        restaurarEstadoTemporizadores();

        this.registerView(VISTA_APP, leaf => new VistaApp(leaf));

        this.registerView(VISTA_LISTA, leaf => new VistaLista(leaf));
        this.registerView(VISTA_RUTINA, leaf => new VistaRutina(leaf));
        this.registerView(VISTA_FORM, leaf => new VistaForm(leaf));

        this.addRibbonIcon("dumbbell", "Abrir " + "Gym stone", () => void abrirLista());
        const indicadorTemporizador = this.addRibbonIcon(
            "timer",
            "Temporizador: sin cuentas atrás activas",
            () => abrirTemporizador(),
        );
        indicadorTemporizador.classList.add("gym-temporizador-indicador");
        this.register(() => indicadorTemporizador.remove());
        this.register(observarTemporizadoresActivos(cantidad => {
            const activo = cantidad > 0;
            indicadorTemporizador.classList.toggle("gym-temporizador-activo", activo);
            const detalle = cantidad === 1 ? "1 cuenta atrás en marcha" : `${cantidad} cuentas atrás en marcha`;
            const titulo = activo ? `Temporizador: ${detalle}` : "Temporizador: sin cuentas atrás activas";
            indicadorTemporizador.setAttribute("aria-label", titulo);
            indicadorTemporizador.setAttribute("title", titulo);
        }));

        this.registerEvent(this.app.workspace.on("file-open", f => {
            if (!f || !esArchivoGym(f.path)) return;
            if (esMdRecienteDelPlugin(f.path)) return;
            const vistasMd = this.app.workspace.getLeavesOfType("markdown");
            const vistaActiva = this.app.workspace.getActiveViewOfType(MarkdownView);
            const hoja = vistasMd.find(l => (l.view as MarkdownView).file?.path === f.path)
                ?? vistasMd.find(l => l.view === vistaActiva);
            if (!hoja || !(hoja.view instanceof MarkdownView)) return;
            void abrirArchivoComoPlugin(hoja, f.path);
        }));

        this.registerEvent(this.app.workspace.on("active-leaf-change", leaf => this.marcarVistaMarkdownGym(leaf)));

        this.registerEvent(
            (this.app.workspace as unknown as WorkspaceConLeafMenu).on("leaf-menu", (menu, leaf) => {
                const v = leaf.view;
                if (!(v instanceof VistaApp)) return;
                menu.addItem(it => it
                    .setTitle("Alternar pesos kg ↔ libras")
                    .setIcon("arrow-left-right")
                    .onClick(() => {
                        if (!fijarUnidadPeso(unidadContraria())) return;
                        toast(`⚖️ Pesos en ${pesoActual()}`);
                        this.repintarVistasGym();
                    }));
                menu.addItem(it => it
                    .setTitle("Abrir el temporizador")
                    .setIcon("timer")
                    .onClick(() => abrirTemporizador()));
                const ruta = v.rutaMarkdown();
                if (ruta) {
                    menu.addItem(it => it
                        .setTitle("Abrir como Markdown")
                        .setIcon("file-text")
                        .onClick(() => abrirComoMarkdown(ruta)));
                }
            }),
        );

        this.addCommand({
            id: "abrir-lista",
            name: "Abrir la lista de rutinas",
            callback: () => void abrirLista(),
        });
        this.addCommand({
            id: "nueva-rutina",
            name: "Crear nueva rutina",
            callback: () => void abrirFormulario({ modo: "crear" }),
        });
        this.addCommand({
            id: "progresion",
            name: "Abrir el resumen de progresión",
            callback: () => void abrirProgresion(),
        });
        this.addCommand({
            id: "temporizador",
            name: "Abrir el temporizador (cuenta atrás libre)",
            callback: () => abrirTemporizador(),
        });

        this.addSettingTab(new GymStoneTab(this.app, this));

        this.app.workspace.onLayoutReady(() => {

            for (const hoja of this.app.workspace.getLeavesOfType("markdown")) {
                this.marcarVistaMarkdownGym(hoja);
            }
            try {
                if (!this.ajustes.avisoListo && !this.app.vault.getAbstractFileByPath(rutaIndice())) {
                    toast("🏋️ Gym Stone: pulsa la campana de mancuerna (izquierda) o el comando «Abrir la lista de rutinas».");
                    void this.guardarAjustes({ ...this.ajustes, avisoListo: true });
                }
            } catch (err: unknown) {
                console.warn("[Gym Stone] No se pudo comprobar el aviso inicial", err);
            }
        });
    }

    private marcarVistaMarkdownGym(leaf: WorkspaceLeaf | null): void {
        const v = leaf?.view;
        if (!(v instanceof MarkdownView)) return;
        const f = v.file;
        if (!f || !esArchivoGym(f.path)) return;
        const marcada = v as unknown as { gymBoton?: boolean };
        if (marcada.gymBoton) return;
        marcada.gymBoton = true;
        v.addAction("dumbbell", "Abrir este archivo con Gym Stone (vista del plugin)", () => {
            void abrirArchivoComoPlugin(v.leaf, f.path);
        });
    }

    onunload(): void {
        cerrarSesionesAbiertas();
        pararTemporizador();
        reiniciarDespierta();
        limpiarOverlays();
    }

    async guardarAjustes(ajustes: AjustesGym): Promise<void> {
        this.ajustes = ajustes;
        actualizarAjustes(ajustes);
        await this.saveData(ajustes);
    }

    repintarVistasGym(): void {
        for (const tipo of [VISTA_APP, VISTA_LISTA, VISTA_RUTINA]) {
            for (const hoja of this.app.workspace.getLeavesOfType(tipo)) {
                const vista = hoja.view as unknown as { pintar?: () => Promise<void> };
                if (typeof vista?.pintar === "function") void vista.pintar();
            }
        }
    }
}
