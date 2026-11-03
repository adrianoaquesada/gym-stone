import { diaPorId, esSaltada, escribirRutina, serieConDatos, tipoEjercicioDe } from "../datos";
import type {
    EjercicioDef, EjercicioSesion, ObjetivoPlanSesion, Rutina, SerieSesion, Sesion,
} from "../tipos";
import { pesoTexto } from "../unidades";
import { clonarJSON, msgError } from "../util";
import { btn, el, toast } from "./componentes";

interface PropuestaAjuste {
    sesion: Sesion;
    registro: EjercicioSesion;
    ejercicio: EjercicioDef;
    objetivo: ObjetivoPlanSesion;
    seriesHechas: number;
    pesos: number[];
    cambiarSeries: boolean;
    cambiarPeso: boolean;
}

const seriesConDatos = (ejercicio: EjercicioSesion): SerieSesion[] =>
    (ejercicio.series ?? []).filter(serie => !esSaltada(serie) && serieConDatos(serie));

const propuestasDe = (rutina: Rutina, sesiones: Sesion[], diaId: string): PropuestaAjuste[] => {
    const dia = diaPorId(rutina, diaId);
    if (!dia) return [];

    const ultimos = new Map<string, { sesion: Sesion; registro: EjercicioSesion }>();
    for (const sesion of [...sesiones].filter(s => !s.enCurso).sort((a, b) => a.fecha.localeCompare(b.fecha))) {
        for (const registro of sesion.ejercicios ?? []) {
            if (registro.objetivoPlan) ultimos.set(registro.ejercicioId, { sesion, registro });
        }
    }

    return [...ultimos.values()].flatMap(({ sesion, registro }) => {
        const objetivo = registro.objetivoPlan;
        const ejercicio = dia.ejercicios?.find(e => e.id === registro.ejercicioId);
        if (!objetivo || !ejercicio || tipoEjercicioDe(registro) !== "peso" || registro.ajusteAplicado)
            return [];

        const hechas = seriesConDatos(registro);
        if (!hechas.length) return [];
        const pesos = [...new Set(hechas
            .map(serie => serie.peso)
            .filter((peso): peso is number => typeof peso === "number" && Number.isFinite(peso)))].sort((a, b) => a - b);
        const seriesDistintas = hechas.length !== objetivo.series;
        const pesoDistinto = pesos.some(peso => peso !== objetivo.pesoObjetivo);
        if (!seriesDistintas && !pesoDistinto) return [];

        const cambiarSeries = hechas.length !== ejercicio.series;
        const cambiarPeso = pesos.length > 0 && pesos.some(peso => peso !== ejercicio.pesoObjetivo);
        if (!cambiarSeries && !cambiarPeso) return [];

        return [{
            sesion,
            registro,
            ejercicio,
            objetivo,
            seriesHechas: hechas.length,
            pesos,
            cambiarSeries,
            cambiarPeso,
        }];
    });
};

export const tieneAjustesSugeridos = (rutina: Rutina, sesiones: Sesion[], diaId: string): boolean =>
    propuestasDe(rutina, sesiones, diaId).length > 0;

export const ofrecerAjustesPlan = (
    rutina: Rutina,
    sesiones: Sesion[],
    diaId: string,
    contenedor: HTMLElement,
    alAplicar: () => void = () => {},
    alOmitir: () => void = () => {},
    paraProxima = true,
): Promise<void> => {
    const propuestas = propuestasDe(rutina, sesiones, diaId);
    if (!propuestas.length) return Promise.resolve();

    return new Promise(resolve => {
        const panel = el("div", "margin-top:14px;padding:12px;border:1px solid var(--background-modifier-border);border-radius:10px;");
        panel.append(
            el("b", "gym-naranja", paraProxima ? "Propuesta para la próxima sesión" : "Ajustes para esta sesión"),
            el("div", "opacity:.8;font-size:.86em;margin:5px 0 10px;",
                `Puedes ajustar las series al número hecho y elegir uno de los pesos registrados. Solo cambia la rutina activa; la plantilla no se modifica.${paraProxima ? "" : " Se aplicará antes de empezar."}`),
        );

        const selectores = new Map<PropuestaAjuste, HTMLSelectElement>();
        for (const propuesta of propuestas) {
            const { sesion, ejercicio, objetivo, seriesHechas, pesos } = propuesta;
            const fila = el("div", "display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--background-modifier-border);");
            const texto = el("div", "min-width:0;");
            const rango = pesos.length
                ? pesos.length === 1
                    ? pesoTexto(pesos[0])
                    : `${pesoTexto(pesos[0])}–${pesoTexto(pesos[pesos.length - 1])}`
                : "sin peso registrado";
            texto.append(
                el("b", "", ejercicio.nombre),
                el("div", "opacity:.75;font-size:.82em;",
                    `${objetivo.series} series → ${seriesHechas} hechas · ${pesoTexto(objetivo.pesoObjetivo)} → ${rango} · ${sesion.fecha}`),
            );
            fila.appendChild(texto);

            if (propuesta.cambiarPeso && pesos.length) {
                const selector = el("select", "max-width:130px;");
                for (const peso of pesos) {
                    const opcion = el("option", null, pesoTexto(peso));
                    opcion.value = String(peso);
                    selector.appendChild(opcion);
                }
                selector.value = String(pesos[pesos.length - 1]);
                selector.setAttribute("aria-label", `Peso por defecto para ${ejercicio.nombre}`);
                selectores.set(propuesta, selector);
                fila.appendChild(selector);
            }
            panel.appendChild(fila);
        }

        panel.appendChild(el("div", "opacity:.7;font-size:.8em;margin-top:8px;",
            "El plan original queda guardado en el historial."));
        const acciones = el("div", "display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;");
        const aplicar = btn(paraProxima ? "Aplicar a la próxima sesión" : "Usar en esta sesión", "primario", async () => {
            aplicar.disabled = true;
            try {
                const copia = clonarJSON(rutina);
                const dia = diaPorId(copia, diaId);
                if (!dia) throw new Error("El día de la rutina ya no existe.");
                for (const propuesta of propuestas) {
                    const ejercicio = dia.ejercicios?.find(e => e.id === propuesta.ejercicio.id);
                    if (!ejercicio) throw new Error(`El ejercicio «${propuesta.ejercicio.nombre}» ya no está en el día.`);
                    if (propuesta.cambiarSeries) ejercicio.series = propuesta.seriesHechas;
                    const selector = selectores.get(propuesta);
                    if (propuesta.cambiarPeso && selector) ejercicio.pesoObjetivo = Number(selector.value);

                    const indiceSesion = rutina.sesiones.indexOf(propuesta.sesion);
                    const registro = indiceSesion >= 0
                        ? copia.sesiones[indiceSesion]?.ejercicios.find(e => e.ejercicioId === propuesta.registro.ejercicioId)
                        : undefined;
                    if (!registro) throw new Error(`No se encontró el registro de «${propuesta.ejercicio.nombre}».`);
                    registro.ajusteAplicado = {
                        series: ejercicio.series,
                        pesoObjetivo: ejercicio.pesoObjetivo ?? null,
                    };
                }
                await escribirRutina(copia);
                rutina.dias = copia.dias;
                rutina.sesiones = copia.sesiones;
                rutina.versionDatos = copia.versionDatos;
                rutina.modificado = copia.modificado;
                rutina.plantillaOrigen = copia.plantillaOrigen;
            } catch (e: unknown) {
                aplicar.disabled = false;
                console.error("[Gym Stone sugerencia de rutina]", e);
                toast("⚠️ No pude guardar los ajustes sugeridos: " + msgError(e), false);
                return;
            }
            panel.empty();
            panel.appendChild(el("div", "gym-resumen-nota", "✅ Ajustes guardados en la rutina activa."));
            alAplicar();
            resolve();
        });
        const omitir = btn("Mantener valores actuales", null, () => {
            panel.remove();
            alOmitir();
            resolve();
        });
        acciones.append(aplicar, omitir);
        panel.appendChild(acciones);
        contenedor.appendChild(panel);
    });
};
