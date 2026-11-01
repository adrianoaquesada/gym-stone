import {
    diaPorId, ejerciciosConDatos, esSaltada, nombreDia, segundosEjercicio,
    tipoEjercicioDe, volumenEjercicio,
} from "../datos";
import { esFechaValida, fechaLegible, hoy } from "../util";
import { pesoTexto } from "../unidades";
import type { Rutina } from "../tipos";
import { el, tablaEn } from "./componentes";

let filtroEjercicio = "";
let filtroDia = "";
let filtroDesde = "";
let filtroHasta = "";

interface FilaHistorial {
    fecha: string;
    dia: string;
    ejercicio: string;
    series: string;
    volumen: string;
    notas: string;
}

export function seccionHistorial(c: HTMLElement, rutina: Rutina): void {

    const c3 = c;
    const ejercicios = ejerciciosConDatos(rutina);

    const filtros = el("div", "display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;");
    const cEj = el("div", "flex:1 1 200px;min-width:0;");
    const selEj = el("select");
    const opTodas = createEl("option");
    opTodas.value = ""; opTodas.textContent = "Todos los ejercicios";
    selEj.appendChild(opTodas);
    for (const e of ejercicios) {
        const o = createEl("option");
        o.value = e.id; o.textContent = e.nombre;
        selEj.appendChild(o);
    }
    cEj.appendChild(el("div", "gym-et", "Ejercicio")); cEj.appendChild(selEj);
    const cDia = el("div", "flex:1 1 150px;min-width:0;");
    const selDia = el("select");
    const opTodos = createEl("option");
    opTodos.value = ""; opTodos.textContent = "Todos los días";
    selDia.appendChild(opTodos);
    for (const d of rutina.dias ?? []) {
        const o = createEl("option");
        o.value = d.id; o.textContent = d.nombre;
        selDia.appendChild(o);
    }
    cDia.appendChild(el("div", "gym-et", "Día")); cDia.appendChild(selDia);
    const cDes = el("div", "flex:0 1 150px;min-width:0;");
    const inDes = el("input"); inDes.type = "date";
    cDes.appendChild(el("div", "gym-et", "Desde")); cDes.appendChild(inDes);
    const cHas = el("div", "flex:0 1 150px;min-width:0;");
    const inHas = el("input"); inHas.type = "date";
    cHas.appendChild(el("div", "gym-et", "Hasta")); cHas.appendChild(inHas);

    const cHoy = el("div", "flex:0 1 auto;min-width:0;");
    const bHoy = el("button", "gym-mini", "📅 Hoy");
    bHoy.type = "button";
    bHoy.title = "Ver solo lo registrado hoy";
    cHoy.appendChild(el("div", "gym-et", "\u00a0"));
    cHoy.appendChild(bHoy);
    filtros.appendChild(cEj); filtros.appendChild(cDia); filtros.appendChild(cDes); filtros.appendChild(cHas);
    filtros.appendChild(cHoy);

    selEj.value = filtroEjercicio;
    selDia.value = filtroDia;
    inDes.value = filtroDesde;
    inHas.value = filtroHasta;
    c3.appendChild(filtros);

    const contTabla = el("div");
    c3.appendChild(contTabla);

    const pintar = () => {
        contTabla.empty();
        let filas: FilaHistorial[] = [];
        for (const s of rutina.sesiones ?? []) {
            if (!esFechaValida(s.fecha)) continue;
            if (selDia.value && s.diaId !== selDia.value) continue;
            if (inDes.value && s.fecha < inDes.value) continue;
            if (inHas.value && s.fecha > inHas.value) continue;
            for (const e of s.ejercicios ?? []) {
                if (selEj.value && e.ejercicioId !== selEj.value) continue;
                const def = diaPorId(rutina, s.diaId)?.ejercicios?.find(x => x.id === e.ejercicioId);

                const tipo = tipoEjercicioDe(e);
                const seg = segundosEjercicio(e);
                filas.push({
                    fecha: s.fecha,
                    dia: nombreDia(rutina, s.diaId),
                    ejercicio: e.nombre || def?.nombre || e.ejercicioId,

                    series: (e.series ?? []).map(x => esSaltada(x)
                        ? "⏭ saltada"
                        : tipo === "peso"
                            ? `${x.reps ?? "–"}×${pesoTexto(x.peso)}`
                            : `${x.duracionSeg ?? "–"} s`).join(" · ") || "–",
                    volumen: tipo === "peso" ? pesoTexto(volumenEjercicio(e)) : seg > 0 ? `${seg} s` : "–",
                    notas: e.notas ?? "",
                });
            }
        }
        filas.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));

        if (!filas.length) {
            contTabla.appendChild(el("div", "opacity:.7;font-size:.86em;", "Nada registrado con esos filtros."));
            return;
        }

        const total = filas.length;
        tablaEn(contTabla, ["Fecha", "Día", "Ejercicio", "Series", "Volumen / tiempo", "Notas"],
            filas.slice(0, 200).map(f => [
                fechaLegible(f.fecha), f.dia, el("b", null, f.ejercicio), f.series, f.volumen, f.notas,
            ]), { filasVisibles: 10 });
        if (total > 200) contTabla.appendChild(el("div", "opacity:.7;font-size:.8em;margin-top:6px;",
            `Se muestran las 200 más recientes de ${total}: afina los filtros para ver el resto.`));
    };

    const esHoy = () => inDes.value === hoy() && inHas.value === hoy();
    const refrescarHoy = () => {
        bHoy.classList.toggle("activo", esHoy());
        bHoy.textContent = esHoy() ? "✕ Quitar" : "📅 Hoy";
        bHoy.title = esHoy() ? "Quitar el filtro de hoy" : "Ver solo lo registrado hoy";
    };
    const guardarFiltros = () => {
        filtroEjercicio = selEj.value;
        filtroDia = selDia.value;
        filtroDesde = inDes.value;
        filtroHasta = inHas.value;
    };
    bHoy.onclick = () => {
        if (esHoy()) { inDes.value = ""; inHas.value = ""; }
        else { inDes.value = hoy(); inHas.value = hoy(); }
        guardarFiltros();
        refrescarHoy();
        pintar();
    };
    [selEj, selDia, inDes, inHas].forEach(x => x.onchange = () => { guardarFiltros(); refrescarHoy(); pintar(); });
    refrescarHoy();
    pintar();
}
