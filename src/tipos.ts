import type { TFile } from "obsidian";

export type TipoRutina = "planificada" | "libre";
export type EstadoRutina = "activa" | "pausada" | "finalizada";
export type UnidadPeso = "kg" | "lb";
export type EstadoTemporizadorLibre = "en-marcha" | "pausado" | "terminado";

export interface TemporizadorLibre {
    id: string;
    duracionMs: number;
    restanteMs: number;
    finEn: number | null;
    estado: EstadoTemporizadorLibre;
}

export interface CronometroLibre {
    tiempoAcumuladoMs: number;
    iniciadoEn: number | null;
    estado: "en-marcha" | "pausado";
}

export interface ParcialCronometro {
    id: string;
    sesionId: string;
    parcialMs: number;
    acumuladoMs: number;
}

export type TipoEjercicio = "peso" | "tiempo" | "intervalo";

export type TipoBloqueEspecial = "calentamiento" | "estiramiento";

export type TipoSerie = "calentamiento" | "trabajo" | "descenso" | "fallo";

export interface EjercicioDef {
    id: string;
    nombre: string;
    grupos?: string[];
    tipoEjercicio?: TipoEjercicio | null;
    tipoBloqueEspecial?: TipoBloqueEspecial | null;
    series: number;

    repsObjetivo: number | null;
    pesoObjetivo: number | null;
    duracionObjetivo?: number | null;
    repsPesoDuranteTiempo?: boolean;
    descansoSeg: number | null;
    trabajoSeg?: number | null;
    transicionSeg?: number | null;
    notas: string;
    tipoSerie?: TipoSerie | null;

}

export interface DiaRutina {
    id: string;
    nombre: string;
    diasSemana: number[];
    ejercicios: EjercicioDef[];
    etiquetasPersonalizadas?: string[];
}

export interface SerieSesion {
    reps?: number | null;
    peso?: number | null;
    duracionSeg?: number | null;

    tipoSerie?: TipoSerie | null;

    saltada?: boolean;
    t?: number;

    descansoMs?: number;

    ejecMs?: number;

}

export interface ObjetivoPlanSesion {
    series: number;
    repsObjetivo: number | null;
    pesoObjetivo: number | null;
}

export interface AjustePlanAplicado {
    series: number;
    pesoObjetivo: number | null;
}

export interface EjercicioSesion {
    ejercicioId: string;
    nombre: string;
    series: SerieSesion[];
    objetivoPlan?: ObjetivoPlanSesion;
    ajusteAplicado?: AjustePlanAplicado;
    notas?: string;
    descansoSeg?: number;
    tipoEjercicio?: TipoEjercicio | null;
    tipoBloqueEspecial?: TipoBloqueEspecial | null;
    bloqueEspecialTranscurridoMs?: number;

    duracionObjetivo?: number | null;
    repsPesoDuranteTiempo?: boolean;
    trabajoSeg?: number | null;
    transicionSeg?: number | null;
    sinRegistrar?: boolean;
    pista?: string;
}

export interface Sesion {
    fecha: string;
    diaId: string;
    duracionMin?: number | "";
    anotaciones?: string;
    ejercicios: EjercicioSesion[];
    enCurso?: boolean;
    idx?: number;
    transcurridoMs?: number;
    inicioRealMs?: number;
    pausas?: { t: number; ms: number }[];

}

export interface NotaDia {
    fecha: string;
    texto: string;
    hora?: string;
}

export interface Rutina {
    versionDatos?: 2;
    id: string;
    /** ID estable de la plantilla de origen. */
    plantillaOrigen?: string | null;
    nombre: string;
    objetivo: string;
    tipo: TipoRutina;
    inicio: string;
    fin: string;
    semanas: number;
    diasSemana: number[];
    dias: DiaRutina[];
    sesiones: Sesion[];
    notasDia: NotaDia[];
    estado: EstadoRutina;
    creado: string;
    modificado: string;
}

export interface PlantillaRutina {
    versionDatos?: 2;
    id?: string;
    nombre: string;
    objetivo: string;
    semanas: number;
    diasSemana: number[];
    dias: DiaRutina[];
}

export interface EjercicioCatalogo {
    id: string;
    nombre: string;
    dia: string;
    rutina?: string;
    huerfano?: boolean;
}

export interface Medida {
    fecha: string;
    pesoKg?: number | null;
    tallaCm?: number | null;
    notas?: string;
}

export interface MedidasDatos {
    registros: Medida[];
}

export interface GruposDatos {
    versionDatos: 3;
    grupos: Record<string, string[]>;
}

export type MetaNota = Record<string, unknown>;

export interface LecturaNota<T> {
    datos?: T;
    error?: string;
    file?: TFile;
    ruta: string;
}

export interface IndiceRutina {
    id: string;
    nombre: string;
    estado: EstadoRutina;
    tipo: TipoRutina;
    inicio: string;
    fin: string;
    semanas: number;
    sesiones: number;
    creada: string;
    modificada: string;
}

export interface Indice {
    version: 1;
    rutinas: IndiceRutina[];
}

export interface ContextoVista {
    cont: HTMLElement;
    rutinaId: string | null;
}
