import { escribirRutina, tipoEjercicioDe } from "../datos";
import type { EjercicioDef, Rutina } from "../tipos";
import { clonarJSON, msgError } from "../util";
import { pesoACampo, pesoAKg, pesoActual } from "../unidades";
import { btn, el, modal, ponerX, toast } from "./componentes";

const numero = (valor: string): number | null => {
    if (!valor.trim()) return null;
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
};

export const abrirCorreccionEjercicio = (
    rutina: Rutina, diaId: string, ejercicioId: string, alGuardar: () => void,
): void => {
    const dia = rutina.dias.find(d => d.id === diaId);
    const original = dia?.ejercicios.find(e => e.id === ejercicioId);
    if (!dia || !original) {
        toast("⚠️ No se encontró el ejercicio en la rutina.", false);
        return;
    }

    const m = modal("🛠 Corregir prescripción", original.nombre,
        );
    ponerX(m, "Cerrar sin guardar");
    const tipo = tipoEjercicioDe(original);
    const campos: { clave: string; etiqueta: string; valor: string; paso?: string; min?: string }[] = [
        { clave: "series", etiqueta: "Series", valor: String(original.series), min: "1", paso: "1" },
    ];
    if (tipo === "peso") {
        campos.push(
            { clave: "repsObjetivo", etiqueta: "Repeticiones objetivo", valor: original.repsObjetivo == null ? "" : String(original.repsObjetivo), min: "0", paso: "1" },
            { clave: "pesoObjetivo", etiqueta: "Peso objetivo (" + pesoActual() + ")", valor: pesoACampo(original.pesoObjetivo), min: "0", paso: "0.01" },
        );
    } else if (tipo === "tiempo") {
        campos.push({ clave: "duracionObjetivo", etiqueta: "Duración objetivo (segundos)", valor: original.duracionObjetivo == null ? "" : String(original.duracionObjetivo), min: "0", paso: "1" });
    } else {
        campos.push(
            { clave: "trabajoSeg", etiqueta: "Trabajo (segundos)", valor: original.trabajoSeg == null ? "" : String(original.trabajoSeg), min: "0", paso: "1" },
            { clave: "transicionSeg", etiqueta: "Transición (segundos)", valor: original.transicionSeg == null ? "" : String(original.transicionSeg), min: "0", paso: "1" },
        );
    }
    campos.push({ clave: "descansoSeg", etiqueta: "Descanso (segundos)", valor: original.descansoSeg == null ? "" : String(original.descansoSeg), min: "0", paso: "1" });

    const entradas = new Map<string, HTMLInputElement>();
    for (const campo of campos) {
        const fila = el("label", "gym-campo");
        fila.appendChild(el("div", "gym-etiqueta", campo.etiqueta));
        const input = el("input");
        input.type = "number";
        input.min = campo.min ?? "0";
        input.step = campo.paso ?? "1";
        input.value = campo.valor;
        fila.appendChild(input);
        m.caja.appendChild(fila);
        entradas.set(campo.clave, input);
    }
    const motivoFila = el("label", "gym-campo");
    motivoFila.appendChild(el("div", "gym-etiqueta", "Motivo de la corrección"));
    const motivo = el("input");
    motivo.type = "text";
    motivo.placeholder = "Ej. No completé las repeticiones previstas";
    motivo.value = "Ajuste individual del ejercicio";
    motivoFila.appendChild(motivo);
    m.caja.appendChild(motivoFila);
    m.caja.appendChild(el("div", "gym-ayuda",
        "El cambio se aplicará a las próximas sesiones. Los entrenamientos anteriores y sus objetivos no se modificarán."));

    m.caja.appendChild(btn("Guardar corrección", "primario", async () => {
        const copia = clonarJSON(rutina);
        const objetivo = copia.dias.find(d => d.id === diaId)?.ejercicios.find(e => e.id === ejercicioId);
        if (!objetivo) {
            toast("⚠️ El ejercicio ya no existe en la rutina.", false);
            return;
        }
        const valores: Record<string, number | null> = {};
        for (const [clave, input] of entradas) valores[clave] = numero(input.value);
        const series = valores.series;
        if (series == null || series < 1 || !Number.isInteger(series)) {
            toast("⚠️ Indica un número de series válido.", false);
            return;
        }
        objetivo.series = series;
        if (tipo === "peso") {
            objetivo.repsObjetivo = valores.repsObjetivo;
            objetivo.pesoObjetivo = pesoAKg(entradas.get("pesoObjetivo")?.value ?? "");
        } else if (tipo === "tiempo") {
            objetivo.duracionObjetivo = valores.duracionObjetivo;
        } else {
            objetivo.trabajoSeg = valores.trabajoSeg;
            objetivo.transicionSeg = valores.transicionSeg;
        }
        objetivo.descansoSeg = valores.descansoSeg;
        copia.motivoProximaRevision = motivo.value.trim() || "Ajuste individual del ejercicio";
        try {
            await escribirRutina(copia);
            m.cerrar();
            toast("✅ Prescripción actualizada. El historial anterior se conserva.");
            alGuardar();
        } catch (error: unknown) {
            toast("⚠️ No pude guardar la corrección: " + msgError(error), false);
        }
    }));
};
