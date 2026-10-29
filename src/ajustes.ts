/* ═══════════════════════════════════════════════════════════════════════════
   Ajustes del plugin (Ajustes → Gym Stone).

   Toda la vida del plugin cabe en UNA carpeta raíz (carpetaRaiz, en
   minúsculas; «gym-stone» por defecto) y de ahí salen estas rutas fijas:

     <raíz>/rutinas.gym-stone.md            el índice: UNA nota con la lista
     <raíz>/datos/rutinas/<id>.gym-stone.md una rutina por archivo (plan + sesiones)
     <raíz>/datos/medidas.gym-stone.md      peso y talla (globales)
     <raíz>/datos/ejercicios.gym-stone.md   grupos musculares (hermano de medidas)
     <raíz>/plantillas/*.md                 plantillas reutilizables

   Los datos llevan el sufijo .gym-stone.md en lugar de carpetas propias: el
   plugin los identifica por NOMBRE (esArchivoGym), sin necesidad de recorrer
   el vault. Las plantillas quedan FUERA del sufijo a propósito: son
   contenido que se edita a mano y se abren como nota normal.
   ═══════════════════════════════════════════════════════════════════════════ */

import { conf } from "./estado";

// Terminación de los archivos de datos del plugin (legible: siguen siendo .md)
export const SUFIJO_MD = ".gym-stone.md";

export interface AjustesGym {
    carpetaRaiz: string;      // carpeta única que contiene todo lo de arriba
    unidadTalla: "cm" | "in";
    avisoListo: boolean;      // ya se mostró el aviso de bienvenida
    mantenerDespierta: boolean;   // pantalla encendida mientras corre un temporizador
    sonidoTemporizador: boolean;  // pitido al terminar la cuenta atrás del ⏱
    sonidoDescanso: boolean;      // pitido al terminar el descanso de la sesión guiada
    volumenSonido: number;        // intensidad del pitido, en % (0–100): COMÚN a ambos
    formaOndaSonido: OscillatorType;
    patronSonido: "clasico" | "unico" | "ascendente" | "doble";
    frecuenciasSonido: [number, number, number];
    avisosCuentaAtras: 0 | 3 | 5;
    opcionesRapidasTemporizador: number[]; // duraciones del carrusel del temporizador, en ms
}

export const AJUSTES_POR_DEFECTO: AjustesGym = {
    carpetaRaiz: "gym-stone",
    unidadTalla: "cm",
    avisoListo: false,
    mantenerDespierta: true,
    sonidoTemporizador: true,
    sonidoDescanso: true,
    // 30 % ≈ la ganancia 0.28 fija que tenía el pitido antes de parametrizarlo
    volumenSonido: 30,
    formaOndaSonido: "sine",
    patronSonido: "ascendente",
    frecuenciasSonido: [660, 880, 1175],
    avisosCuentaAtras: 0,
    opcionesRapidasTemporizador: [60_000, 180_000, 300_000, 600_000, 900_000, 1_800_000],
};

/* La raíz siempre en minúsculas y sin barras sueltas en los extremos: los
   nombres del plugin son minúsculas por convención (y Obsidian en mayúsculas
   las busca mal en algunos buscadores). Vacío → la de por defecto. */
export const carpetaRaizLimpia = (v: unknown): string => {
    if (typeof v !== "string") return AJUSTES_POR_DEFECTO.carpetaRaiz;
    const limpio = v.trim().replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/").toLowerCase();
    return limpio || AJUSTES_POR_DEFECTO.carpetaRaiz;
};

/* Rellena los huecos por si el usuario guardó ajustes de una versión vieja.
   Los campos antiguos (rutaIndice, carpetaDatos, rutaMedidas,
   carpetaPlantillas) NO se copian a propósito: así el data.json que se
   escribe queda limpio, con un solo campo de ruta (carpetaRaiz). */
export function normalizarAjustes(
    datos: Partial<AjustesGym> | Record<string, unknown> | null | undefined,
): AjustesGym {
    const out: AjustesGym = { ...AJUSTES_POR_DEFECTO };
    if (datos && typeof datos === "object") {
        const d = datos as Record<string, unknown>;
        out.carpetaRaiz = carpetaRaizLimpia(d.carpetaRaiz);
        if (d.unidadTalla === "cm" || d.unidadTalla === "in") out.unidadTalla = d.unidadTalla;
        out.avisoListo = d.avisoListo === true;
        // true salvo que se haya apagado EXPLÍCITAMENTE (los ajustes viejos,
        // sin el campo, siguen con el comportamiento de siempre: encendido)
        out.mantenerDespierta = d.mantenerDespierta !== false;
        // El sonido del ⏱: igual de «explícito» que mantenerDespierta
        out.sonidoTemporizador = d.sonidoTemporizador !== false;
        // Y el del descanso de la sesión guiada (los ajustes viejos, sin el
        // campo, siguen sonando como siempre)
        out.sonidoDescanso = d.sonidoDescanso !== false;
        // Volumen en % (0–100); lo que no sea número válido → el de por defecto
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

/* ── Rutas derivadas de la raíz: la fuente de verdad de dónde vive cada
      cosa. Todo el código pide estas funciones, nunca campos sueltos. ── */

export const rutaIndice = (): string => `${conf().carpetaRaiz}/rutinas${SUFIJO_MD}`;
export const carpetaDatos = (): string => `${conf().carpetaRaiz}/datos/rutinas`;
export const rutaMedidas = (): string => `${conf().carpetaRaiz}/datos/medidas${SUFIJO_MD}`;
export const rutaGrupos = (): string => `${conf().carpetaRaiz}/datos/ejercicios${SUFIJO_MD}`;
export const carpetaPlantillas = (): string => `${conf().carpetaRaiz}/plantillas`;
