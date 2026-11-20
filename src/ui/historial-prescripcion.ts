import type { EjercicioDef, RevisionPrescripcion, Rutina } from "../tipos";
import { clonarJSON, fechaLegible, msgError } from "../util";
import { pesoTexto } from "../unidades";
import { escribirRutina } from "../datos";
import { btn, confirmar, el, modal, ponerX, toast } from "./componentes";
import { abrirRutina } from "./vistas";

const buscar = (dias: RevisionPrescripcion["antes"], referencia: string): EjercicioDef | undefined => {
    const [diaId, ejercicioId] = referencia.split("::");
    return dias.find(d => d.id === diaId)?.ejercicios.find(e => e.id === ejercicioId);
};

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
        for (const referencia of revision.cambios ?? []) {
            const antes = buscar(revision.antes, referencia);
            const despues = buscar(revision.despues, referencia);
            const nombre = despues?.nombre || antes?.nombre || referencia.split("::").pop() || "Ejercicio";
            const fila = el("div", "gym-campo");
            fila.appendChild(el("b", null, nombre));
            fila.appendChild(el("div", "gym-ayuda", "Antes: " + resumen(antes)));
            fila.appendChild(el("div", "gym-ayuda", "Después: " + resumen(despues)));
            caja.appendChild(fila);
        }
        caja.appendChild(btn("↩ Restaurar prescripción anterior", null, async () => {
            const ok = await confirmar(
                "Restaurar prescripción anterior",
                "Se recuperará la prescripción que existía antes de esta revisión. Esto creará una nueva revisión; las sesiones ya registradas permanecerán intactas.",
                "Restaurar versión", "Cancelar",
            );
            if (!ok) return;
            const copia = clonarJSON(rutina);
            copia.dias = clonarJSON(revision.antes);
            copia.motivoProximaRevision = "Restauración de la prescripción del " + revision.fecha;
            try {
                await escribirRutina(copia);
                m.cerrar();
                toast("✅ Prescripción anterior restaurada como una nueva revisión.");
                void abrirRutina(rutina.id);
            } catch (error: unknown) {
                toast("⚠️ No pude restaurar la prescripción: " + msgError(error), false);
            }
        }));
        m.caja.appendChild(caja);
    }
};
