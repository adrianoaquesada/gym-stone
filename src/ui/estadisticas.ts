import { CONFIG } from "../config";
import {
    adherencia, ejerciciosConDatos, esLibre, historialEjercicio, nombreDia,
    resumenLibre, semanaActual, semanasTotales, segundosSesion, totalSeries,
    ultimaMedida, volumenSesion,
} from "../datos";
import { decimal, dos, esFechaValida, fechaLegible, nombreMes, tsDe } from "../util";
import { pesoActual, pesoMostrar, pesoTexto, tallaTexto } from "../unidades";
import type { LecturaNota, MedidasDatos, Rutina, Sesion } from "../tipos";
import { el, KPI, limitaAlto, tablaEn } from "./componentes";
import { grafica } from "./grafica";

const tiempoTexto = (seg: number): string => {
    const s = Math.max(0, Math.round(seg));
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60), r = s % 60;
    return r ? `${m} min ${r} s` : `${m} min`;
};

export function seccionEstadisticas(
    c: HTMLElement, rutina: Rutina, medidas: LecturaNota<MedidasDatos>,
): void {

    const c2 = c;
    const sesiones = [...(rutina.sesiones ?? [])].filter(s => esFechaValida(s.fecha));
    const adher = adherencia(rutina);

    const fila = el("div", "display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px;");
    c2.appendChild(fila);
    const volumenTotal = sesiones.reduce((t, s) => t + volumenSesion(s), 0);
    const segundosTotal = sesiones.reduce((t, s) => t + segundosSesion(s), 0);
    const hayTiempo = segundosTotal > 0;
    const minutos = sesiones.map(s => Number(s.duracionMin)).filter(n => Number.isFinite(n) && n > 0);
    const mediaMin = minutos.length ? minutos.reduce((a, b) => a + b, 0) / minutos.length : NaN;

    if (esLibre(rutina)) {

        const res = resumenLibre(rutina);
        const semana = Math.max(1, semanaActual(rutina));
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

    if (volumenTotal > 0 || !hayTiempo) {
        fila.appendChild(KPI("Volumen total", pesoTexto(volumenTotal), CONFIG.AZUL, "Σ series × reps × peso (solo ejercicios de peso)"));
    }
    if (hayTiempo) {
        fila.appendChild(KPI("Tiempo de trabajo", tiempoTexto(segundosTotal), CONFIG.NARANJA, "series de tiempo e intervalo"));
    }
    fila.appendChild(KPI("Duración media", Number.isFinite(mediaMin) ? `${Math.round(mediaMin)} min` : "–", "var(--text-muted)",
        `${minutos.length} sesiones con duración`));

    if (volumenTotal > 0 || !hayTiempo) {
        const titSes = el("div", "gym-tit");
        titSes.append(el("span", null, "Volumen por sesión"),
            ` — cada punto es una sesión (${pesoActual()} × reps · solo peso)`);
        c2.appendChild(titSes);
        grafica(c2, [{
            nombre: "Volumen", color: CONFIG.NARANJA,
            puntos: sesiones.map(s => ({

                ts: tsDe(s.fecha), v: pesoMostrar(volumenSesion(s)) ?? 0,
                titulo: `${pesoTexto(volumenSesion(s))} · ${nombreDia(rutina, s.diaId)}`,
            })),
        }]);
    }

    if (hayTiempo) {
        const titTiempo = el("div", "gym-tit");
        titTiempo.append(el("span", null, "Tiempo por sesión"),
            " — cada punto es una sesión (segundos de trabajo)");
        c2.appendChild(titTiempo);
        grafica(c2, [{
            nombre: "Tiempo (s)", color: CONFIG.AZUL,
            puntos: sesiones.map(s => ({
                ts: tsDe(s.fecha), v: segundosSesion(s),
                titulo: `${tiempoTexto(segundosSesion(s))} · ${nombreDia(rutina, s.diaId)}`,
            })),
        }], { fmt: v => `${Math.round(v)} s` });
    }

    const porClave = (extraer: (f: string) => string): { clave: string; sesiones: number; vol: number; seg: number; min: number }[] => {
        const mapa = new Map<string, { clave: string; sesiones: number; vol: number; seg: number; min: number }>();
        for (const s of sesiones) {
            const k = extraer(s.fecha);
            if (!mapa.has(k)) mapa.set(k, { clave: k, sesiones: 0, vol: 0, seg: 0, min: 0 });
            const w = mapa.get(k)!;
            w.sesiones++; w.vol += volumenSesion(s); w.seg += segundosSesion(s);
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
    titVolumen.append(el("span", null, "Volumen y tiempo por semana y por mes"));
    c2.appendChild(titVolumen);
    const cabecera = hayTiempo
        ? ["Periodo", "Sesiones", "Volumen", "Tiempo", "Minutos"]
        : ["Periodo", "Sesiones", "Volumen", "Minutos"];
    const filaPeriodo = (etiqueta: string, w: { sesiones: number; vol: number; seg: number; min: number }): string[] => {

        const vol = w.vol > 0 ? pesoTexto(w.vol) : w.seg > 0 ? "–" : pesoTexto(0);
        const celdas = [etiqueta, String(w.sesiones), vol];
        if (hayTiempo) celdas.push(w.seg > 0 ? tiempoTexto(w.seg) : "–");
        celdas.push(String(w.min || "–"));
        return celdas;
    };
    tablaEn(c2, cabecera, [
        ...[...semanas].reverse().slice(0, 8).map(w =>
            filaPeriodo(`Sem. ${w.clave.slice(8)}/${w.clave.slice(5, 7)}`, w)),
        ...[...meses].reverse().slice(0, 6).map(m =>
            filaPeriodo(`${nombreMes(Number(m.clave.slice(5, 7)) - 1)} ${m.clave.slice(0, 4)}`, m)),
    ]);

    seccionProgresion(c2, rutina);
    seccionMedidas(c2, medidas);
    seccionRecords(c2, rutina, sesiones);
}

function seccionProgresion(c: HTMLElement, rutina: Rutina): void {
    const ejercicios = ejerciciosConDatos(rutina);
    const conHistorial = ejercicios.filter(e => historialEjercicio(rutina, e.id).length);
    const tit = el("div", "gym-tit");
    tit.append(el("span", null, "Progresión por ejercicio"),
        " — peso y series (1RM solo en peso) o tiempo en tiempo/intervalo");
    c.appendChild(tit);

    if (!conHistorial.length) {
        c.appendChild(el("div", "opacity:.7;font-size:.86em;", "Todavía no hay series registradas."));
        return;
    }

    const cont = el("div");
    c.appendChild(cont);
    const sel = el("select", "box-sizing:border-box;max-width:100%;min-width:220px;height:34px;min-height:34px;padding:4px 8px;border-radius:8px;border:1px solid var(--background-modifier-border);background:var(--background-secondary);color:var(--text-normal);font-size:.9em;");
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

        const tipo = hist[hist.length - 1]?.tipoEjercicio ?? "peso";
        const esPeso = tipo === "peso";
        const histTipo = hist.filter(h => h.tipoEjercicio === tipo);
        const mixto = histTipo.length !== hist.length;

        const kpis = el("div", "display:flex;flex-wrap:wrap;gap:10px;margin:8px 0 12px;");
        if (esPeso) {
            const mejorPeso = Math.max(0, ...histTipo.flatMap(h => h.series.map(s => Number(s.peso) || 0)));
            const mejorSerie = [...histTipo.flatMap(h => h.series.map(s => ({ ...s, fecha: h.fecha })))]
                .sort((a, b) => (Number(b.peso) || 0) - (Number(a.peso) || 0) || (Number(b.reps) || 0) - (Number(a.reps) || 0))[0];
            const mejorRM = Math.max(0, ...histTipo.map(h => h.oneRM));
            const vol = histTipo.reduce((t, h) => t + h.volumen, 0);
            kpis.appendChild(KPI("Mejor peso", pesoTexto(mejorPeso > 0 ? mejorPeso : null), CONFIG.NARANJA, `${histTipo.length} sesiones`));
            kpis.appendChild(KPI("Mejor serie", mejorSerie ? `${mejorSerie.reps ?? "–"} × ${pesoTexto(mejorSerie.peso)}` : "–", CONFIG.VERDE,
                mejorSerie ? fechaLegible(mejorSerie.fecha) : ""));
            kpis.appendChild(KPI("1RM estimado", mejorRM > 0 ? pesoTexto(mejorRM) : "–", CONFIG.AZUL, "Epley: peso × (1 + reps/30)"));
            kpis.appendChild(KPI("Volumen acumulado", pesoTexto(vol), "var(--text-muted)", "en este ejercicio"));
        } else {
            const mejorSeg = Math.max(0, ...histTipo.map(h => h.mejorSeg));
            const totalSeg = histTipo.reduce((t, h) => t + h.series.reduce((a, s) => a + (Number(s.duracionSeg) || 0), 0), 0);
            const nSeries = histTipo.reduce((t, h) => t + h.series.length, 0);
            kpis.appendChild(KPI("Mejor tiempo", mejorSeg > 0 ? tiempoTexto(mejorSeg) : "–", CONFIG.NARANJA, `${histTipo.length} sesiones`));
            kpis.appendChild(KPI("Tiempo acumulado", totalSeg > 0 ? tiempoTexto(totalSeg) : "–", CONFIG.AZUL, "en este ejercicio"));
            kpis.appendChild(KPI("Series", String(nSeries), CONFIG.VERDE, "tiempo registrado, sin 1RM ni volumen"));
        }
        cont.appendChild(kpis);

        if (esPeso) {
            grafica(cont, [
                { nombre: `1RM estimado (${pesoActual()})`, color: CONFIG.AZUL, puntos: histTipo.map(h => ({ ts: tsDe(h.fecha), v: pesoMostrar(h.oneRM) ?? 0, titulo: `${pesoTexto(h.oneRM)} (1RM)` })) },
                { nombre: `Mejor peso (${pesoActual()})`, color: CONFIG.NARANJA, puntos: histTipo.map(h => ({ ts: tsDe(h.fecha), v: pesoMostrar(h.mejorPeso) ?? 0, titulo: pesoTexto(h.mejorPeso) })) },
            ]);
        } else {
            grafica(cont, [{
                nombre: "Mejor tiempo (s)", color: CONFIG.NARANJA,
                puntos: histTipo.map(h => ({ ts: tsDe(h.fecha), v: h.mejorSeg, titulo: tiempoTexto(h.mejorSeg) })),
            }], { fmt: v => `${Math.round(v)} s` });
        }

        const tabla = createEl("table");
        tabla.className = "gym-tabla";
        const thead = createEl("thead");
        const trH = thead.createEl("tr");
        const columnas = mixto
            ? ["Fecha", "Día", "Series", "Mejor", "1RM", "Volumen / tiempo"]
            : esPeso
                ? ["Fecha", "Día", "Series", "Mejor", "1RM", "Volumen"]
                : ["Fecha", "Día", "Series", "Mejor", "Tiempo"];
        for (const t of columnas) trH.createEl("th", { text: t });
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
            const comunes = [
                celda("gym-nowrap", fechaLegible(h.fecha)),
                celda("gym-tenue", nombreDia(rutina, h.diaId)),
            ];
            const hPeso = h.tipoEjercicio === "peso";
            const seriesTxt = hPeso
                ? h.series.map(s => `${s.reps ?? "–"}×${pesoTexto(s.peso)}`).join(" · ")
                : h.series.map(s => `${s.duracionSeg ?? "–"} s`).join(" · ");
            const mejorTxt = hPeso
                ? `${h.mejor.reps ?? "–"} × ${pesoTexto(h.mejor.peso)}`
                : h.mejorSeg > 0 ? tiempoTexto(h.mejorSeg) : "–";
            const tiempoTxt = tiempoTexto(h.series.reduce((a, s) => a + (Number(s.duracionSeg) || 0), 0));
            if (mixto) {
                tr.append(
                    ...comunes,
                    celda("", seriesTxt),
                    celda("", mejorTxt),
                    celda("", hPeso ? pesoTexto(h.oneRM || null) : "–"),
                    celda("", hPeso ? pesoTexto(h.volumen) : tiempoTxt),
                );
            } else if (hPeso) {
                tr.append(
                    ...comunes,
                    celda("", seriesTxt),
                    celda("", mejorTxt),
                    celda("", pesoTexto(h.oneRM || null)),
                    celda("", pesoTexto(h.volumen)),
                );
            } else {
                tr.append(
                    ...comunes,
                    celda("", seriesTxt),
                    celda("", mejorTxt),
                    celda("", tiempoTxt),
                );
            }
            tb.appendChild(tr);
        }
        tabla.appendChild(tb);
        const scrollHist = el("div", "gym-tabla-wrap gym-tabla-vista");
        scrollHist.appendChild(tabla);
        cont.appendChild(scrollHist);
        limitaAlto(scrollHist, tabla, 10);
    };
    sel.onchange = pintarEjercicio;
    pintarEjercicio();
}

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

    const deltaKg = regs.length > 1 ? Number(regs[regs.length - 1].pesoKg) - Number(regs[0].pesoKg) : 0;

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

function seccionRecords(c: HTMLElement, rutina: Rutina, sesiones: Sesion[]): void {
    const tit = el("div", "gym-tit");
    tit.append(el("span", null, "🏆 Récords personales"));
    c.appendChild(tit);
    const filas: string[][] = [];

    if (sesiones.length) {
        const mejorSesion = [...sesiones].sort((a, b) => volumenSesion(b) - volumenSesion(a))[0];
        if (volumenSesion(mejorSesion) > 0) {
            filas.push(["Sesión con más volumen", `${pesoTexto(volumenSesion(mejorSesion))} — ${fechaLegible(mejorSesion.fecha)} (${nombreDia(rutina, mejorSesion.diaId)})`]);
        }
        const masSeries = [...sesiones].sort((a, b) => totalSeries(b) - totalSeries(a))[0];
        filas.push(["Sesión con más series", `${totalSeries(masSeries)} series — ${fechaLegible(masSeries.fecha)}`]);
        const masTiempo = [...sesiones].sort((a, b) => segundosSesion(b) - segundosSesion(a))[0];
        const segTiempo = segundosSesion(masTiempo);
        if (segTiempo > 0) {
            filas.push(["Sesión con más tiempo de trabajo", `${tiempoTexto(segTiempo)} — ${fechaLegible(masTiempo.fecha)}`]);
        }
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
        const mejorSeg = Math.max(0, ...hist.map(h => h.mejorSeg));
        if (mejorPeso > 0) filas.push([`${e.nombre} — mejor peso`, `${pesoTexto(mejorPeso)}`]);
        if (mejorRM > 0) filas.push([`${e.nombre} — 1RM estimado`, `${pesoTexto(mejorRM)}`]);
        if (mejorSeg > 0) filas.push([`${e.nombre} — mejor tiempo`, tiempoTexto(mejorSeg)]);
    }
    if (!filas.length) {
        c.appendChild(el("div", "opacity:.7;font-size:.86em;", "Registra tu primera sesión para ver los récords."));
        return;
    }
    tablaEn(c, ["Récord", "Valor"], filas.slice(0, 14).map(f => [f[0], el("b", null, f[1])]));
}
