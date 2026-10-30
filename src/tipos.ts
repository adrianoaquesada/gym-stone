/* ═══════════════════════════════════════════════════════════════════════════
   Tipos del sistema de gimnasio — la forma de los datos en memoria.

   En disco todo sigue siendo lo de siempre: una nota .md con un bloque
   ```json``` dentro (ver datos/archivos.ts), así que estos tipos tienen que
   tolerar lo que traiga un archivo escrito a mano: por eso muchos campos son
   opcionales o admiten null.
   ═══════════════════════════════════════════════════════════════════════════ */

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

/* Qué mide y registra un ejercicio (valores guardados en las notas):
     · "peso"      → reps con carga: volumen y 1RM. Ausente/null = este
                     (es el de los datos escritos antes de este cambio)
     · "tiempo"    → hold: segundos mantenidos (duracionObjetivo / duracionSeg)
     · "intervalo" → ciclos trabajo/resto (trabajoSeg, transicionSeg, descansoSeg) */
export type TipoEjercicio = "peso" | "tiempo" | "intervalo";

/* Tipo de serie dentro de un ejercicio (sustituye al antiguo modo de reps;
   ver DISENO.md, decisión 5):
     · "calentamiento" → serie previa ligera
     · "trabajo"       → la normal. Ausente/null = esta
     · "descenso"      → drop set
     · "fallo"         → las reps se leen al fallo, sin objetivo */
export type TipoSerie = "calentamiento" | "trabajo" | "descenso" | "fallo";

/* ── Definición (el plan: vive en la rutina, no en las sesiones) ────────── */

export interface EjercicioDef {
    id: string;
    nombre: string;
    tipoEjercicio?: TipoEjercicio | null; // ausente/null = "peso" (datos previos)
    series: number;                 // número de series OBJETIVO; en "intervalo",
                                    // número de ciclos planificados
    repsObjetivo: number | null;
    pesoObjetivo: number | null;    // SIEMPRE en kg
    duracionObjetivo?: number | null; // solo "tiempo": segundos objetivo del hold
    descansoSeg: number | null;     // "intervalo": descanso DENTRO del ciclo
    trabajoSeg?: number | null;     // solo "intervalo": segundos de trabajo por ciclo
    transicionSeg?: number | null;  // solo "intervalo": transición entre ejercicios
    notas: string;
    tipoSerie?: TipoSerie | null;   // tipo de las series del plan; ausente/null
                                    // = "trabajo". "fallo" ⇒ reps al fallo
}

export interface DiaRutina {
    id: string;
    nombre: string;
    diasSemana: number[];           // 1 = lunes … 7 = domingo
    ejercicios: EjercicioDef[];
}

/* ── Registro (lo que has hecho) ────────────────────────────────────────── */

export interface SerieSesion {
    reps?: number | null;
    peso?: number | null;           // SIEMPRE en kg
    duracionSeg?: number | null;    // "tiempo": segundos mantenidos;
                                    // "intervalo": duración del trabajo del ciclo
    tipoSerie?: TipoSerie | null;   // ausente/null = "trabajo" (o el tipo del plan):
                                    // se etiqueta al registrar la serie
    saltada?: boolean;              // planificada pero no hecha (⏭)
    t?: number;                     // ms desde el inicio de la sesión en que se
                                    // registró (sesión guiada; el formulario a
                                    // mano no lo pone) → tiempos y «entre series»
    descansoMs?: number;            // descanso REAL antes de esta serie: del
                                    // registro de la anterior al «¡Listo!» (o
                                    // salto). Con ejecMs desglosa el «entre series»
    ejecMs?: number;                // tiempo (aprox.) de ejecución: del fin del
                                    // descanso al pulsar ✔
}

export interface EjercicioSesion {
    ejercicioId: string;
    nombre: string;
    series: SerieSesion[];
    notas?: string;
    descansoSeg?: number;           // elegido al añadir el ejercicio
    tipoEjercicio?: TipoEjercicio | null; // el registro se guarda autocontenido
                                    // (decisión 18): ausente/null = "peso"
    duracionObjetivo?: number | null; // solo "tiempo": segundos objetivo del hold
    trabajoSeg?: number | null;     // solo "intervalo": trabajo por ciclo
    transicionSeg?: number | null;  // solo "intervalo": transición entre ciclos
    sinRegistrar?: boolean;         // planificado pero sin datos (⏳)
    pista?: string;                 // solo en el formulario («última vez: …»)
}

export interface Sesion {
    fecha: string;                  // YYYY-MM-DD
    diaId: string;                  // "" en las rutinas libres
    duracionMin?: number | "";
    anotaciones?: string;
    ejercicios: EjercicioSesion[];
    enCurso?: boolean;              // progreso guardado a mitad de sesión
    idx?: number;                   // por qué ejercicio ibas
    transcurridoMs?: number;        // reloj acumulado para reanudar (tiempo ACTIVO)
    pausas?: { t: number; ms: number }[];   // cada pausa: cuándo (tiempo activo)
                                    // y cuánto duró → se marcan en la línea de tiempo
}

export interface NotaDia {
    fecha: string;
    texto: string;
    hora?: string;
}

/* ── Rutina completa ────────────────────────────────────────────────────── */

export interface Rutina {
    id: string;
    nombre: string;
    objetivo: string;
    tipo: TipoRutina;
    inicio: string;
    fin: string;
    semanas: number;
    diasSemana: number[];           // unión de los días (informativo)
    dias: DiaRutina[];
    sesiones: Sesion[];
    notasDia: NotaDia[];
    estado: EstadoRutina;
    creado: string;
    modificado: string;
}

/* ── Plantilla reutilizable (estructura sin fechas ni registros) ────────── */

export interface PlantillaRutina {
    nombre: string;
    objetivo: string;
    semanas: number;
    diasSemana: number[];
    dias: DiaRutina[];
}

/* ── Catálogo de ejercicios (selector con buscador) ─────────────────────── */

export interface EjercicioCatalogo {
    id: string;
    nombre: string;
    dia: string;
    rutina?: string;                // nombre de otra rutina, si viene de fuera
    huerfano?: boolean;
}

/* ── Medidas corporales (global) ────────────────────────────────────────── */

export interface Medida {
    fecha: string;
    pesoKg?: number | null;
    tallaCm?: number | null;
    notas?: string;
}

export interface MedidasDatos {
    registros: Medida[];
}

/* Grupos musculares por ejercicio (global, junto a las medidas): es una
   ANOTACIÓN sobre el catálogo —los ejercicios no viven en fichero propio,
   se derivan de lo que hay en las rutinas— para clasificarlos y poder
   filtrarlos en el buscador de «＋ Añadir ejercicio». */
export interface GruposDatos {
    grupos: Record<string, string>;   // id de ejercicio → grupo («Pecho»…)
}

/* ── Notas y lecturas ───────────────────────────────────────────────────── */

export type MetaNota = Record<string, unknown>;

export interface LecturaNota<T> {
    datos?: T;
    error?: string;
    file?: TFile;
    ruta: string;
}

/* ── Índice: UNA sola nota con la lista de todas las rutinas ────────────── */

export interface IndiceRutina {
    id: string;
    nombre: string;
    estado: EstadoRutina;
    tipo: TipoRutina;
    inicio: string;
    fin: string;
    semanas: number;
    sesiones: number;      // recuento para la lista, sin leer el archivo entero
    creada: string;
    modificada: string;
}

export interface Indice {
    version: 1;
    rutinas: IndiceRutina[];
}

/* Contexto de trabajo de las vistas: la rutina abierta y el contenedor donde
   dibujar (la vista se encarga del resto: cabecera, acciones, scroll…). */
export interface ContextoVista {
    cont: HTMLElement;
    rutinaId: string | null;
}
