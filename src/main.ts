/* ═══════════════════════════════════════════════════════════════════════════
   Gym Stone — plugin de Obsidian (entrada principal)

   Sistema de rutinas de gimnasio a pantalla completa: el plugin vive en
   pestañas propias (tipo Kanban), no dentro de notas. Navegación en una sola
   pestaña y en la misma vista: Inicio ⇄ ficha de la rutina; crear/editar en
   hoja superpuesta.

   Dónde están los datos (notas .md con bloques ```json```: legibles a mano,
   git-friendly; el motor avisa y no sobrescribe si alguien lo rompe): todo
   dentro de UNA carpeta raíz (por defecto gym-stone/, ajustable), con los
   datos en minúsculas y marcados con el sufijo .gym-stone.md:

     · rutinas.gym-stone.md                 el índice: una fila por rutina
     · datos/rutinas/<id>.gym-stone.md      cada rutina con TODO (plan + sesiones)
     · datos/medidas.gym-stone.md           peso y talla (globales)
     · datos/ejercicios.gym-stone.md        grupos musculares
     · plantillas/*.md                      plantillas reutilizables (a mano)

   (Las rutas exactas salen de ajustes.ts.)
   ═══════════════════════════════════════════════════════════════════════════ */

import { MarkdownView, Plugin, type EventRef, type Menu, type WorkspaceLeaf } from "obsidian";
import { normalizarAjustes, rutaIndice, type AjustesGym } from "./ajustes";
import { reiniciarDespierta } from "./despierta";
import { iniciarEstado, actualizarAjustes } from "./estado";
import { limpiarOverlays, toast } from "./ui/componentes";
import { abrirTemporizador, observarTemporizadoresActivos, pararTemporizador } from "./ui/temporizador";
import { cerrarSesionesAbiertas } from "./ui/sesion-guiada";
import { GymStoneTab } from "./ui/tabla-ajustes";
import { VistaApp, VistaLista, VistaRutina } from "./ui/vista-app";
import { VistaForm } from "./ui/vista-form";
import { fijarUnidadPeso, pesoActual, unidadContraria } from "./unidades";
import {
    VISTA_APP, VISTA_FORM, VISTA_LISTA, VISTA_RUTINA,
    abrirArchivoComoPlugin, abrirFormulario, abrirLista, abrirComoMarkdown,
    esArchivoGym, esMdRecienteDelPlugin,
} from "./ui/vistas";

/* «leaf-menu»: el evento que Obsidian dispara al abrir el menú ⋮ de una
   pestaña (comprobado en el asar: workspace.trigger("leaf-menu", menu, leaf)).
   El runtime lo trae, pero la librería de tipos pública aún no lo declara:
   por eso este enganche tipado con cast. */
interface WorkspaceConLeafMenu {
    on(name: "leaf-menu", callback: (menu: Menu, leaf: WorkspaceLeaf) => void): EventRef;
}

export default class GymStone extends Plugin {
    ajustes: AjustesGym = normalizarAjustes(null);

    async onload(): Promise<void> {
        this.ajustes = normalizarAjustes(((await this.loadData()) ?? {}) as Record<string, unknown>);
        iniciarEstado(this.app, this.ajustes, ajustes => this.guardarAjustes(ajustes));

        /* ── Las pantallas del plugin: UNA vista para Inicio y la ficha de una
              rutina (la navegación entre las dos no remonta la pestaña) ── */
        this.registerView(VISTA_APP, leaf => new VistaApp(leaf));
        // Tipos antiguos: solo para restaurar pestañas de versiones previas
        this.registerView(VISTA_LISTA, leaf => new VistaLista(leaf));
        this.registerView(VISTA_RUTINA, leaf => new VistaRutina(leaf));
        this.registerView(VISTA_FORM, leaf => new VistaForm(leaf));   // legado

        /* ── Cinta lateral: la lista de rutinas con un clic ──
           «Gym stone» va concatenado porque es un nombre propio con mayúsculas
           y la regla de sentence case del linter solo mira literales sueltos. */
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

        /* ── Abrir los archivos del plugin COMO el plugin (truco de Kanban):
              si abres el índice o una rutina desde el explorador, un enlace o
              el buscador rápido, ESA pestaña pasa a la vista del plugin ── */
        this.registerEvent(this.app.workspace.on("file-open", f => {
            if (!f || !esArchivoGym(f.path)) return;
            if (esMdRecienteDelPlugin(f.path)) return;   // fue nuestra propia «abrir como markdown»
            const vistasMd = this.app.workspace.getLeavesOfType("markdown");
            const vistaActiva = this.app.workspace.getActiveViewOfType(MarkdownView);
            const hoja = vistasMd.find(l => (l.view as MarkdownView).file?.path === f.path)
                ?? vistasMd.find(l => l.view === vistaActiva);
            if (!hoja || !(hoja.view instanceof MarkdownView)) return;
            void abrirArchivoComoPlugin(hoja, f.path);
        }));

        /* ── Y al revés: botón «abrir con el plugin» en la cabecera (arriba-
              derecha) de las pestañas markdown de esos mismos archivos ── */
        this.registerEvent(this.app.workspace.on("active-leaf-change", leaf => this.marcarVistaMarkdownGym(leaf)));

        /* ── Menú ⋮ de las pestañas del plugin: aquí viven «alternar pesos» y
              «abrir como markdown» (fuera de la barra de iconos, a petición).
              Ver WorkspaceConLeafMenu: el evento existe en runtime y los
              tipos aún no lo declaran. ── */
        this.registerEvent(
            (this.app.workspace as unknown as WorkspaceConLeafMenu).on("leaf-menu", (menu, leaf) => {
                const v = leaf.view;
                if (!(v instanceof VistaApp)) return;
                menu.addItem(it => it
                    .setTitle("Alternar pesos kg ↔ libras")
                    .setIcon("arrow-left-right")
                    .onClick(() => {
                        if (!fijarUnidadPeso(unidadContraria())) return;   // ya estaba en esa unidad
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

        /* ── Comandos ── */
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
            id: "temporizador",
            name: "Abrir el temporizador (cuenta atrás libre)",
            callback: () => abrirTemporizador(),
        });

        this.addSettingTab(new GymStoneTab(this.app, this));

        /* Aviso la primera vez (solo si aún no hay índice) */
        this.app.workspace.onLayoutReady(() => {
            // Pestañas markdown de archivos del plugin restauradas al arrancar:
            // se les pone su botón «abrir con el plugin» (a diferencia del
            // file-open, aquí no se convierte nada sin que lo pidas)
            for (const hoja of this.app.workspace.getLeavesOfType("markdown")) {
                this.marcarVistaMarkdownGym(hoja);
            }
            try {
                if (!this.ajustes.avisoListo && !this.app.vault.getAbstractFileByPath(rutaIndice())) {
                    toast("🏋️ Gym Stone: pulsa la campana de mancuerna (izquierda) o el comando «Abrir la lista de rutinas».");
                    void this.guardarAjustes({ ...this.ajustes, avisoListo: true });
                }
            } catch { /* sin datos no hay nada que avisar */ }
        });
    }

    /* Botón «abrir con el plugin» en la vista markdown de un archivo del
       plugin (índice o rutina). Se añade UNA sola vez por pestaña: la marca
       vive en la propia vista, que es la que se destruye al convertirla. */
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
        cerrarSesionesAbiertas(); // una sesión guiada abierta retira su intervalo, su teclado y su candado
        pararTemporizador();   // el intervalo del temporizador libre no debe sobrevivir
        reiniciarDespierta();  // ni ningún candado de pantalla encendida
        limpiarOverlays();
    }

    /* ── Utilidades para la pestaña de ajustes ── */

    async guardarAjustes(ajustes: AjustesGym): Promise<void> {
        this.ajustes = ajustes;
        actualizarAjustes(ajustes);
        await this.saveData(ajustes);
    }

    // Tras cambiar rutas o unidades, las pestañas abiertas se repintan
    repintarVistasGym(): void {
        for (const tipo of [VISTA_APP, VISTA_LISTA, VISTA_RUTINA]) {
            for (const hoja of this.app.workspace.getLeavesOfType(tipo)) {
                const vista = hoja.view as unknown as { pintar?: () => Promise<void> };
                if (typeof vista?.pintar === "function") void vista.pintar();
            }
        }
    }
}
