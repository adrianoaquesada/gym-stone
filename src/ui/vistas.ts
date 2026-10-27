/* ═══════════════════════════════════════════════════════════════════════════
   Las pantallas del plugin y la navegación ENTRE ELLAS.

   Todo ocurre en UNA sola pestaña (igual que Bases): abrir una rutina o
   editarla nunca abre pestañas nuevas. Inicio ⇄ ficha de la rutina son dos
   pantallas de UNA misma vista (ui/vista-app.ts), y crear/editar se hace en
   HOJA superpuesta (ui/hoja.ts), no en una pantalla propia.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { WorkspaceLeaf } from "obsidian";
import { aplicacion } from "../estado";
import { carpetaDatos, rutaIndice, SUFIJO_MD } from "../ajustes";
import { toast } from "./componentes";
import { hojaFormulario } from "./hoja";

export const VISTA_APP = "gym-stone-app";   // la pestaña entera: Inicio ⇄ ficha de rutina
export const VISTA_LISTA = "gym-stone-lista";   // legado: pestaña de versiones previas
export const VISTA_RUTINA = "gym-stone-rutina"; // legado: idem, ya en la ficha
export const VISTA_FORM = "gym-stone-form";      // legado: ya no se navega a ella
export const VISTA_MAESTRO = "gym-stone-maestro"; // legado: hojas de la variante «f» (retirada)

const TODOS_LOS_TIPOS = [VISTA_APP, VISTA_LISTA, VISTA_RUTINA, VISTA_FORM, VISTA_MAESTRO];

interface EstadoVista {
    [k: string]: unknown;
    pantalla?: "lista" | "rutina";
    rutinaId?: string | null;
}

/* Cambia de pantalla DENTRO de la pestaña del plugin (creándola si no existe).
   El tipo siempre es VISTA_APP: así Inicio y la ficha de una rutina son la MISMA
   vista (solo cambia su estado) y no se destruye ni se remonta nada — que era
   el salto visual que se notaba al entrar en una rutina. La navegación no
   toca ningún archivo: los .md siguen siendo solo consulta y guardado.
   Si quedara más de una hoja de estas (de una versión anterior), se cierran
   las de sobra para que la navegación siempre sea en la misma. */
const navegar = async (estado: EstadoVista): Promise<void> => {
    const ws = aplicacion().workspace;
    const hojas = TODOS_LOS_TIPOS.flatMap(t => ws.getLeavesOfType(t));
    const hoja = hojas[0] ?? ws.getLeaf("tab");
    for (const extra of hojas.slice(1)) extra.detach();
    await hoja.setViewState({ type: VISTA_APP, active: true, state: estado });
    void ws.revealLeaf(hoja);
};

/* La lista inicial (el índice) */
export const abrirLista = async (): Promise<void> => {
    await navegar({ pantalla: "lista" });
};

/* La dashboard de una rutina */
export const abrirRutina = async (rutinaId: string): Promise<void> => {
    await navegar({ pantalla: "rutina", rutinaId });
};

/* Crear o editar: en hoja superpuesta sobre la pantalla actual (Esc la cierra
   y vuelves exactamente ahí) */
export const abrirFormulario = async (estado: { modo: "crear" | "editar"; rutinaId?: string }): Promise<void> => {
    await hojaFormulario({ modo: estado.modo, rutinaId: estado.rutinaId ?? null });
};

/* Cerrar la pestaña del plugin (la X de una vista) */
export const cerrarPlugin = (): void => {
    const ws = aplicacion().workspace;
    for (const tipo of TODOS_LOS_TIPOS) {
        for (const hoja of ws.getLeavesOfType(tipo)) hoja.detach();
    }
};

/* ── Archivos del plugin ⇄ vistas del plugin (estilo Kanban) ────────────────
   Abrir el índice o un archivo de rutina desde el explorador, un enlace o el
   buscador rápido muestra la VISTA del plugin en ESA misma pestaña (igual que
   Kanban con sus notas); y desde el plugin se vuelve al markdown crudo con el
   botón «abrir como markdown» — siempre en la misma pestaña, sin duplicar. */

/* ¿Es un archivo con vista propia? Identificación por NOMBRE (el sufijo
   .gym-stone.md dentro de la carpeta de datos, más el índice): así el plugin
   reconoce lo suyo sin recorrer el vault, y un .md «normal» que dejes ahí
   (medidas, grupos, plantillas) sigue abriéndose como nota normal. */
export const esArchivoGym = (ruta: string): boolean =>
    ruta === rutaIndice()
    || (ruta.startsWith(carpetaDatos() + "/") && ruta.endsWith(SUFIJO_MD));

/* Sello: la apertura de markdown que hace ESTE PLUGIN no debe re-convertirse
   (por si setViewState emite file-open). Una vez leído el sello, se borra. */
let mdSellado: { ruta: string; t: number } | null = null;

export const esMdRecienteDelPlugin = (ruta: string): boolean => {
    if (mdSellado && mdSellado.ruta === ruta && Date.now() - mdSellado.t < 3000) {
        mdSellado = null;
        return true;
    }
    return false;
};

/* Convierte UNA pestaña (donde se abrió un archivo del plugin) en la vista
   del plugin de ese archivo: índice → Inicio; rutina → su dashboard. */
export const abrirArchivoComoPlugin = async (leaf: WorkspaceLeaf, ruta: string): Promise<boolean> => {
    if (ruta === rutaIndice()) {
        await leaf.setViewState({ type: VISTA_APP, active: true, state: { pantalla: "lista" } });
        void aplicacion().workspace.revealLeaf(leaf);
        return true;
    }
    if (ruta.startsWith(carpetaDatos() + "/") && ruta.endsWith(SUFIJO_MD)) {
        // El id es el nombre SIN el sufijo: <id>.gym-stone.md → <id>
        const id = ruta.slice(ruta.lastIndexOf("/") + 1, -SUFIJO_MD.length);
        if (!id) return false;
        await leaf.setViewState({ type: VISTA_APP, active: true, state: { pantalla: "rutina", rutinaId: id } });
        void aplicacion().workspace.revealLeaf(leaf);
        return true;
    }
    return false;
};

/* Al revés: la MISMA pestaña del plugin, mostrada como markdown crudo */
export const abrirComoMarkdown = (ruta: string): void => {
    // La pestaña más reciente disponible (la activa, si la hay)
    const hoja = aplicacion().workspace.getLeaf(false);
    if (!aplicacion().vault.getAbstractFileByPath(ruta)) {
        toast("⚠️ Aún no existe ese archivo: se creará al guardar.");
        return;
    }
    mdSellado = { ruta, t: Date.now() };
    void hoja.setViewState({ type: "markdown", state: { file: ruta }, active: true });
};
