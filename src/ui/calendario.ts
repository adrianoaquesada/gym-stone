import { CONFIG, DIAS, DIAS_LARGO } from "../config";
import {
    diaProgramado, escribirRutina, esLibre, esSaltada, esSinRegistrar, nombreDia,
    programados, segundosEjercicio, segundosSesion, seriesHechas, sesionesEn,
    etiquetasDeDia, diaPorId, tipoEjercicioDe, totalSaltadas, totalSeries,
    volumenEjercicio, volumenSesion,
} from "../datos";
import { decimal, diaSemana, dos, esFechaValida, fechaLegible, hoy, msgError,
    nombreMes, sumarDias, tsAhora, tsDe } from "../util";
import { pesoTexto } from "../unidades";
import type { DiaRutina, Rutina, Sesion } from "../tipos";
import { btn, conAyuda, confirmar, el, modal, ponerX, toast } from "./componentes";
import type { Pintar } from "./pintar";
import { abrirRegistro, formularioAnotacion, formularioSesion } from "./registro";

const almacenMeses = new Map<string, number>();

const cargaTexto = (kg: number, seg: number): string => {
    const partes: string[] = [];
    if (kg > 0) partes.push(pesoTexto(kg));
    if (seg > 0) partes.push(`${Math.round(seg)} s`);
    return partes.length ? partes.join(" · ") : pesoTexto(0);
};

const tipoDiaEnDetalle = (dia: DiaRutina): HTMLDivElement | null => {
    const etiquetas = etiquetasDeDia(dia);
    if (!etiquetas.todas.length) return null;
    const fila = el("div", "gym-cal-tipo-dia");
    fila.appendChild(el("span", "gym-cal-tipo-dia-titulo", "Tipo de día"));
    for (const etiqueta of etiquetas.todas) {
        const clave = etiqueta.toLocaleLowerCase("es");
        const esGrupo = etiquetas.gruposDerivados.some(g => g.toLocaleLowerCase("es") === clave);
        const esPersonalizada = etiquetas.personalizadas.some(g => g.toLocaleLowerCase("es") === clave);
        const chip = el("span", "gym-chip gym-chip-mini" + (esGrupo ? " gym-grupo" : ""), etiqueta);
        chip.title = esGrupo && esPersonalizada
            ? "Grupo de los ejercicios y etiqueta personalizada"
            : esGrupo ? "Grupo de los ejercicios de este día" : "Etiqueta personalizada";
        fila.appendChild(chip);
    }
    return fila;
};

export function seccionCalendario(c: HTMLElement, rutina: Rutina, pintar: Pintar): void {
    const calendario = el("div", "gym-calendario");
    c.appendChild(calendario);
    calendario.appendChild(el("div", "gym-tit")).append(
        el("span", null, "📅 Calendario"),
        " — clic en un cuadro para ver (y editar) el detalle de ese día",
    );

    const porDia = new Map<string, Sesion[]>();
    for (const s of rutina.sesiones ?? []) {
        if (!esFechaValida(s.fecha)) continue;
        if (!porDia.has(s.fecha)) porDia.set(s.fecha, []);
        porDia.get(s.fecha)!.push(s);
    }

    const aMes = (clave: string): number => Number(clave.slice(0, 4)) * 12 + Number(clave.slice(5, 7)) - 1;
    const desdeMes = (idx: number): string => `${Math.floor(idx / 12)}-${dos(idx % 12 + 1)}`;
    const hoyMes = aMes(hoy().slice(0, 7));
    const claves = [...porDia.keys()].map(d => d.slice(0, 7));
    const clavesUnicas = [...new Set(claves)].sort();

    const mesMin = clavesUnicas.length ? aMes(clavesUnicas[0])
        : Math.min(hoyMes, aMes((rutina.inicio ?? hoy()).slice(0, 7)));
    const mesMax = Math.max(hoyMes, clavesUnicas.length ? aMes(clavesUnicas[clavesUnicas.length - 1]) : hoyMes);

    let indiceMes = almacenMeses.get(rutina.id) ?? Math.min(mesMax, hoyMes);
    indiceMes = Math.max(mesMin, Math.min(mesMax, indiceMes));

    const nav = el("div", "display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;");
    calendario.appendChild(nav);
    const estiloBtn = "box-sizing:border-box;height:34px;min-height:34px;padding:4px 10px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-secondary);color:var(--text-normal);cursor:pointer;font-size:.9em;";
    const btnAnt = el("button", estiloBtn, "◀"); btnAnt.type = "button"; btnAnt.title = "Mes anterior";
    const etiqueta = el("div", "font-weight:700;font-size:.95em;min-width:150px;text-align:center;");
    const btnSig = el("button", estiloBtn, "▶"); btnSig.type = "button"; btnSig.title = "Mes siguiente";
    const selector = el("select", "box-sizing:border-box;height:34px;min-height:34px;padding:4px 8px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);font-size:.85em;");
    for (const clave of [...new Set(claves)].sort().reverse()) {
        const n = [...porDia.entries()].filter(([d]) => d.startsWith(clave)).reduce((t, [, a]) => t + a.length, 0);
        const o = createEl("option");
        o.value = String(aMes(clave));
        o.textContent = `${nombreMes(Number(clave.slice(5, 7)) - 1)} ${clave.slice(0, 4)} (${n})`;
        selector.appendChild(o);
    }
    nav.appendChild(btnAnt); nav.appendChild(etiqueta); nav.appendChild(btnSig); nav.appendChild(selector);

    const cajaMes = el("div", "margin-bottom:6px;");
    calendario.appendChild(cajaMes);

    const pintarMes = (): void => {
        const anyo = Math.floor(indiceMes / 12), mes = indiceMes % 12;
        almacenMeses.set(rutina.id, indiceMes);
        etiqueta.textContent = `${nombreMes(mes)} ${anyo}`;
        if ([...selector.options].some(o => o.value === String(indiceMes))) selector.value = String(indiceMes);
        btnAnt.disabled = indiceMes <= mesMin;
        btnSig.disabled = indiceMes >= mesMax;
        [btnAnt, btnSig].forEach(b => b.style.opacity = b.disabled ? "0.35" : "1");

        cajaMes.empty();

        const primerDia = `${anyo}-${dos(mes + 1)}-01`;
        const ultimoDia = `${anyo}-${dos(mes + 1)}-${dos(new Date(anyo, mes + 1, 0).getDate())}`;
        const progMes = programados(rutina, primerDia, ultimoDia);
        const progPorFecha = new Map(progMes.map(p => [p.fecha, p.dia] as [string, DiaRutina]));
        const sesionesMes = [...porDia.entries()].filter(([d]) => d.startsWith(desdeMes(indiceMes))).flatMap(([, a]) => a);
        const volumenMes = sesionesMes.reduce((t, s) => t + volumenSesion(s), 0);
        const segundosMes = sesionesMes.reduce((t, s) => t + segundosSesion(s), 0);
        const hechas = progMes.filter(p => porDia.has(p.fecha)).length;
        const pctMes = progMes.length ? (hechas / progMes.length) * 100 : NaN;

        const diasMes = new Set(sesionesMes.map(s => s.fecha)).size;

        const resumen = el("div", "display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:.85em;margin-bottom:10px;");
        const cabeceraMes = el("span", "gym-res-sesiones",
            `${sesionesMes.length} ${sesionesMes.length === 1 ? "sesión" : "sesiones"}`);
        resumen.appendChild(cabeceraMes);
        if (esLibre(rutina)) {
            const det = el("span", "gym-res-det");
            det.append("· ", el("span", "gym-verde", String(diasMes)),
                ` ${diasMes === 1 ? "día entrenado" : "días entrenados"} · `,
                el("b", null, cargaTexto(volumenMes, segundosMes)), " de volumen / tiempo");
            resumen.appendChild(det);
        } else {
            const barra = el("span", "gym-barra-mes");
            const relleno = el("span", "gym-barra-mes-fill");
            relleno.style.width = `${Math.max(0, Math.min(100, pctMes || 0)).toFixed(1)}%`;
            barra.appendChild(relleno);
            resumen.appendChild(barra);
            const det = el("span", "gym-res-det");
            det.append(el("span", "gym-verde", String(hechas)), `/${progMes.length} programadas`);
            if (Number.isFinite(pctMes)) det.append(` · ${decimal(pctMes)} %`);
            det.append(" · ", el("b", null, cargaTexto(volumenMes, segundosMes)), " de volumen / tiempo");
            resumen.appendChild(det);
        }
        cajaMes.appendChild(resumen);

        const cab = el("div", "display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:4px;");
        for (const d of DIAS) cab.appendChild(el("div", "padding:0 6px;opacity:.5;font-weight:600;font-size:.7em;", d));
        cajaMes.appendChild(cab);

        const offset = (new Date(anyo, mes, 1).getDay() + 6) % 7;
        const diasDelMes = new Date(anyo, mes + 1, 0).getDate();
        const diasPrevios = new Date(anyo, mes, 0).getDate();
        const rejilla = el("div", "display:grid;grid-template-columns:repeat(7,1fr);gap:4px;");
        for (let i = 0; i < 42; i++) {
            const rel = i - offset;
            let numero: number, clave: string, fuera = false;
            if (rel < 0) {
                numero = diasPrevios + rel + 1;
                const mPrev = mes === 0 ? 11 : mes - 1, yPrev = mes === 0 ? anyo - 1 : anyo;
                clave = `${yPrev}-${dos(mPrev + 1)}-${dos(numero)}`;
                fuera = true;
            } else if (rel >= diasDelMes) {
                numero = rel - diasDelMes + 1;
                const mSig = mes === 11 ? 0 : mes + 1, ySig = mes === 11 ? anyo + 1 : anyo;
                clave = `${ySig}-${dos(mSig + 1)}-${dos(numero)}`;
                fuera = true;
            } else {
                numero = rel + 1;
                clave = `${anyo}-${dos(mes + 1)}-${dos(numero)}`;
            }
            rejilla.appendChild(celdaCalendario({ clave, numero, fuera, progPorFecha, porDia, rutina, pintar }));
            if (i >= 34 && rel >= diasDelMes - 1) break;
        }
        cajaMes.appendChild(rejilla);

        const ley = el("div", "font-size:.78em;opacity:.72;margin-top:8px;");
        ley.append(
            el("span", "gym-verde", "■"), " completado   ",
            el("span", "gym-naranja", "▨"), " programado   ",
            el("span", "gym-rojo", "▨"), " omitido",
        );
        cajaMes.appendChild(ley);

        cajaMes.appendChild(tablaSemanas(rutina, primerDia, ultimoDia, porDia, progPorFecha));
    };

    btnAnt.onclick = () => { indiceMes--; pintarMes(); };
    btnSig.onclick = () => { indiceMes++; pintarMes(); };
    selector.onchange = () => { indiceMes = Number(selector.value); pintarMes(); };
    pintarMes();
}

interface ParamsCelda {
    clave: string;
    numero: number;
    fuera: boolean;
    progPorFecha: Map<string, DiaRutina>;
    porDia: Map<string, Sesion[]>;
    rutina: Rutina;
    pintar: Pintar;
}

const nombreDiaDeSesiones = (sesiones: Sesion[]): string => {
    const cuenta = new Map<string, number>();
    let mejor = "", nMejor = 0;
    for (const s of sesiones) {
        const n = String(s.diaId ?? "").trim();
        if (!n) continue;
        const c = (cuenta.get(n) ?? 0) + 1;
        cuenta.set(n, c);
        if (c > nMejor) { nMejor = c; mejor = n; }
    }
    return mejor;
};

const celdaCalendario = ({ clave, numero, fuera, progPorFecha, porDia, rutina, pintar }: ParamsCelda): HTMLDivElement => {
    const diaProg = progPorFecha.get(clave) ?? null;
    const sesiones = porDia.get(clave) ?? [];
    const esHoy = clave === hoy();
    const pasado = tsDe(clave) < tsAhora();
    const anotaciones = (rutina.notasDia ?? []).filter(n => n.fecha === clave);
    const volumen = sesiones.reduce((t, s) => t + volumenSesion(s), 0);
    const segundos = sesiones.reduce((t, s) => t + segundosSesion(s), 0);

    let borde = "transparent";
    if (sesiones.length) borde = CONFIG.VERDE;
    else if (diaProg && pasado) borde = CONFIG.ROJO;
    else if (diaProg) borde = CONFIG.NARANJA;

    const cel = el("div", "gym-cel" + (esHoy ? " hoy" : ""));

    cel.style.background = esHoy
        ? `color-mix(in srgb, ${CONFIG.NARANJA} 15%, transparent)`
        : anotaciones.length ? "var(--background-secondary)"
        : "transparent";
    cel.style.borderColor = borde;
    if (fuera) cel.classList.add("fuera");
    if (diaProg && !sesiones.length) cel.classList.add("sin-hacer");

    cel.appendChild(el("div", "n", String(numero)));

    const nomDia = diaProg ? diaProg.nombre : nombreDiaDeSesiones(sesiones);
    if (nomDia) {
        const d = el("div", "d", nomDia);
        d.style.color = sesiones.length ? CONFIG.VERDE : (pasado && borde === CONFIG.ROJO ? CONFIG.ROJO : CONFIG.NARANJA);
        cel.appendChild(d);
    }
    if (sesiones.length) cel.appendChild(el("div", "v", `${sesiones.length > 1 ? sesiones.length + "× " : ""}${cargaTexto(volumen, segundos)}`));
    else if (diaProg && pasado) cel.appendChild(el("div", "v", "omitido"));

    if (anotaciones.length) {
        cel.classList.add("con-nota");
        cel.appendChild(el("div", "gym-cel-nota", "📝"));
    }

    cel.title = `${clave}${diaProg ? ` · programado: ${diaProg.nombre}` : nomDia ? ` · día: ${nomDia}` : esLibre(rutina) ? "" : " · descanso"} · ${sesiones.length} sesión(es)`;
    cel.onclick = () => detalleDia(rutina, clave, pintar);
    return cel;
};

interface SemanaResumen {
    desde: string;
    hasta: string;
    prog: number;
    hechas: number;
    vol: number;
    seg: number;
    min: number;
    dias: Set<string>;
}

const tablaSemanas = (
    rutina: Rutina, desde: string, hasta: string,
    porDia: Map<string, Sesion[]>, progPorFecha: Map<string, DiaRutina>,
): HTMLDivElement => {
    const libre = esLibre(rutina);
    const fechas = [...progPorFecha.keys()].sort();
    const conDatos = new Set([...fechas, ...porDia.keys()].filter(d => d >= desde && d <= hasta));
    const semanas = new Map<string, SemanaResumen>();
    for (const f of conDatos) {
        const d = new Date(tsDe(f));
        const lunes = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
        const clave = `${lunes.getFullYear()}-${dos(lunes.getMonth() + 1)}-${dos(lunes.getDate())}`;
        if (!semanas.has(clave)) semanas.set(clave, { desde: clave, hasta: sumarDias(clave, 6), prog: 0, hechas: 0, vol: 0, seg: 0, min: 0, dias: new Set<string>() });
        const w = semanas.get(clave)!;
        if (progPorFecha.has(f)) w.prog++;
        for (const s of porDia.get(f) ?? []) { w.hechas++; w.vol += volumenSesion(s); w.seg += segundosSesion(s); w.min += Number(s.duracionMin) || 0; }

        if (porDia.has(f)) w.dias.add(f);
    }
    if (!semanas.size) return el("div");
    const wrap = el("div", "margin-top:10px;");
    const tabla = createEl("table");
    tabla.className = "gym-tabla";

    const thead = createEl("thead");
    const trH = createEl("tr");
    for (const h of libre
        ? ["Semana", "Sesiones", "Días", "Volumen / tiempo", "Minutos"]
        : ["Semana", "Hechas", "Volumen / tiempo", "Minutos", "Adherencia"]) {
        trH.appendChild(el("th", null, h));
    }
    thead.appendChild(trH);
    tabla.appendChild(thead);
    const tb = createEl("tbody");
    const celda = (txt: string, cls?: string): HTMLTableCellElement => {
        const td = createEl("td");
        if (cls) td.className = cls;
        td.textContent = txt;
        return td;
    };
    for (const w of [...semanas.values()].sort((a, b) => (a.desde < b.desde ? -1 : 1))) {
        const tr = createEl("tr");
        tr.appendChild(celda(`${w.desde.slice(8)}/${w.desde.slice(5, 7)} → ${w.hasta.slice(8)}/${w.hasta.slice(5, 7)}`));

        tr.appendChild(celda(libre ? String(w.hechas) : `${w.hechas}/${w.prog || "–"}`));

        if (libre) tr.appendChild(celda(String(w.dias.size || "–")));
        tr.append(celda(cargaTexto(w.vol, w.seg)), celda(String(w.min || "–")));
        if (!libre) {
            const pctSem = w.prog ? (w.hechas / w.prog) * 100 : NaN;
            const tdAdh = celda(Number.isFinite(pctSem) ? decimal(pctSem) + " %" : "–", "gym-pct");
            if (Number.isFinite(pctSem)) {
                tdAdh.style.color = pctSem >= 80 ? CONFIG.VERDE : pctSem >= 50 ? CONFIG.NARANJA : CONFIG.ROJO;
            }
            tr.appendChild(tdAdh);
        }
        tb.appendChild(tr);
    }
    tabla.appendChild(tb);
    const scrollSemanas = el("div", "gym-tabla-wrap");
    scrollSemanas.appendChild(tabla);
    wrap.appendChild(scrollSemanas);
    return wrap;
};

const relojMs = (ms: number): string => {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600);
    return (h ? `${h}:${dos(Math.floor((s % 3600) / 60))}` : String(Math.floor(s / 60))) + `:${dos(s % 60)}`;
};

const barraH = (max: number, etiqueta: string, valor: number, texto: string, color: string, ayuda?: string): HTMLDivElement => {
    const f = el("div", "display:flex;align-items:center;gap:8px;margin:3px 0;font-size:.82em;");
    f.appendChild(el("div", "flex:0 0 100px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.85;", etiqueta));
    const marco = el("div", "flex:1;min-width:40px;height:11px;border-radius:6px;background:var(--background-secondary);overflow:hidden;");
    marco.appendChild(el("div", `height:100%;border-radius:6px;background:${color};width:${max > 0 ? Math.max(2, Math.round(valor / max * 100)) : 0}%;`));
    f.appendChild(marco);
    f.appendChild(el("div", "flex:0 0 auto;white-space:nowrap;opacity:.8;", texto));
    if (ayuda) conAyuda(f, () => ayuda);
    return f;
};

const bloqueResumenDia = (padre: HTMLElement, sesiones: Sesion[]): void => {
    let min = 0, vol = 0, seg = 0, reps = 0, hechas = 0, saltadas = 0;
    const porEj = new Map<string, { nombre: string; vol: number; seg: number; reps: number; series: number }>();
    const cargas = new Map<string, { peso: number | null; n: number; reps: number }>();
    const deltas: number[] = [];
    const descs: number[] = [];
    const pausasMs: number[] = [];
    const descReal: number[] = [];
    const ejecs: number[] = [];

    for (const s of sesiones) {
        min += Number(s.duracionMin) || 0;
        vol += volumenSesion(s);
        for (const p of s.pausas ?? []) if (Number(p.ms) > 0) pausasMs.push(Number(p.ms));
        let ultimoT: number | null = null;
        for (const e of s.ejercicios ?? []) {
            const d = Number(e.descansoSeg) || 0;
            if (d > 0) descs.push(d);

            const tipo = tipoEjercicioDe(e);
            const k = e.ejercicioId || e.nombre || "?";
            const actual = porEj.get(k) ?? { nombre: e.nombre || e.ejercicioId || "?", vol: 0, seg: 0, reps: 0, series: 0 };
            actual.vol += volumenEjercicio(e);
            actual.seg += segundosEjercicio(e);
            seg += segundosEjercicio(e);
            porEj.set(k, actual);
            const sinReg = esSinRegistrar(e);
            for (const x of e.series ?? []) {
                if (!sinReg && esSaltada(x)) saltadas++;
                else if (!sinReg) {
                    hechas++; reps += Number(x.reps) || 0;
                    actual.reps += Number(x.reps) || 0;
                    actual.series++;
                    if (x.descansoMs != null) descReal.push(x.descansoMs);
                    if (x.ejecMs != null) ejecs.push(x.ejecMs);

                    if (tipo === "peso") {
                        const et = pesoTexto(x.peso);
                        const c = cargas.get(et) ?? { peso: x.peso ?? null, n: 0, reps: 0 };
                        c.n++; c.reps += Number(x.reps) || 0; cargas.set(et, c);
                    }
                }
                if (x.t != null) {
                    if (ultimoT != null) deltas.push(x.t - ultimoT);
                    ultimoT = x.t;
                }
            }
        }
    }

    const kpis = el("div", "display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 6px;");
    const chip = (txt: string, titulo = ""): void => {
        const c = el("span", "gym-chip", txt);
        if (titulo) conAyuda(c, () => titulo);
        kpis.appendChild(c);
    };
    chip(`⏱ ${min} min`, "Duración total de las sesiones del día");
    if (vol > 0) chip(`💾 ${pesoTexto(vol)}`, "Volumen: suma de reps × peso (solo ejercicios de peso)");
    if (seg > 0) chip(`⏱ ${Math.round(seg)} s de trabajo`, "Tiempo registrado en ejercicios de tiempo e intervalo");
    chip(`📊 ${hechas} series${saltadas ? ` +${saltadas} ⏭` : ""}`, "Series hechas y saltadas");
    if (reps > 0) chip(`🔁 ${reps} reps`);
    if (min > 0 && reps > 0) chip(`⚡ ${(reps / min).toFixed(1)} reps/min`, "Ritmo del día: repeticiones por minuto");
    if (descs.length) chip(`⏳ ~${Math.round(descs.reduce((a, b) => a + b, 0) / descs.length)} s de descanso`, "Media del descanso elegido para los ejercicios del día");
    if (pausasMs.length) chip(`⏸ ${relojMs(pausasMs.reduce((a, b) => a + b, 0))} en pausa`, "La pausa no cuenta en los tiempos: el reloj del día mide sesión activa");
    padre.appendChild(kpis);

    const pesos = [...porEj.values()].filter(e => e.vol > 0).sort((a, b) => b.vol - a.vol);
    if (pesos.length) {
        padre.appendChild(el("div", "gym-et", "📈 Volumen por ejercicio"));
        const max = Math.max(...pesos.map(x => x.vol), 1);
        for (const e of pesos) padre.appendChild(barraH(max, e.nombre, e.vol, pesoTexto(e.vol), CONFIG.NARANJA,
            `${e.nombre} — ${pesoTexto(e.vol)} en ${e.reps} reps · ${e.series} serie${e.series === 1 ? "" : "s"} hecha${e.series === 1 ? "" : "s"}`));
    }

    const tiempos = [...porEj.values()].filter(e => e.seg > 0).sort((a, b) => b.seg - a.seg);
    if (tiempos.length) {
        padre.appendChild(el("div", "gym-et", "⏱ Tiempo por ejercicio"));
        const max = Math.max(...tiempos.map(x => x.seg), 1);
        for (const e of tiempos) padre.appendChild(barraH(max, e.nombre, e.seg, `${Math.round(e.seg)} s`, CONFIG.AZUL,
            `${e.nombre} — ${Math.round(e.seg)} s en ${e.series} serie${e.series === 1 ? "" : "s"} hecha${e.series === 1 ? "" : "s"}`));
    }

    if (cargas.size) {
        padre.appendChild(el("div", "gym-et", "📊 Series por carga (histograma)"));
        const arr = [...cargas.values()].sort((a, b) => (a.peso ?? 1e9) - (b.peso ?? 1e9));
        const max = Math.max(...arr.map(x => x.n), 1);
        for (const c of arr) padre.appendChild(barraH(max, c.peso != null ? pesoTexto(c.peso) : "sin peso", c.n, `${c.n} series`, CONFIG.AZUL,
            `${c.peso != null ? pesoTexto(c.peso) : "Sin peso (al peso corporal)"}: ${c.n} serie${c.n === 1 ? "" : "s"} hecha${c.n === 1 ? "" : "s"} · ${c.reps} reps en total`));
    }

    if (deltas.length) {
        padre.appendChild(el("div", "gym-et", "⏱ Entre serie y serie (histograma)"));
        const ch = el("div", "display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 6px;");
        const c2 = (txt: string, titulo = ""): void => {
            const c = el("span", "gym-chip", txt);
            if (titulo) conAyuda(c, () => titulo);
            ch.appendChild(c);
        };
        const media = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        const ord = [...deltas].sort((a, b) => a - b);
        c2(`media ${relojMs(media)}`, "Tiempo medio entre registros consecutivos (descanso + ejecución de la serie siguiente)");
        c2(`mediana ${relojMs(ord[Math.floor((ord.length - 1) / 2)])}`);
        if (descReal.length) c2(`descanso medio ${relojMs(descReal.reduce((a, b) => a + b, 0) / descReal.length)}`,
            "Descanso REAL: del registro de la serie anterior al «¡Listo!» (o al saltarlo)");
        if (ejecs.length) c2(`ejecución media ${relojMs(ejecs.reduce((a, b) => a + b, 0) / ejecs.length)}`,
            "Tiempo (aprox.) entre el «¡Listo!» y registrar la serie");
        padre.appendChild(ch);
        const rangos = [
            { txt: "< 1 min", n: 0 }, { txt: "1–1:30", n: 0 }, { txt: "1:30–2", n: 0 },
            { txt: "2–3 min", n: 0 }, { txt: "> 3 min", n: 0 },
        ];
        for (const d of deltas) {
            const mnt = d / 60000;
            rangos[mnt < 1 ? 0 : mnt < 1.5 ? 1 : mnt < 2 ? 2 : mnt < 3 ? 3 : 4].n++;
        }
        const maxR = Math.max(...rangos.map(x => x.n), 1);
        for (const r of rangos) padre.appendChild(barraH(maxR, r.txt, r.n, `${r.n}×`, CONFIG.VERDE,
            `Entre «${r.txt}»: ${r.n} de ${deltas.length} registros entre series`));
    }
};

const lineaTiempo = (s: Sesion): HTMLDivElement | null => {
    type Ev = { t: number; hecha: boolean; reps: number | null; peso: number | null; dur: number | null; descansoMs?: number; ejecMs?: number };
    const filas: { nombre: string; evs: Ev[] }[] = [];
    let lejos = 0;
    for (const e of s.ejercicios ?? []) {
        const evs: Ev[] = [];
        for (const x of e.series ?? []) {
            if (x.t == null) continue;
            const saltada = esSaltada(x);
            evs.push({
                t: x.t, hecha: !saltada,
                reps: saltada ? null : (Number(x.reps) || 0), peso: saltada ? null : (x.peso ?? null),
                dur: saltada ? null : (x.duracionSeg ?? null),
                ...(x.descansoMs != null ? { descansoMs: x.descansoMs } : {}),
                ...(x.ejecMs != null ? { ejecMs: x.ejecMs } : {}),
            });
            if (x.t > lejos) lejos = x.t;
        }
        if (evs.length) filas.push({ nombre: e.nombre || e.ejercicioId || "–", evs });
    }
    const pausas = (s.pausas ?? [])
        .filter(p => Number.isFinite(p.t) && Number.isFinite(p.ms) && p.ms > 0)
        .sort((a, b) => a.t - b.t);
    const finActivo = Math.max(
        lejos,
        Number(s.transcurridoMs) || 0,
        (Number(s.duracionMin) || 0) * 60000,
        60000,
    );
    const inicioReal = typeof s.inicioRealMs === "number" && Number.isFinite(s.inicioRealMs)
        ? s.inicioRealMs
        : null;
    const col = (i: number): string => [CONFIG.NARANJA, CONFIG.AZUL, CONFIG.VERDE, "#af7ac5"][i % 4];
    const horaReal = (inicioMs: number, transcurridoMs: number): string => new Date(inicioMs + transcurridoMs)
        .toLocaleTimeString("es-ES", { hour: "numeric", minute: "2-digit", hour12: true });

    const wrap = el("div", "margin:10px 0 6px;");
    const cabecera = el("div", "display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;");
    cabecera.appendChild(el("div", "gym-et", "🕒 Línea de tiempo de la sesión"));
    const controlesZoom = el("div", "display:flex;align-items:center;gap:5px;");
    const etiquetaZoom = el("span", "font-size:.75em;opacity:.7;min-width:32px;text-align:center;", "1×");
    let zoom = 1;
    let contenido: HTMLDivElement;
    const fijarZoom = (valor: number): void => {
        zoom = Math.max(1, Math.min(4, valor));
        etiquetaZoom.textContent = `${zoom.toFixed(zoom % 1 ? 1 : 0)}×`;
        contenido.style.width = `${zoom * 100}%`;
        ventana.classList.toggle("gym-cal-linea-ampliada", zoom > 1);
    };
    const reducir = btn("−", "gym-mini", () => fijarZoom(zoom - 0.5));
    reducir.title = "Alejar línea de tiempo";
    reducir.setAttribute("aria-label", reducir.title);
    const ampliar = btn("+", "gym-mini", () => fijarZoom(zoom + 0.5));
    ampliar.title = "Acercar línea de tiempo";
    ampliar.setAttribute("aria-label", ampliar.title);
    const restablecer = btn("↺", "gym-mini", () => fijarZoom(1));
    restablecer.title = "Restablecer zoom";
    restablecer.setAttribute("aria-label", restablecer.title);
    controlesZoom.append(reducir, etiquetaZoom, ampliar, restablecer);
    cabecera.appendChild(controlesZoom);
    wrap.appendChild(cabecera);

    const ventana = el("div", "gym-cal-linea-ventana");
    ventana.setAttribute("aria-label", "Línea de tiempo de la sesión; usa los controles, la rueda o pellizca para cambiar el zoom");
    contenido = el("div", "min-width:100%;");
    ventana.appendChild(contenido);
    wrap.appendChild(ventana);

    const pct = (t: number): number => Math.min(100, Math.max(0, t / finActivo * 100));
    const seccion = el("div", "margin-top:5px;");
    const marcas = [0, 0.25, 0.5, 0.75, 1];
    seccion.classList.add("gym-cal-linea-seccion");
    if (pausas.length) {
        const filaP = el("div", "display:flex;align-items:center;gap:8px;margin:3px 0;");
        filaP.appendChild(el("div", "flex:0 0 90px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.76em;opacity:.6;", "⏸ pausas"));
        const pistaP = el("div", "flex:1;position:relative;height:14px;border-radius:7px;background:var(--background-secondary);overflow:hidden;");
        for (const pausa of pausas) {
            const marca = el("div", "position:absolute;top:0;bottom:0;width:3px;background:var(--text-faint);");
            marca.style.left = `calc(${pct(pausa.t)}% - 1.5px)`;
            conAyuda(marca, () => `⏸ Pausa de ${relojMs(pausa.ms)} — a los ${relojMs(pausa.t)} de sesión activa`, true);
            pistaP.appendChild(marca);
        }
        filaP.appendChild(pistaP);
        seccion.appendChild(filaP);
    }

    filas.forEach((f, iF) => {
        const color = col(iF);
        const fila = el("div", "display:flex;align-items:center;gap:8px;margin:3px 0;");
        const nom = el("div", "flex:0 0 90px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.76em;opacity:.85;");
        const cuad = el("span", "", "■");
        cuad.style.color = color;
        nom.append(cuad, " " + f.nombre);
        const fin = f.evs[f.evs.length - 1];
        conAyuda(nom, () => `${f.nombre} — ${f.evs.length} registro${f.evs.length === 1 ? "" : "s"} · de ${relojMs(f.evs[0].t)} a ${relojMs(fin.t)}` +
            (fin.t > f.evs[0].t ? ` · ${relojMs(fin.t - f.evs[0].t)} de duración` : ""), true);
        fila.appendChild(nom);
        const pista = el("div", "flex:1;position:relative;height:14px;border-radius:7px;background:var(--background-secondary);overflow:hidden;");

        const tramo = el("div", `position:absolute;top:0;bottom:0;border-radius:7px;background:${color};opacity:.18;`);
        tramo.style.left = `${pct(f.evs[0].t)}%`;
        tramo.style.width = `${Math.max(1, pct(fin.t) - pct(f.evs[0].t))}%`;
        pista.appendChild(tramo);

        f.evs.forEach((ev, iS) => {
            const tick = el("div", `position:absolute;top:2px;bottom:2px;width:4px;border-radius:2px;background:${ev.hecha ? color : "var(--text-faint)"};`);
            tick.style.left = `calc(${pct(ev.t)}% - 2px)`;
            conAyuda(tick, () => `${f.nombre} · serie ${iS + 1}${ev.hecha
                ? ev.dur != null
                    ? ` — ${Math.round(ev.dur)} s`
                    : ` — ${ev.reps} reps${ev.peso != null ? ` × ${pesoTexto(ev.peso)}` : ""}`
                : " — ⏭ saltada"} · ${relojMs(ev.t)}` +
                (iS > 0 ? ` · ${relojMs(ev.t - f.evs[iS - 1].t)} después de la anterior` : " · primera del ejercicio") +
                (ev.descansoMs != null && ev.ejecMs != null
                    ? ` (${relojMs(ev.descansoMs)} de descanso + ${relojMs(ev.ejecMs)} de ejecución)` : ""), true);
            pista.appendChild(tick);
        });
        fila.appendChild(pista);
        seccion.appendChild(fila);
    });

    const crearEscala = (etiqueta: string): { fila: HTMLDivElement; valores: HTMLDivElement } => {
        const fila = el("div", "display:flex;align-items:center;gap:8px;margin:2px 0 0;");
        fila.appendChild(el("div", "flex:0 0 90px;min-width:0;font-size:.72em;font-weight:600;opacity:.7;", etiqueta));
        const valores = el("div", "display:flex;flex:1;justify-content:space-between;min-width:0;font-size:.7em;opacity:.55;");
        fila.appendChild(valores);
        return { fila, valores };
    };
    const escala = crearEscala("Duración");
    marcas.forEach(p => escala.valores.appendChild(el("span", "", relojMs(finActivo * p))));
    seccion.appendChild(escala.fila);

    const guias = el("div", "position:absolute;z-index:1;left:98px;right:0;top:0;bottom:34px;pointer-events:none;");
    for (const marca of marcas) {
        const guia = el("div", "position:absolute;top:0;bottom:0;width:1px;background:var(--text-faint);opacity:.28;");
        guia.style.left = `${marca * 100}%`;
        guia.setAttribute("aria-hidden", "true");
        guias.appendChild(guia);
    }
    seccion.appendChild(guias);

    const hora = el("div", "margin-top:5px;");
    const escalaReal = crearEscala("Hora real");
    if (inicioReal != null) {
        marcas.forEach(p => {
            const transcurrido = finActivo * p;
            const pausasAnteriores = pausas
                .filter(pausa => pausa.t < transcurrido)
                .reduce((total, pausa) => total + pausa.ms, 0);
            escalaReal.valores.appendChild(el("span", "", horaReal(inicioReal, transcurrido + pausasAnteriores)));
        });
    } else {
        escalaReal.valores.appendChild(el("span", "", "No disponible"));
    }
    hora.appendChild(escalaReal.fila);
    seccion.appendChild(hora);
    contenido.appendChild(seccion);
    fijarZoom(zoom);

    ventana.addEventListener("wheel", ev => {
        if (Math.abs(ev.deltaY) <= Math.abs(ev.deltaX)) return;
        ev.preventDefault();
        fijarZoom(zoom + (ev.deltaY < 0 ? 0.25 : -0.25));
    }, { passive: false });

    let arrastreRaton: { id: number; x: number; scrollLeft: number } | null = null;
    ventana.addEventListener("pointerdown", ev => {
        if (ev.pointerType !== "mouse" || ev.button !== 0 || zoom <= 1) return;
        arrastreRaton = { id: ev.pointerId, x: ev.clientX, scrollLeft: ventana.scrollLeft };
        ventana.setPointerCapture(ev.pointerId);
    });
    ventana.addEventListener("pointermove", ev => {
        if (ev.pointerType !== "mouse" || arrastreRaton?.id !== ev.pointerId) return;
        const dx = ev.clientX - arrastreRaton.x;
        if (Math.abs(dx) > 3) {
            ventana.classList.add("gym-cal-linea-arrastrando");
            ventana.scrollLeft = arrastreRaton.scrollLeft - dx;
            ev.preventDefault();
        }
    });
    const terminarArrastreRaton = (ev: PointerEvent): void => {
        if (arrastreRaton?.id !== ev.pointerId) return;
        arrastreRaton = null;
        ventana.classList.remove("gym-cal-linea-arrastrando");
        if (ventana.hasPointerCapture(ev.pointerId)) ventana.releasePointerCapture(ev.pointerId);
    };
    ventana.addEventListener("pointerup", terminarArrastreRaton);
    ventana.addEventListener("pointercancel", terminarArrastreRaton);

    const toques = new Map<number, { x: number; y: number }>();
    let distanciaPellizco: number | null = null;
    let toquePan: { id: number; x: number; y: number; scrollLeft: number } | null = null;
    const distanciaEntreToques = (): number => {
        const [a, b] = [...toques.values()];
        return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    ventana.addEventListener("pointerdown", ev => {
        if (ev.pointerType !== "touch") return;
        toques.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        distanciaPellizco = toques.size === 2 ? distanciaEntreToques() : null;
        toquePan = toques.size === 1
            ? { id: ev.pointerId, x: ev.clientX, y: ev.clientY, scrollLeft: ventana.scrollLeft }
            : null;
    });
    ventana.addEventListener("pointermove", ev => {
        if (ev.pointerType !== "touch" || !toques.has(ev.pointerId)) return;
        toques.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        if (toques.size === 1 && toquePan?.id === ev.pointerId) {
            const dx = ev.clientX - toquePan.x;
            const dy = ev.clientY - toquePan.y;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 4) {
                ventana.scrollLeft = toquePan.scrollLeft - dx;
                ev.preventDefault();
            }
            return;
        }
        if (toques.size < 2) return;
        const nuevaDistancia = distanciaEntreToques();
        if (distanciaPellizco && nuevaDistancia > 0) {
            fijarZoom(zoom * nuevaDistancia / distanciaPellizco);
            ev.preventDefault();
        }
        distanciaPellizco = nuevaDistancia;
    });
    const terminarPellizco = (ev: PointerEvent): void => {
        toques.delete(ev.pointerId);
        if (toquePan?.id === ev.pointerId) toquePan = null;
        distanciaPellizco = toques.size === 2 ? distanciaEntreToques() : null;
        if (toques.size === 1) {
            const [id, punto] = [...toques.entries()][0];
            toquePan = { id, x: punto.x, y: punto.y, scrollLeft: ventana.scrollLeft };
        }
    };
    ventana.addEventListener("pointerup", terminarPellizco);
    ventana.addEventListener("pointercancel", terminarPellizco);

    wrap.appendChild(el("div", "font-size:.72em;opacity:.6;margin-top:3px;",
        "■ por ejercicio · ✔ serie hecha · ⏭ saltada (tenue) · fondo de pausas = tiempo detenido"));
    return wrap;
};

export function detalleDia(rutina: Rutina, fecha: string, pintar: Pintar): void {
    const m = modal(`📆 ${fechaLegible(fecha)}`, `${DIAS_LARGO[diaSemana(fecha) - 1] ?? ""}`);
    ponerX(m, "Cerrar detalles del día");
    m.cab.classList.add("gym-cal-detalle-cab");
    const cajaD = el("div");
    m.caja.appendChild(cajaD);

    const rePintar = (): void => {
        cajaD.empty();
        const sesiones = sesionesEn(rutina, fecha);
        const anotaciones = (rutina.notasDia ?? []).filter(n => n.fecha === fecha);
        const prog = diaProgramado(rutina, fecha);

        cajaD.appendChild(el("div", "gym-et", esLibre(rutina)

            ? (sesiones.length || anotaciones.length
                ? "Rutina libre · con registros"
                : "Rutina libre · sin registros ese día")
            : `Programado: ${prog ? prog.nombre : "descanso (día no programado)"}`));
        if (prog) {
            const tipoDia = tipoDiaEnDetalle(prog);
            if (tipoDia) cajaD.appendChild(tipoDia);
        }

        if (sesiones.length) bloqueResumenDia(cajaD, sesiones);

        if (!sesiones.length && !anotaciones.length) {
            cajaD.appendChild(el("div", "opacity:.7;font-size:.88em;margin:10px 0;", "Ese día no tiene registros todavía."));
        }

        for (const s of sesiones) {
            const box = el("div", "gym-ej-reg");
            const cab = el("div", "gym-ej-reg-cab");
            const nSaltadas = totalSaltadas(s);
            const tit = el("div", "gym-ej-nombre");
            tit.append(`🏋️ ${nombreDia(rutina, s.diaId)} `,
                el("span", "gym-chip", `${Number(s.duracionMin) || 0} min`),
                el("span", "gym-chip", cargaTexto(volumenSesion(s), segundosSesion(s))),
                el("span", "gym-chip", `${totalSeries(s)} series`));
            const diaSesion = diaPorId(rutina, s.diaId);
            if (diaSesion && diaSesion.id !== prog?.id) {
                const tipoDia = tipoDiaEnDetalle(diaSesion);
                if (tipoDia) tit.appendChild(tipoDia);
            }
            if (nSaltadas) {
                const chipSal = el("span", "gym-chip",
                    `⏭ ${nSaltadas} saltada${nSaltadas > 1 ? "s" : ""}`);
                chipSal.title = "Series planificadas que no se hicieron";
                tit.appendChild(chipSal);
            }
            const acciones = el("div", "display:flex;gap:6px;");
            acciones.appendChild(btn("✏️ Editar", "gym-mini", () => { m.cerrar(); formularioSesion(rutina, { fecha, sesion: s }, pintar); }));
            acciones.appendChild(btn("🗑 Borrar", "gym-mini peligro", async () => {
                const okBorrar = await confirmar("🗑 Borrar sesión",
                    "¿Borrar esta sesión? No se puede deshacer (queda copia .bak del archivo de datos).",
                    "Borrar", "Cancelar");
                if (!okBorrar) return;
                try {
                    const i = rutina.sesiones.indexOf(s);
                    if (i >= 0) rutina.sesiones.splice(i, 1);
                    await escribirRutina(rutina);
                    toast("✅ Sesión borrada");
                    m.cerrar();
                    void pintar();
                } catch (e: unknown) {
                    console.error("[Gym Stone borrar sesión]", e);
                    toast("⚠️ No pude borrar la sesión: " + msgError(e), false);
                }
            }));
            cab.append(tit, acciones);
            box.appendChild(cab);

            const lt = lineaTiempo(s);
            if (lt) box.appendChild(lt);

            const tabla = createEl("table");
            tabla.className = "gym-tabla";
            const thead = createEl("thead");
            const trH = thead.createEl("tr");
            for (const t of ["Ejercicio", "Series", "Vol. / tiempo", "Notas"]) trH.createEl("th", { text: t });
            tabla.appendChild(thead);
            const tb = createEl("tbody");
            for (const e of s.ejercicios ?? []) {
                const sinReg = esSinRegistrar(e);

                const tipo = tipoEjercicioDe(e);
                const esPeso = tipo === "peso";
                const celdas = (e.series ?? []).map(x => esSaltada(x)
                    ? el("span", "gym-saltada", "⏭ saltada")
                    : esPeso
                        ? `${x.reps ?? "–"}×${pesoTexto(x.peso)}`
                        : `${x.duracionSeg ?? "–"} s`);
                const nHechas = seriesHechas(e).length;
                const nSaltadas = (e.series ?? []).length - nHechas;

                const conT = seriesHechas(e).filter(x => x.t != null).map(x => x.t as number);
                let lineaT: HTMLDivElement | null = null;
                if (conT.length >= 2) {
                    const tramos = conT.slice(1).map((t, i) => t - conT[i]);
                    const dur = conT[conT.length - 1] - conT[0];
                    const repsEj = seriesHechas(e).reduce((a, x) => a + (Number(x.reps) || 0), 0);
                    const rpmEj = esPeso && dur > 0 && repsEj > 0
                        ? repsEj / (dur / 60000)
                        : null;
                    lineaT = el("div", "gym-td-tiempos");
                    lineaT.append(`⏱ ${conT.map(relojMs).join(" · ")}`);
                    const entre = el("span", "gym-td-tiempos-entre",
                        `— entre: ${tramos.map(relojMs).join(" · ")}` +
                        ` · media ${relojMs(tramos.reduce((a, b) => a + b, 0) / tramos.length)}`);
                    if (rpmEj != null) entre.append(` · `, el("b", null, rpmEj.toFixed(1)), " reps/min");
                    lineaT.append(" ", entre);
                }
                const tr = createEl("tr");
                const tdNom = el("td", "gym-td-nom", e.nombre || e.ejercicioId || "–");
                if (sinReg) tdNom.appendChild(el("div", "gym-sinreg gym-td-sub", "⏳ sin registrar"));
                else if (nSaltadas) tdNom.appendChild(el("div", "gym-td-sub",
                    `${nHechas} de ${(e.series ?? []).length} hechas`));
                const tdSeries = createEl("td");
                if (celdas.length) {
                    celdas.forEach((c, i) => { if (i) tdSeries.append(" · "); tdSeries.append(c); });
                } else tdSeries.append("–");
                if (lineaT) tdSeries.appendChild(lineaT);
                const tdVol = el("td", "gym-nowrap", esPeso
                    ? pesoTexto(volumenEjercicio(e))
                    : segundosEjercicio(e) > 0 ? `${Math.round(segundosEjercicio(e))} s` : "–");
                const tdNotas = el("td", "gym-td-notas", e.notas ?? "");
                tr.append(tdNom, tdSeries, tdVol, tdNotas);
                tb.appendChild(tr);
            }
            tabla.appendChild(tb);
            box.appendChild(tabla);
            if (s.anotaciones) box.appendChild(el("div", "font-size:.82em;opacity:.8;margin-top:6px;", `📝 ${s.anotaciones}`));
            cajaD.appendChild(box);
        }

        for (const a of anotaciones) {
            const box = el("div", "gym-ej-reg");
            const cab = el("div", "gym-ej-reg-cab");
            cab.appendChild(el("div", "gym-td-nom", "📝 Anotación"));
            const b = el("button", "gym-mini", "🗑 Borrar");
            b.type = "button";
            b.onclick = async () => {
                try {
                    const i = rutina.notasDia.indexOf(a);
                    if (i >= 0) rutina.notasDia.splice(i, 1);
                    await escribirRutina(rutina);
                    rePintar();
                    void pintar();
                } catch (e: unknown) {
                    console.error("[Gym Stone borrar anotación]", e);
                    toast("⚠️ No pude borrar la anotación: " + msgError(e), false);
                }
            };
            cab.appendChild(b);
            box.appendChild(cab);
            box.appendChild(el("div", "font-size:.86em;", a.texto));
            cajaD.appendChild(box);
        }

        const acciones = el("div", "gym-botones");
        acciones.appendChild(btn("＋ Registrar sesión", "primario", () => abrirRegistro(rutina, { fecha, diaId: prog?.id ?? rutina.dias?.[0]?.id }, pintar, () => m.cerrar())));
        acciones.appendChild(btn("📝 Añadir anotación", "", () => { m.cerrar(); formularioAnotacion(rutina, fecha, pintar); }));
        cajaD.appendChild(acciones);
    };
    rePintar();
}
