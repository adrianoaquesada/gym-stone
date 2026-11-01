import { DIAS, DIAS_LARGO, DIA_MS, MESES } from "../config";
import { aTexto } from "./texto";

export { DIAS, DIAS_LARGO, MESES, DIA_MS };

export const dos = (n: number): string => String(n).padStart(2, "0");

export const hoy = (): string => {
    const d = new Date();
    return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
};

export const horaAhora = (): string => {
    const d = new Date();
    return `${dos(d.getHours())}:${dos(d.getMinutes())}`;
};

export const tsDe = (f: unknown): number => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(aTexto(f).trim());
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : NaN;
};

export const tsAhora = (): number => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

export const sumarDias = (fecha: string, n: number): string => {
    const ts = tsDe(fecha);
    if (!Number.isFinite(ts)) return fecha;
    const d = new Date(ts);
    d.setDate(d.getDate() + (Number(n) || 0));
    return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
};

export const diffDias = (a: string, b: string): number =>
    Math.round((tsDe(b) - tsDe(a)) / DIA_MS);

export const esFechaValida = (f: unknown): boolean => Number.isFinite(tsDe(f));

export const diaSemana = (f: string): number => {
    const ts = tsDe(f);
    return Number.isFinite(ts) ? ((new Date(ts).getDay() + 6) % 7) + 1 : NaN;
};

export const nombreMes = (m: number): string => MESES[m] ?? String(m);

export const fechaLegible = (f: unknown): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(aTexto(f));
    return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1].slice(0, 3)} ${m[1]}` : "–";
};

export const lunesDe = (fecha: string): string => {
    const ds = diaSemana(fecha);
    return Number.isFinite(ds) ? sumarDias(fecha, -(ds - 1)) : fecha;
};
