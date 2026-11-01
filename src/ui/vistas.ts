import type { WorkspaceLeaf } from "obsidian";
import { aplicacion } from "../estado";
import { carpetaDatos, rutaIndice, SUFIJO_MD } from "../ajustes";
import { toast } from "./componentes";
import { hojaFormulario } from "./hoja";

export const VISTA_APP = "gym-stone-app";
export const VISTA_LISTA = "gym-stone-lista";
export const VISTA_RUTINA = "gym-stone-rutina";
export const VISTA_FORM = "gym-stone-form";
export const VISTA_MAESTRO = "gym-stone-maestro";

const TODOS_LOS_TIPOS = [VISTA_APP, VISTA_LISTA, VISTA_RUTINA, VISTA_FORM, VISTA_MAESTRO];

interface EstadoVista {
    [k: string]: unknown;
    pantalla?: "lista" | "rutina";
    rutinaId?: string | null;
}

const navegar = async (estado: EstadoVista): Promise<void> => {
    const ws = aplicacion().workspace;
    const hojas = TODOS_LOS_TIPOS.flatMap(t => ws.getLeavesOfType(t));
    const hoja = hojas[0] ?? ws.getLeaf("tab");
    for (const extra of hojas.slice(1)) extra.detach();
    await hoja.setViewState({ type: VISTA_APP, active: true, state: estado });
    void ws.revealLeaf(hoja);
};

export const abrirLista = async (): Promise<void> => {
    await navegar({ pantalla: "lista" });
};

export const abrirRutina = async (rutinaId: string): Promise<void> => {
    await navegar({ pantalla: "rutina", rutinaId });
};

export const abrirFormulario = async (estado: { modo: "crear" | "editar"; rutinaId?: string }): Promise<void> => {
    await hojaFormulario({ modo: estado.modo, rutinaId: estado.rutinaId ?? null });
};

export const cerrarPlugin = (): void => {
    const ws = aplicacion().workspace;
    for (const tipo of TODOS_LOS_TIPOS) {
        for (const hoja of ws.getLeavesOfType(tipo)) hoja.detach();
    }
};

export const esArchivoGym = (ruta: string): boolean =>
    ruta === rutaIndice()
    || (ruta.startsWith(carpetaDatos() + "/") && ruta.endsWith(SUFIJO_MD));

let mdSellado: { ruta: string; t: number } | null = null;

export const esMdRecienteDelPlugin = (ruta: string): boolean => {
    if (mdSellado && mdSellado.ruta === ruta && Date.now() - mdSellado.t < 3000) {
        mdSellado = null;
        return true;
    }
    return false;
};

export const abrirArchivoComoPlugin = async (leaf: WorkspaceLeaf, ruta: string): Promise<boolean> => {
    if (ruta === rutaIndice()) {
        await leaf.setViewState({ type: VISTA_APP, active: true, state: { pantalla: "lista" } });
        void aplicacion().workspace.revealLeaf(leaf);
        return true;
    }
    if (ruta.startsWith(carpetaDatos() + "/") && ruta.endsWith(SUFIJO_MD)) {

        const id = ruta.slice(ruta.lastIndexOf("/") + 1, -SUFIJO_MD.length);
        if (!id) return false;
        await leaf.setViewState({ type: VISTA_APP, active: true, state: { pantalla: "rutina", rutinaId: id } });
        void aplicacion().workspace.revealLeaf(leaf);
        return true;
    }
    return false;
};

export const abrirComoMarkdown = (ruta: string): void => {

    const hoja = aplicacion().workspace.getLeaf(false);
    if (!aplicacion().vault.getAbstractFileByPath(ruta)) {
        toast("⚠️ Aún no existe ese archivo: se creará al guardar.");
        return;
    }
    mdSellado = { ruta, t: Date.now() };
    void hoja.setViewState({ type: "markdown", state: { file: ruta }, active: true });
};
