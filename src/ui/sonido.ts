/* Sonidos sintetizados para temporizadores, descansos y avisos previos. */

import { conf } from "../estado";

type TipoAviso = "temporizador" | "descanso";
type Nota = { frecuencia: number; duracion: number; inicio: number };
const segundosAvisados = new Map<string, number>();
let contextoAudio: AudioContext | null = null;
let avisoSinAudio = false;

const obtenerContextoAudio = (): AudioContext | null => {
    const Ctx = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
        if (!avisoSinAudio) {
            avisoSinAudio = true;
            console.warn("Gym Stone: Web Audio API no está disponible en este entorno.");
        }
        return null;
    }
    contextoAudio ??= new Ctx();
    return contextoAudio;
};

export const prepararAudio = (): void => {
    try {
        const ctx = obtenerContextoAudio();
        if (ctx?.state === "suspended") {
            void ctx.resume().catch(error => console.error("Gym Stone: no se pudo activar el audio.", error));
        }
    } catch (error) {
        console.error("Gym Stone: no se pudo preparar el audio.", error);
    }
};

const sintetizar = async (activo: boolean, notas: Nota[]): Promise<void> => {
    if (!activo) return;
    try {
        const vol = Math.min(100, Math.max(0, conf().volumenSonido)) / 100;
        if (vol <= 0) return;
        const ctx = obtenerContextoAudio();
        if (!ctx) return;
        if (ctx.state === "suspended") await ctx.resume();
        if (ctx.state !== "running") {
            console.warn("Gym Stone: el contexto de audio no está activo.");
            return;
        }
        const formaOnda = conf().formaOndaSonido;
        for (const nota of notas) {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = formaOnda;
            o.frequency.value = nota.frecuencia;
            g.gain.setValueAtTime(0.0001, ctx.currentTime + nota.inicio);
            g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + nota.inicio + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + nota.inicio + nota.duracion);
            o.connect(g); g.connect(ctx.destination);
            o.start(ctx.currentTime + nota.inicio);
            o.stop(ctx.currentTime + nota.inicio + nota.duracion + 0.02);
        }
    } catch (error) {
        console.error("Gym Stone: no se pudo reproducir el sonido.", error);
    }
};

const notasAviso = (): Nota[] => {
    const [primera, segunda, tercera] = conf().frecuenciasSonido;
    switch (conf().patronSonido) {
        case "unico":
            return [{ frecuencia: segunda, duracion: 0.3, inicio: 0 }];
        case "ascendente":
            return [
                { frecuencia: primera, duracion: 0.22, inicio: 0 },
                { frecuencia: segunda, duracion: 0.22, inicio: 0.27 },
                { frecuencia: tercera, duracion: 0.3, inicio: 0.54 },
            ];
        case "doble":
            return [
                { frecuencia: primera, duracion: 0.2, inicio: 0 },
                { frecuencia: tercera, duracion: 0.2, inicio: 0.3 },
            ];
        default:
            return [
                { frecuencia: primera, duracion: 0.26, inicio: 0 },
                { frecuencia: tercera, duracion: 0.26, inicio: 0.32 },
                { frecuencia: primera, duracion: 0.3, inicio: 0.64 },
            ];
    }
};

const activoPara = (tipo: TipoAviso): boolean =>
    tipo === "temporizador" ? conf().sonidoTemporizador : conf().sonidoDescanso;

const pitarAviso = (tipo: TipoAviso): void => {
    void sintetizar(activoPara(tipo), notasAviso());
};

export const sonarTemporizador = (): void => { pitarAviso("temporizador"); };
export const sonarDescanso = (): void => { pitarAviso("descanso"); };

export const sonarCuentaAtras = (clave: string, tipo: TipoAviso, restanteMs: number): void => {
    const limite = conf().avisosCuentaAtras;
    const segundos = Math.ceil(restanteMs / 1000);
    if (!limite || !activoPara(tipo) || segundos <= 0 || segundos > limite) {
        segundosAvisados.delete(clave);
        return;
    }
    if (segundosAvisados.get(clave) === segundos) return;
    segundosAvisados.set(clave, segundos);
    const indice = (limite - segundos) % conf().frecuenciasSonido.length;
    void sintetizar(true, [{ frecuencia: conf().frecuenciasSonido[indice], duracion: 0.12, inicio: 0 }]);
};

export const reiniciarCuentaAtras = (clave: string): void => { segundosAvisados.delete(clave); };

/* Vibración en móvil (en escritorio no existe y no hace nada): dos pulsos,
   igual que siempre en el temporizador. No depende de ningún interruptor. */
export const vibrar = (): void => {
    try { if (typeof navigator.vibrate === "function") navigator.vibrate([300, 120, 300]); }
    catch { /* sin vibración */ }
};

export const probarSonido = (): void => { void sintetizar(true, notasAviso()); };
