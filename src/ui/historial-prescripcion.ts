import type { EjercicioDef, RevisionPrescripcion, Rutina } from "../tipos";
import { fechaLegible } from "../util";
import { pesoTexto } from "../unidades";
import { el, modal, ponerX } from "./componentes";

const buscar = (dias: RevisionPrescripcion["antes"], nombre: string): EjercicioDef | undefined =>
    dias.flatMap(d => d.ejercicios ?? []).find(e => (e.nombre || e.id) === nombre);

const resumen = (ejercicio?: EjercicioDef): string => {
    if (!ejercicio) return "No estaba presente";
    const tipo = ejercicio.tipoBloqueEspecial ? "Bloque especial"
        : ejercicio.duracionObjetivo != null ? ejercicio.series + " × " + ejercicio.duracionObjetivo + " s"
            : ejercicio.series + " × " + (ejercicio.repsObjetivo ?? "al fallo");
    const peso = ejercicio.pesoObjetivo == null ? "" : " · " + pesoTexto(ejercicio.pesoObjetivo);
    const descanso = ejercicio.descansoSeg == null ? "" : " · descanso " + ejercicio.descansoSeg + " s";
    return tipo + peso + descanso;
};

export const abrirHistorialPrescripcion = (rutina: Rutina): void => {
    const revisiones = [...(rutina.revisionesPrescripcion ?? [])].reverse();
    const m = modal("🕘 Historial de correcciones", rutina.nombre);
    ponerX(m);
    if (!revisiones.length) {
        m.caja.appendChild(el("div", "gym-caja-vacio",
            "Todavía no hay correcciones registradas. Los cambios futuros de series, repeticiones, pesos, descansos o estructura aparecerán aquí."));
        return;
    }
    m.caja.appendChild(el("div", "gym-ayuda",
        "Cada revisión conserva la prescripción anterior y la nueva. Las sesiones ya registradas no se reescriben."));
    for (const revision of revisiones) {
        const caja = el("div", "gym-caja");
        caja.appendChild(el("div", "gym-tit-naranja",
            fechaLegible(revision.fecha) + " · " + (revision.alcance === "ejercicio" ? "Ejercicio" : "Rutina completa")));
        caja.appendChild(el("div", "gym-caja-sub", revision.motivo));
        for (const nombre of revision.cambios ?? []) {
            const antes = buscar(revision.antes, nombre);
            const despues = buscar(revision.despues, nombre);
            const fila = el("div", "gym-campo");
            fila.appendChild(el("b", null, nombre));
            fila.appendChild(el("div", "gym-ayuda", "Antes: " + resumen(antes)));
            fila.appendChild(el("div", "gym-ayuda", "Después: " + resumen(despues)));
            caja.appendChild(fila);
        }
        m.caja.appendChild(caja);
    }
};
