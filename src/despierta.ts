import { conf } from "./estado";

let n = 0;
let pendiente = false;
let candado: WakeLockSentinel | null = null;
let documentoVisibilidad: Document | null = null;

const permitido = (): boolean => {
    try { return conf().mantenerDespierta !== false; }
    catch { return false; }
};

const api = (): WakeLock | undefined => {
    try { return navigator.wakeLock; }
    catch { return undefined; }
};

const soltar = (): void => {
    const c = candado;
    candado = null;
    if (c) void c.release().catch(() => {   });
};

const pedir = (): void => {
    if (!permitido() || n === 0 || candado || pendiente) return;
    const w = api();

    if (!w || activeDocument.visibilityState !== "visible") return;
    pendiente = true;
    void w.request("screen").then(
        c => {
            pendiente = false;

            if (!permitido() || n === 0) { void c.release().catch(() => {}); return; }
            candado = c;
            c.addEventListener("release", () => {
                if (candado === c) candado = null;

                if (candado === null && n > 0) pedir();
            });
        },
        () => { pendiente = false; },
    );
};

const alCambiarVisibilidad = (): void => {
    if ((documentoVisibilidad ?? activeDocument).visibilityState === "visible") pedir();
};

export const refrescarDespierta = (): void => {
    if (permitido()) pedir(); else soltar();
};

export const reiniciarDespierta = (): void => {
    n = 0;
    documentoVisibilidad?.removeEventListener("visibilitychange", alCambiarVisibilidad);
    documentoVisibilidad = null;
    soltar();
};

export class ReclamoDespierta {
    private poniendo = false;

    poner(): void {
        if (this.poniendo) return;
        this.poniendo = true;
        n++;
        if (n === 1) {
            documentoVisibilidad = activeDocument;
            documentoVisibilidad.addEventListener("visibilitychange", alCambiarVisibilidad);
        }
        pedir();
    }

    quitar(): void {
        if (!this.poniendo) return;
        this.poniendo = false;
        if (n === 0) return;
        n--;
        if (n === 0) {
            documentoVisibilidad?.removeEventListener("visibilitychange", alCambiarVisibilidad);
            documentoVisibilidad = null;
            soltar();
        }
    }

    fijar(quiere: boolean): void { if (quiere) this.poner(); else this.quitar(); }
}
