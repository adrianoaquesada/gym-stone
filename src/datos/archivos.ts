import { TFile, TFolder } from "obsidian";
import { aplicacion } from "../estado";
import type { LecturaNota } from "../tipos";
import { aTexto, msgError } from "../util/texto";

export const archivosMdEnCarpeta = (carpeta: string): TFile[] => {
    if (!carpeta) return [];
    const raiz = aplicacion().vault.getFolderByPath(carpeta);
    if (!raiz) return [];
    const fuera: TFile[] = [];
    const recorrer = (nodo: TFolder): void => {
        for (const h of nodo.children) {

            if (h instanceof TFile) { if (h.extension.toLowerCase() === "md") fuera.push(h); }
            else if (h instanceof TFolder) recorrer(h);
        }
    };
    recorrer(raiz);
    return fuera;
};

export const bloqueJson = (txt: unknown): string | null => {
    const m = /```json\s*\n?([\s\S]*?)```/.exec(aTexto(txt));
    return m ? m[1].trim() : null;
};

export const contenidoNotaDatos = (datos: unknown): string =>
    "```json\n" + JSON.stringify(datos, null, 2) + "\n```\n";

const carpetaDe = (ruta: string): string => (ruta.includes("/") ? ruta.slice(0, ruta.lastIndexOf("/")) : "");

export const asegurarCarpeta = async (ruta: string): Promise<void> => {
    const carpeta = carpetaDe(ruta);
    if (!carpeta || aplicacion().vault.getAbstractFileByPath(carpeta)) return;
    const partes = carpeta.split("/");
    let acum = "";
    for (const p of partes) {
        acum = acum ? `${acum}/${p}` : p;
        if (!aplicacion().vault.getAbstractFileByPath(acum)) await aplicacion().vault.createFolder(acum);
    }
};

export const escribirSeguro = async (ruta: string, contenido: string): Promise<void> => {
    await asegurarCarpeta(ruta);
    const vault = aplicacion().vault;
    const existente = vault.getAbstractFileByPath(ruta);
    if (!existente) {

        const tmp = `${ruta.replace(/\.md$/, "")}.tmp.md`;
        const previo = vault.getAbstractFileByPath(tmp);
        if (previo) await aplicacion().fileManager.trashFile(previo);
        const f = await vault.create(tmp, contenido);
        await aplicacion().fileManager.renameFile(f, ruta);
        return;
    }
    if (!(existente instanceof TFile)) return;
    const previo = await vault.read(existente);
    if (previo === contenido) return;

    const bak = `${ruta}.bak`;
    const fb = vault.getAbstractFileByPath(bak);
    if (fb instanceof TFile) await vault.modify(fb, previo);
    else await vault.create(bak, previo);
    await vault.modify(existente, contenido);
};

export const leerNotaDatos = async <T>(ruta: string): Promise<LecturaNota<T>> => {
    const vault = aplicacion().vault;
    const f = vault.getAbstractFileByPath(ruta);
    if (!f) return { error: `No existe el archivo ${ruta}.`, ruta };
    if (!(f instanceof TFile)) return { error: `${ruta} no es un archivo.`, ruta };
    let txt = "";
    try { txt = await vault.read(f); }
    catch (e: unknown) { return { error: `No pude leer ${ruta}: ${msgError(e)}`, ruta }; }
    const json = bloqueJson(txt);
    if (json === null) return { error: `El archivo ${ruta} no tiene bloque json legible: no lo sobrescribo por si acaso.`, ruta };
    try { return { datos: JSON.parse(json) as T, file: f, ruta }; }
    catch (e: unknown) { return { error: `El bloque JSON de ${ruta} está roto (${msgError(e)}): no lo sobrescribo por si acaso.`, ruta }; }
};
