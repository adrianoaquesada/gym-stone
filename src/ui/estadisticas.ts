/* ═══════════════════════════════════════════════════════════════════════════
   4 · Estadísticas de la rutina (popup 📈 de la fila de navegación): KPIs,
   volumen por sesión/semana/mes, progresión por ejercicio, peso corporal e
   IMC y récords personales.

   Puerto fiel de la sección 4 del motor original (_gym-gestor.js). Las
   sub-secciones 4b-4d (progresión, medidas y récords) se pintan desde aquí:
   el gestor llama a seccionEstadisticas, que la abre entera dentro de un
   modal (sin caja colapsable). EXCEPCIÓN: 4c (peso corporal e IMC) está
   exportada porque Inicio la pinta también, a pantalla completa, en su
   sección «Medidas e IMC».
   ═══════════════════════════════════════════════════════════════════════════ */

import { CONFIG } from "../config";
import {
    adherencia, ejerciciosConDatos, esLibre, historialEjercicio, nombreDia,
    resumenLibre, semanaActual, semanasTotales, totalSeries, ultimaMedida,
    volumenSesion,
} from "../datos";
import { decimal, dos, esFechaValida, fechaLegible, nombreMes, tsDe } from "../util";
import { pesoActual, pesoMostrar, pesoTexto, tallaTexto } from "../unidades";
import type { LecturaNota, MedidasDatos, Rutina, Sesion } from "../tipos";
import { el, KPI, limitaAlto, tablaEn } from "./componentes";
import { grafica } from "./grafica";

/* ══════════════════ 4 · Estadísticas ══════════════════ */

export function seccionEstadisticas(
    c: HTMLElement, rutina: Rutina, medidas: LecturaNota<MedidasDatos>,
): void {
    // En popup (gestor.ts): sin caja colapsable — el título y el ✕ los pone
    // el modal, y el cuerpo va directo al contenedor.
    const c2 = c;
    const sesiones = [...(rutina.sesiones ?? [])].filter(s => esFechaValida(s.fecha));
    const adher = adherencia(rutina);

    const fila = el("div", "display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px;");
    c2.appendChild(fila);
    const volumenTotal = sesiones.reduce((t, s) => t + volumenSesion(s), 0);
    const minutos = sesiones.map(s => Number(s.duracionMin)).filter(n => Number.isFinite(n) && n > 0);
    const mediaMin = minutos.length ? minutos.reduce((a, b) => a + b, 0) / minutos.length : NaN;

    if (esLibre(rutina)) {
        // Sin días programados no existe «adherencia» (daría 0/0): lo que hay que
        // medir es cuántos días has ido y si mantienes la racha de semanas.
        const res = resumenLibre(rutina);
        const semana = Math.max(1, semanaActual(rutina));   // 0 = la rutina aún no empezó
        const totalSem = semanasTotales(rutina) || "?";
        fila.appendChild(KPI("Sesiones", String(sesiones.length), CONFIG.VERDE,
            sesiones.length
                ? `desde ${fechaLegible([...sesiones].map(s => s.fecha).sort()[0])}`
                : "aún sin sesiones registradas"));
        fila.appendChild(KPI("Días entrenados", String(res.dias), CONFIG.AZUL,
            res.dias
                ? `~${decimal(res.dias / semana, 1)} por semana · semana ${semana} de ${totalSem}`
                : "aún sin días registrados"));
        fila.appendChild(KPI("Racha", String(res.racha), CONFIG.NARANJA,
            `mejor: ${res.mejorRacha} semanas seguidas`));
    } else {
        fila.appendChild(KPI("Sesiones", String(sesiones.length), CONFIG.VERDE, `${adher.hechas} de ${adher.programadas} días programados`));
        fila.appendChild(KPI("Adherencia", Number.isFinite(adher.pct) ? decimal(adher.pct) + " %" : "–",
            !Number.isFinite(adher.pct) ? "var(--text-muted)" : adher.pct >= 80 ? CONFIG.VERDE : adher.pct >= 50 ? CONFIG.NARANJA : CONFIG.ROJO,
            "días programados con sesión registrada"));
        fila.appendChild(KPI("Racha", String(adher.racha || 0), CONFIG.NARANJA, `mejor: ${adher.mejorRacha || 0} seguidas`));
    }
    fila.appendChild(KPI("Volumen total", pesoTexto(volumenTotal), CONFIG.AZUL, "Σ series × reps × peso"));
    fila.appendChild(KPI("Duración media", Number.isFinite(mediaMin) ? `${Math.round(mediaMin)} min` : "–", "var(--text-muted)",
        `${minutos.length} sesiones con duración`));

    // Volumen por sesión (gráfica)
    const titSes = el("div", "gym-tit");
    titSes.append(el("span", null, "Volumen por sesión"),
        ` — cada punto es una sesión (${pesoActual()} × reps)`);
    c2.appendChild(titSes);
    grafica(c2, [{
        nombre: "Volumen", color: CONFIG.NARANJA,
        puntos: sesiones.map(s => ({
            // el eje Y se pinta en la unidad activa, igual que el tooltip
            ts: tsDe(s.fecha), v: pesoMostrar(volumenSesion(s)) ?? 0,
            titulo: `${pesoTexto(volumenSesion(s))} · ${nombreDia(rutina, s.diaId)}`,
        })),
    }]);

    // Tabla de volumen por semana y mes
    const porClave = (extraer: (f: string) => string): { clave: string; sesiones: number; vol: number; min: number }[] => {
        const mapa = new Map<string, { clave: string; sesiones: number; vol: number; min: number }>();
        for (const s of sesiones) {
            const k = extraer(s.fecha);
            if (!mapa.has(k)) mapa.set(k, { clave: k, sesiones: 0, vol: 0, min: 0 });
            const w = mapa.get(k)!;
            w.sesiones++; w.vol += volumenSesion(s);
            w.min += Number(s.duracionMin) || 0;
        }
        return [...mapa.values()].sort((a, b) => (a.clave < b.clave ? -1 : 1));
    };
    const semanas = porClave(f => {
        const d = new Date(tsDe(f));
        const lunes = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
        return `${lunes.getFullYear()}-${dos(lunes.getMonth() + 1)}-${dos(lunes.getDate())}`;
    });
    const meses = porClave(f => f.slice(0, 7));

    const titVolumen = el("div", "gym-tit");
    titVolumen.append(el("span", null, "Volumen por semana y por mes"));
    c2.appendChild(titVolumen);
    tablaEn(c2, ["Periodo", "Sesiones", "Volumen", "Minutos"], [
        ...[...semanas].reverse().slice(0, 8).map(w =>
            [`Sem. ${w.clave.slice(8)}/${w.clave.slice(5, 7)}`, String(w.sesiones), pesoTexto(w.vol), String(w.min || "–")]),
        ...[...meses].reverse().slice(0, 6).map(m =>
            [`${nombreMes(Number(m.clave.slice(5, 7)) - 1)} ${m.clave.slice(0, 4)}`, String(m.sesiones), pesoTexto(m.vol), String(m.min || "–")]),
    ]);

    seccionProgresion(c2, rutina);
    seccionMedidas(c2, medidas);
    seccionRecords(c2, rutina, sesiones);
}

/* ── 4b · Progresión por ejercicio ── */
function seccionProgresion(c: HTMLElement, rutina: Rutina): void {
    const ejercicios = ejerciciosConDatos(rutina);
    const conHistorial = ejercicios.filter(e => historialEjercicio(rutina, e.id).length);
    const tit = el("div", "gym-tit");
    tit.append(el("span", null, "Progresión por ejercicio"),
        " — mejor peso, mejor serie, 1RM estimado (Epley) y gráfica en el tiempo");
    c.appendChild(tit);

    if (!conHistorial.length) {
        c.appendChild(el("div", "opacity:.7;font-size:.86em;", "Todavía no hay series registradas."));
        return;
    }

    const cont = el("div");
    c.appendChild(cont);
    const sel = el("select", "max-width:100%;min-width:220px;padding:8px 10px;border-radius:8px;border:1px solid var(--background-modifier-border);background:var(--background-secondary);color:var(--text-normal);font-size:.9em;");
    for (const e of conHistorial) {
        const o = createEl("option");
        o.value = e.id; o.textContent = e.nombre;
        sel.appendChild(o);
    }
    const envoltorio = el("div", "display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px;");
    envoltorio.appendChild(sel);
    c.appendChild(envoltorio);
    c.appendChild(cont);

    const pintarEjercicio = () => {
        cont.empty();
        const info = ejercicios.find(e => e.id === sel.value) ?? conHistorial[0];
        const hist = historialEjercicio(rutina, info.id);

        // KPI del ejercicio
        const mejorPeso = Math.max(0, ...hist.flatMap(h => h.series.map(s => Number(s.peso) || 0)));
        const mejorSerie = [...hist.flatMap(h => h.series.map(s => ({ ...s, fecha: h.fecha })))]
            .sort((a, b) => (Number(b.peso) || 0) - (Number(a.peso) || 0) || (Number(b.reps) || 0) - (Number(a.reps) || 0))[0];
        const mejorRM = Math.max(0, ...hist.map(h => h.oneRM));
        const vol = hist.reduce((t, h) => t + h.volumen, 0);

        const kpis = el("div", "display:flex;flex-wrap:wrap;gap:10px;margin:8px 0 12px;");
        kpis.appendChild(KPI("Mejor peso", pesoTexto(mejorPeso > 0 ? mejorPeso : null), CONFIG.NARANJA, `${hist.length} sesiones`));
        kpis.appendChild(KPI("Mejor serie", mejorSerie ? `${mejorSerie.reps ?? "–"} × ${pesoTexto(mejorSerie.peso)}` : "–", CONFIG.VERDE,
            mejorSerie ? fechaLegible(mejorSerie.fecha) : ""));
        kpis.appendChild(KPI("1RM estimado", mejorRM > 0 ? pesoTexto(mejorRM) : "–", CONFIG.AZUL, "Epley: peso × (1 + reps/30)"));
        kpis.appendChild(KPI("Volumen acumulado", pesoTexto(vol), "var(--text-muted)", "en este ejercicio"));
        cont.appendChild(kpis);

        // Gráfica: 1RM estimado y mejor peso por sesión
        grafica(cont, [
            { nombre: `1RM estimado (${pesoActual()})`, color: CONFIG.AZUL, puntos: hist.map(h => ({ ts: tsDe(h.fecha), v: pesoMostrar(h.oneRM) ?? 0, titulo: `${pesoTexto(h.oneRM)} (1RM)` })) },
            { nombre: `Mejor peso (${pesoActual()})`, color: CONFIG.NARANJA, puntos: hist.map(h => ({ ts: tsDe(h.fecha), v: pesoMostrar(h.mejorPeso) ?? 0, titulo: pesoTexto(h.mejorPeso) })) },
        ]);

        // Historial completo del ejercicio
        const tabla = createEl("table");
        tabla.className = "gym-tabla";
        const thead = createEl("thead");
        const trH = thead.createEl("tr");
        for (const t of ["Fecha", "Día", "Series", "Mejor", "1RM", "Volumen"]) trH.createEl("th", { text: t });
        tabla.appendChild(thead);
        const tb = createEl("tbody");
        for (const h of [...hist].reverse()) {
            const tr = createEl("tr");
            const celda = (css: string, txt: string): HTMLTableCellElement => {
                const td = createEl("td");
                if (css) td.className = css;
                td.textContent = txt;
                return td;
            };
            tr.append(
                celda("gym-nowrap", fechaLegible(h.fecha)),
                celda("gym-tenue", nombreDia(rutina, h.diaId)),
                celda("", h.series.map(s => `${s.reps ?? "–"}×${pesoTexto(s.peso)}`).join(" · ")),
                celda("", `${h.mejor.reps ?? "–"} × ${pesoTexto(h.mejor.peso)}`),
                celda("", pesoTexto(h.oneRM || null)),
                celda("", pesoTexto(h.volumen)),
            );
            tb.appendChild(tr);
        }
        tabla.appendChild(tb);
        const scrollHist = el("div", "gym-tabla-wrap gym-tabla-vista");
        scrollHist.appendChild(tabla);
        cont.appendChild(scrollHist);
        limitaAlto(scrollHist, tabla, 10);   // igual que el historial: 10 filas visibles y el resto con scroll
    };
    sel.onchange = pintarEjercicio;
    pintarEjercicio();
}

/* ── 4c · Peso corporal e IMC ──
   También la usa Inicio (sección «Medidas e IMC»), así que va exportada: ahí
   el encabezado lo pone la propia sección, y con { titulo: false } se omiten
   tanto el texto «Peso corporal — evolución e IMC» como su línea punteada. */
export function seccionMedidas(
    c: HTMLElement, medidas: LecturaNota<MedidasDatos>, { titulo = true }: { titulo?: boolean } = {},
): void {
    if (titulo) {
        const tit = el("div", "gym-tit");
        tit.append(el("span", null, "Peso corporal"), " — evolución e IMC");
        c.appendChild(tit);
    }
    const regs = (medidas.datos?.registros ?? []).filter(r => esFechaValida(r.fecha) && Number.isFinite(Number(r.pesoKg)));
    const u = ultimaMedida(medidas.datos);
    if (!regs.length) {
        c.appendChild(el("div", "opacity:.7;font-size:.86em;", "Sin medidas todavía: usa el botón «⚖️ Registrar medidas»."));
        return;
    }
    const kpis = el("div", "display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;");
    // (lib ES2020: no hay Array.at, así que el último se toma por índice)
    const deltaKg = regs.length > 1 ? Number(regs[regs.length - 1].pesoKg) - Number(regs[0].pesoKg) : 0;
    // Δ mostrado en la unidad activa, conservando el signo (kg → lb lo agranda)
    const delta = (deltaKg < 0 ? -1 : 1) * (pesoMostrar(Math.abs(deltaKg)) ?? 0);
    kpis.appendChild(KPI("Peso actual", pesoTexto(u.pesoKg), CONFIG.NARANJA, u.fecha ? `medida el ${fechaLegible(u.fecha)}` : ""));
    kpis.appendChild(KPI("Talla", tallaTexto(u.tallaCm), CONFIG.AZUL, "se hereda si no se repite"));
    kpis.appendChild(KPI("IMC", u.imc ? decimal(u.imc) : "–", u.imc ? (u.imc < 25 ? CONFIG.VERDE : CONFIG.NARANJA) : "var(--text-muted)",
        `${regs.length} medidas`));
    kpis.appendChild(KPI("Δ desde el inicio", `${delta > 0 ? "+" : ""}${decimal(delta, 1)} ${pesoActual()}`, delta <= 0 ? CONFIG.VERDE : CONFIG.NARANJA,
        `primera medida: ${pesoTexto(regs[0].pesoKg)}`));
    c.appendChild(kpis);
    grafica(c, [{
        nombre: `Peso (${pesoActual()})`, color: CONFIG.VERDE,
        puntos: regs.map(r => ({ ts: tsDe(r.fecha), v: pesoMostrar(r.pesoKg) ?? 0, titulo: pesoTexto(r.pesoKg) })),
    }], { alto: 160, fmt: v => decimal(v, 1) });
}

/* ── 4d · Récords personales ── */
function seccionRecords(c: HTMLElement, rutina: Rutina, sesiones: Sesion[]): void {
    const tit = el("div", "gym-tit");
    tit.append(el("span", null, "🏆 Récords personales"));
    c.appendChild(tit);
    const filas: string[][] = [];

    if (sesiones.length) {
        const mejorSesion = [...sesiones].sort((a, b) => volumenSesion(b) - volumenSesion(a))[0];
        filas.push(["Sesión con más volumen", `${pesoTexto(volumenSesion(mejorSesion))} — ${fechaLegible(mejorSesion.fecha)} (${nombreDia(rutina, mejorSesion.diaId)})`]);
        const masSeries = [...sesiones].sort((a, b) => totalSeries(b) - totalSeries(a))[0];
        filas.push(["Sesión con más series", `${totalSeries(masSeries)} series — ${fechaLegible(masSeries.fecha)}`]);
        const conMin = sesiones.map(s => ({ s, m: Number(s.duracionMin) })).filter(x => Number.isFinite(x.m) && x.m > 0);
        if (conMin.length) {
            const larga = [...conMin].sort((a, b) => b.m - a.m)[0];
            filas.push(["Sesión más larga", `${larga.m} min — ${fechaLegible(larga.s.fecha)}`]);
        }
    }
    for (const e of ejerciciosConDatos(rutina)) {
        const hist = historialEjercicio(rutina, e.id);
        if (!hist.length) continue;
        const mejorPeso = Math.max(0, ...hist.flatMap(h => h.series.map(s => Number(s.peso) || 0)));
        const mejorRM = Math.max(0, ...hist.map(h => h.oneRM));
        if (mejorPeso > 0) filas.push([`${e.nombre} — mejor peso`, `${pesoTexto(mejorPeso)}`]);
        if (mejorRM > 0) filas.push([`${e.nombre} — 1RM estimado`, `${pesoTexto(mejorRM)}`]);
    }
    if (!filas.length) {
        c.appendChild(el("div", "opacity:.7;font-size:.86em;", "Registra tu primera sesión para ver los récords."));
        return;
    }
    tablaEn(c, ["Récord", "Valor"], filas.slice(0, 14).map(f => [f[0], el("b", null, f[1])]));
}
