import { CONFIG } from "./config";
import { aplicacion, conf } from "./estado";
import { aTexto } from "./util/texto";
import type { UnidadPeso } from "./tipos";

export const UNIDADES_PESO: UnidadPeso[] = ["kg", "lb"];
const CLAVE_UNIDAD = "gym-unidad-peso";

let unidadPeso: UnidadPeso | null = null;

function leerUnidad(): UnidadPeso {
    try {
        const u = aplicacion().loadLocalStorage(CLAVE_UNIDAD) as string | null;
        return u === "kg" || u === "lb" ? u : "kg";
    } catch { return "kg"; }
}

export const pesoActual = (): UnidadPeso => {
    if (unidadPeso === null) unidadPeso = leerUnidad();
    return unidadPeso;
};

export function fijarUnidadPeso(u: string): boolean {
    if (u !== "kg" && u !== "lb") return false;
    if (u === pesoActual()) return false;
    try { aplicacion().saveLocalStorage(CLAVE_UNIDAD, u); }
    catch (err: unknown) {
        console.error("[Gym Stone] No se pudo guardar la unidad de peso", err);
        return false;
    }
    unidadPeso = u;
    return true;
}

export const esPesoVacio = (kg: unknown): boolean =>
    kg === null || kg === undefined || aTexto(kg).trim() === "" || !Number.isFinite(Number(kg));

export const pesoMostrar = (kg: unknown): number | null => {
    if (esPesoVacio(kg)) return null;
    return pesoActual() === "lb" ? Number(kg) * CONFIG.LB_POR_KG : Number(kg);
};

export const unidadContraria = (): UnidadPeso => (pesoActual() === "kg" ? "lb" : "kg");

export const pesoEn = (kg: unknown, unidad: UnidadPeso): number | null => {
    if (esPesoVacio(kg)) return null;
    return unidad === "lb" ? Number(kg) * CONFIG.LB_POR_KG : Number(kg);
};

export const pesoAKg = (valor: unknown): number | null => {
    const n = numeroATexto(valor);
    if (n === null) return null;
    if (pesoActual() !== "lb") return n;
    return Math.round((n / CONFIG.LB_POR_KG) * 100) / 100;
};

export const pesoACampo = (kg: unknown): string => {
    if (kg === null || kg === undefined || aTexto(kg).trim() === "") return "";
    const v = pesoEn(kg, pesoActual());
    if (v === null) return "";
    return String(Number(v.toFixed(2)));
};

export const pesoTexto = (kg: unknown): string => {
    const v = pesoMostrar(kg);
    if (v === null) return "–";
    return `${Number(v.toFixed(1))} ${pesoActual()}`;
};

export const tallaTexto = (cm: unknown): string => {
    if (cm === null || cm === undefined || !Number.isFinite(Number(cm))) return "–";
    return conf().unidadTalla === "in"
        ? `${(Number(cm) * CONFIG.PULG_POR_CM).toFixed(1)} in`
        : `${Number(cm)} cm`;
};

function numeroATexto(txt: unknown): number | null {
    const s = aTexto(txt).trim().replace(/\s+/g, "");
    if (!s) return null;
    let n = s;
    const coma = n.lastIndexOf(","), punto = n.lastIndexOf(".");
    if (coma >= 0 && punto >= 0) n = coma > punto ? n.replace(/\./g, "").replace(",", ".") : n.replace(/,/g, "");
    else if ((n.match(/,/g) || []).length > 1) n = n.replace(/,/g, "");
    else n = n.replace(",", ".");
    if (/^[+-]?\d+\.$/.test(n)) n = n.slice(0, -1);
    if (!/^-?(\d+(\.\d+)?|\.\d+)$/.test(n)) return null;
    return Number(n);
}
