import { conf } from "./estado";

export const SUFIJO_MD = ".gym-stone.md";

export interface AjustesGym {
    carpetaRaiz: string;
    unidadTalla: "cm" | "in";
    avisoListo: boolean;
    mantenerDespierta: boolean;
    sonidoTemporizador: boolean;
    sonidoDescanso: boolean;
    volumenSonido: number;
    formaOndaSonido: OscillatorType;
    patronSonido: "clasico" | "unico" | "ascendente" | "doble";
    frecuenciasSonido: [number, number, number];
    avisosCuentaAtras: 0 | 3 | 5;
    opcionesRapidasTemporizador: number[];
}

export const AJUSTES_POR_DEFECTO: AjustesGym = {
    carpetaRaiz: "gym-stone",
    unidadTalla: "cm",
    avisoListo: false,
    mantenerDespierta: true,
    sonidoTemporizador: true,
    sonidoDescanso: true,

    volumenSonido: 30,
    formaOndaSonido: "sine",
    patronSonido: "ascendente",
    frecuenciasSonido: [660, 880, 1175],
    avisosCuentaAtras: 0,
    opcionesRapidasTemporizador: [60_000, 180_000, 300_000, 600_000, 900_000, 1_800_000],
};

export const carpetaRaizLimpia = (v: unknown): string => {
    if (typeof v !== "string") return AJUSTES_POR_DEFECTO.carpetaRaiz;
    const limpio = v.trim().replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
    return limpio || AJUSTES_POR_DEFECTO.carpetaRaiz;
};

export function normalizarAjustes(
    datos: Partial<AjustesGym> | Record<string, unknown> | null | undefined,
): AjustesGym {
    const out: AjustesGym = { ...AJUSTES_POR_DEFECTO };
    if (datos && typeof datos === "object") {
        const d = datos as Record<string, unknown>;
        out.carpetaRaiz = carpetaRaizLimpia(d.carpetaRaiz);
        if (d.unidadTalla === "cm" || d.unidadTalla === "in") out.unidadTalla = d.unidadTalla;
        out.avisoListo = d.avisoListo === true;

        out.mantenerDespierta = d.mantenerDespierta !== false;

        out.sonidoTemporizador = d.sonidoTemporizador !== false;

        out.sonidoDescanso = d.sonidoDescanso !== false;

        const vol = Number(d.volumenSonido);
        out.volumenSonido = Number.isFinite(vol)
            ? Math.min(100, Math.max(0, Math.round(vol)))
            : AJUSTES_POR_DEFECTO.volumenSonido;
        if (d.formaOndaSonido === "sine" || d.formaOndaSonido === "triangle"
            || d.formaOndaSonido === "square" || d.formaOndaSonido === "sawtooth") {
            out.formaOndaSonido = d.formaOndaSonido;
        }
        if (d.patronSonido === "clasico" || d.patronSonido === "unico"
            || d.patronSonido === "ascendente" || d.patronSonido === "doble") {
            out.patronSonido = d.patronSonido;
        }
        if (Array.isArray(d.frecuenciasSonido) && d.frecuenciasSonido.length === 3) {
            const frecuencias = d.frecuenciasSonido.map(Number);
            if (frecuencias.every(hz => Number.isInteger(hz) && hz >= 100 && hz <= 2000)) {
                out.frecuenciasSonido = [frecuencias[0], frecuencias[1], frecuencias[2]];
            }
        }
        if (d.avisosCuentaAtras === 0 || d.avisosCuentaAtras === 3 || d.avisosCuentaAtras === 5) {
            out.avisosCuentaAtras = d.avisosCuentaAtras;
        }
        if (Array.isArray(d.opcionesRapidasTemporizador)) {
            out.opcionesRapidasTemporizador = [...new Set(
                d.opcionesRapidasTemporizador.filter((ms): ms is number =>
                    typeof ms === "number" && Number.isInteger(ms) && ms >= 1000 && ms <= 99 * 3600000),
            )];
        }
    }
    return out;
}

export const rutaIndice = (): string => `${conf().carpetaRaiz}/rutinas${SUFIJO_MD}`;
export const carpetaDatos = (): string => `${conf().carpetaRaiz}/datos/rutinas`;
export const rutaMedidas = (): string => `${conf().carpetaRaiz}/datos/medidas${SUFIJO_MD}`;
export const rutaGrupos = (): string => `${conf().carpetaRaiz}/datos/ejercicios${SUFIJO_MD}`;
export const carpetaPlantillas = (): string => `${conf().carpetaRaiz}/plantillas`;
