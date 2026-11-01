import { CONFIG } from "../config";
import {
    catalogoEjercicios, catalogoEjerciciosTodas, descansoDe, historialEjercicioGlobal,
    idEjercicioLibre, ultimosValores, type EntradaHistorialGlobal,
} from "../datos/calculos";
import { catalogoGestion, renombrarEjercicio, type EjercicioGestion } from "../datos/ejercicios";
import { cargarGrupos, fijarGrupo, gruposEnMemoria, purgarGruposSinUsar } from "../datos/grupos";
import type { EjercicioCatalogo, Rutina, TipoEjercicio } from "../tipos";
import { pesoActual, pesoMostrar, pesoTexto } from "../unidades";
import { aNumero, fechaLegible, limpiarNombre, msgError, norm, tsDe } from "../util";
import { confirmar, KPI, modal, pedirTexto, ponerX, toast, el } from "./componentes";
import { grafica } from "./grafica";

const tiempoEstadistica = (segundos: number): string => {
    const s = Math.max(0, Math.round(segundos));
    if (s < 60) return `${s} s`;
    const min = Math.floor(s / 60), resto = s % 60;
    return resto ? `${min} min ${resto} s` : `${min} min`;
};

const tipoEjercicioTexto = (tipo: TipoEjercicio): string =>
    tipo === "peso" ? "Peso" : tipo === "tiempo" ? "Tiempo" : "Intervalo";

const tablaHistorialEjercicio = (
    raiz: HTMLElement,
    historial: EntradaHistorialGlobal[],
    tipo: TipoEjercicio,
): void => {
    const tabla = el("table", "gym-tabla");
    const cab = el("thead");
    const filaCab = el("tr");
    const peso = tipo === "peso";
    const columnas = peso
        ? ["Fecha", "Rutina · día", "Series", "Mejor serie", "1RM", "Volumen"]
        : ["Fecha", "Rutina · día", "Series", "Mejor duración", "Tiempo"];
    for (const texto of columnas) filaCab.appendChild(el("th", "", texto));
    cab.appendChild(filaCab);
    tabla.appendChild(cab);

    const cuerpo = el("tbody");
    for (const entrada of [...historial].reverse()) {
        const fila = el("tr");
        const serieTexto = peso
            ? entrada.series.map(s => `${s.reps ?? "–"}×${pesoTexto(s.peso)}`).join(" · ")
            : entrada.series.map(s => `${s.duracionSeg ?? "–"} s`).join(" · ");
        const mejor = peso
            ? `${entrada.mejor.reps ?? "–"} × ${pesoTexto(entrada.mejor.peso)}`
            : tiempoEstadistica(entrada.mejorSeg);
        const celdas = [
            fechaLegible(entrada.fecha),
            `${entrada.rutinaNombre} · ${entrada.diaNombre || entrada.diaId}`,
            serieTexto,
            mejor,
        ];
        if (peso) celdas.push(pesoTexto(entrada.oneRM || null), pesoTexto(entrada.volumen));
        else celdas.push(tiempoEstadistica(entrada.series.reduce((t, s) => t + (Number(s.duracionSeg) || 0), 0)));
        for (const [i, texto] of celdas.entries()) {
            fila.appendChild(el("td", i === 0 ? "gym-nowrap" : "", texto));
        }
        cuerpo.appendChild(fila);
    }
    tabla.appendChild(cuerpo);
    const envoltorio = el("div", "gym-tabla-wrap gym-tabla-vista");
    envoltorio.appendChild(tabla);
    raiz.appendChild(envoltorio);
};

const pintarEstadisticasGlobales = (
    raiz: HTMLElement,
    nombre: string,
    historial: EntradaHistorialGlobal[],
): void => {
    raiz.empty();
    raiz.appendChild(el("div", "gym-ejercicios-estadisticas-intro",
        `Historial global de «${nombre}» en todas las rutinas guardadas.`));
    if (!historial.length) {
        raiz.appendChild(el("div", "gym-resumen-sin-record", "Todavía no hay sesiones registradas para este ejercicio."));
        return;
    }

    const tipos: TipoEjercicio[] = ["peso", "tiempo", "intervalo"];
    for (const tipo of tipos) {
        const entradas = historial.filter(h => h.tipoEjercicio === tipo);
        if (!entradas.length) continue;
        const seccion = el("section", "gym-ejercicios-estadisticas-tipo");
        seccion.appendChild(el("div", "gym-tit", `${tipoEjercicioTexto(tipo)} · ${entradas.length} sesiones`));

        const kpis = el("div", "gym-kpis");
        if (tipo === "peso") {
            const series = entradas.flatMap(h => h.series.map(s => ({ serie: s, fecha: h.fecha })));
            const mejorPeso = Math.max(0, ...series.map(x => Number(x.serie.peso) || 0));
            const mejorSerie = [...series].sort((a, b) =>
                (Number(b.serie.peso) || 0) - (Number(a.serie.peso) || 0)
                || (Number(b.serie.reps) || 0) - (Number(a.serie.reps) || 0))[0];
            const mejorRM = Math.max(0, ...entradas.map(h => h.oneRM));
            const volumen = entradas.reduce((t, h) => t + h.volumen, 0);
            kpis.append(
                KPI("Mejor peso", pesoTexto(mejorPeso || null), CONFIG.NARANJA),
                KPI("Mejor serie", mejorSerie ? `${mejorSerie.serie.reps ?? "–"} × ${pesoTexto(mejorSerie.serie.peso)}` : "–",
                    CONFIG.VERDE, mejorSerie ? fechaLegible(mejorSerie.fecha) : undefined),
                KPI("1RM estimado", pesoTexto(mejorRM || null), CONFIG.AZUL),
                KPI("Volumen acumulado", pesoTexto(volumen), "var(--text-muted)", "en este ejercicio"),
            );
            seccion.appendChild(kpis);
            grafica(seccion, [
                {
                    nombre: `1RM estimado (${pesoActual()})`, color: CONFIG.AZUL,
                    puntos: entradas.map(h => ({
                        ts: tsDe(h.fecha), v: pesoMostrar(h.oneRM) ?? 0,
                        titulo: `${pesoTexto(h.oneRM)} · ${h.rutinaNombre}`,
                    })),
                },
                {
                    nombre: `Mejor peso (${pesoActual()})`, color: CONFIG.NARANJA,
                    puntos: entradas.map(h => ({
                        ts: tsDe(h.fecha), v: pesoMostrar(h.mejorPeso) ?? 0,
                        titulo: `${pesoTexto(h.mejorPeso)} · ${h.rutinaNombre}`,
                    })),
                },
            ]);
        } else {
            const mejor = Math.max(0, ...entradas.map(h => h.mejorSeg));
            const segundos = entradas.reduce((t, h) =>
                t + h.series.reduce((a, s) => a + (Number(s.duracionSeg) || 0), 0), 0);
            const nSeries = entradas.reduce((t, h) => t + h.series.length, 0);
            kpis.append(
                KPI("Mejor duración", tiempoEstadistica(mejor), CONFIG.NARANJA),
                KPI("Tiempo acumulado", tiempoEstadistica(segundos), CONFIG.AZUL, "en este ejercicio"),
                KPI("Series registradas", String(nSeries), CONFIG.VERDE),
            );
            seccion.appendChild(kpis);
            grafica(seccion, [{
                nombre: "Mejor duración (s)", color: CONFIG.NARANJA,
                puntos: entradas.map(h => ({
                    ts: tsDe(h.fecha), v: h.mejorSeg,
                    titulo: `${tiempoEstadistica(h.mejorSeg)} · ${h.rutinaNombre}`,
                })),
            }], { fmt: v => `${Math.round(v)} s` });
        }
        tablaHistorialEjercicio(seccion, entradas, tipo);
        raiz.appendChild(seccion);
    }
};

const abrirEstadisticasEjercicio = async (ejercicio: EjercicioGestion): Promise<void> => {
    const m = modal(`📊 ${ejercicio.nombre}`, "estadísticas globales");
    ponerX(m);
    const contenido = el("div");
    contenido.appendChild(el("div", "gym-ejercicios-estadisticas-intro", "Cargando historial…"));
    m.caja.appendChild(contenido);
    try {
        const historial = await historialEjercicioGlobal(ejercicio.id);
        if (!m.overlay.isConnected) return;
        pintarEstadisticasGlobales(contenido, ejercicio.nombre, historial);
    } catch (err: unknown) {
        console.error("[Gym Stone estadísticas globales de ejercicio]", err);
        if (!m.overlay.isConnected) return;
        contenido.empty();
        contenido.appendChild(el("div", "gym-error-vista",
            `⚠️ No pude cargar el historial de «${ejercicio.nombre}»: ${msgError(err)}`));
    }
};

export const resolverEjercicio = (
    catalogo: EjercicioCatalogo[], nombre: string,
): { id: string; nombre: string } | null => {
    const limpio = limpiarNombre(nombre);
    if (!limpio) return null;
    const q = norm(limpio);
    const existente = catalogo.find(x => norm(x.nombre) === q);
    if (existente) return { id: existente.id, nombre: existente.nombre };
    let id = idEjercicioLibre(limpio), n = 2;
    while (catalogo.some(x => x.id === id)) id = `${idEjercicioLibre(limpio)}-${n++}`;
    return { id, nombre: limpio };
};

export interface ControlDescanso {
    raiz: HTMLDivElement;
    seg: () => number;
    aplicar: (s: number | null) => void;
}

export const controlDescanso = (
    segInicial: number | null,
    { etiqueta = "Descanso entre series (segundos)", tocar = () => undefined }: { etiqueta?: string; tocar?: () => void } = {},
): ControlDescanso => {
    const raiz = el("div", "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px;");
    raiz.appendChild(el("div", "gym-et", etiqueta));
    const inDesc = el("input");
    inDesc.type = "number"; inDesc.min = "0"; inDesc.step = "15"; inDesc.inputMode = "numeric";
    inDesc.value = String(Math.round(Number(segInicial) || 0));
    inDesc.placeholder = "90";
    inDesc.style.cssText = "box-sizing:border-box;width:96px;height:34px;min-height:34px;padding:4px 8px;border-radius:8px;" +
        "border:1px solid var(--background-modifier-border);background:var(--background-secondary);" +
        "color:var(--text-normal);font-size:1em;box-sizing:border-box;";
    inDesc.oninput = tocar;
    raiz.appendChild(inDesc);
    const chips = el("div", "display:flex;gap:6px;flex-wrap:wrap;");
    for (const seg of [60, 90, 120, 180, 300]) {
        const b = el("button", "gym-btn gym-chip-desc", `${seg} s`);
        b.type = "button";
        b.onclick = () => { inDesc.value = String(seg); tocar(); };
        chips.appendChild(b);
    }
    raiz.appendChild(chips);
    return {
        raiz,

        seg: () => { const s = aNumero(inDesc.value); return s != null && s > 0 ? Math.round(s) : 0; },

        aplicar: s => { inDesc.value = String(Math.round(Number(s) || 0)); },
    };
};

export const textoDescanso = (n: number | null | undefined): string =>
    (Number(n) > 0 ? `descanso ${Math.round(Number(n))} s` : `＋ descanso`);

export const pedirDescanso = (segActual: number | null): Promise<number | null> => new Promise(resolve => {
    const m = modal("⏳ Descanso", "segundos entre series de este ejercicio", true);
    let resuelto = false;
    const listo = (v: number | null) => {
        if (resuelto) return;
        resuelto = true;
        document.removeEventListener("keydown", onKey);
        m.cerrar();
        resolve(v);
    };
    const onKey = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        if (document.getElementById("gym-confirm-activo")) return;
        listo(null);
    };
    m.overlay.onclick = e => { if (e.target === m.overlay) listo(null); };
    document.addEventListener("keydown", onKey);
    ponerX(m, "Cerrar sin cambiar").onclick = () => listo(null);

    const ctrl = controlDescanso(segActual);
    m.caja.appendChild(ctrl.raiz);
    const ok = el("button", "gym-btn primario gym-btn-ancho gym-mt12", "✔ Usar este descanso");
    ok.type = "button";
    ok.onclick = () => listo(ctrl.seg());
    m.caja.appendChild(ok);
});

export interface EleccionEjercicio {
    id: string;
    nombre: string;
    descansoSeg: number;
}

export const elegirEjercicio = (
    rutina: Rutina, { excluir = [] }: { excluir?: string[] } = {},
): Promise<EleccionEjercicio | null> => new Promise(resolve => {

    let catalogo = catalogoEjercicios(rutina).filter(x => !excluir.includes(x.id));
    const m = modal("＋ Añadir ejercicio", "elige de TODAS tus rutinas o escribe uno nuevo",
        true);

    let resuelto = false;
    const listo = (r: { id: string; nombre: string } | null) => {
        if (resuelto) return;
        resuelto = true;
        document.removeEventListener("keydown", onKey);
        m.cerrar();

        resolve(r && { id: r.id, nombre: r.nombre, descansoSeg: segDescanso() });
    };

    const onKey = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        if (document.getElementById("gym-confirm-activo")) return;

        if (m.overlay.isConnected) {
            const modales = [...document.body.children].filter(n => /^gym-modal/.test(n.className || ""));
            if (modales.length && modales[modales.length - 1] !== m.overlay) return;
        }
        listo(null);
    };
    m.overlay.onclick = e => { if (e.target === m.overlay) listo(null); };
    document.addEventListener("keydown", onKey);
    ponerX(m, "Cerrar sin añadir").onclick = () => listo(null);

    const inNombre = el("input");
    inNombre.type = "text";
    inNombre.placeholder = "Busca (por ejemplo, «press») o escribe uno nuevo";
    inNombre.style.cssText = "box-sizing:border-box;width:100%;height:34px;min-height:34px;padding:4px 8px;border-radius:8px;" +
        "border:1px solid var(--background-modifier-border);background:var(--background-secondary);" +
        "color:var(--text-normal);font-size:1em;box-sizing:border-box;";
    m.caja.appendChild(el("div", "gym-et", "Ejercicio"));
    m.caja.appendChild(inNombre);

    const cajaGrupos = el("div", "display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;");
    m.caja.appendChild(cajaGrupos);
    let grupoActivo = "";
    let soloSinGrupo = false;

    const lista = el("div", "max-height:250px;overflow:auto;margin-top:8px;" +
        "border:1px solid var(--background-modifier-border);border-radius:8px;");
    m.caja.appendChild(lista);

    const cuenta = el("div", "font-size:.74em;opacity:.6;margin-top:5px;");
    m.caja.appendChild(cuenta);

    let descansoAMano = false;
    const ctrlDesc = controlDescanso(90, { tocar: () => { descansoAMano = true; } });
    m.caja.appendChild(ctrlDesc.raiz);
    const segDescanso = () => ctrlDesc.seg();
    const sugiereDescanso = (id: string) => {
        if (descansoAMano) return;
        ctrlDesc.aplicar(descansoDe(rutina, id) ?? 90);
    };

    const btnUsar = el("button", "gym-btn primario gym-btn-ancho gym-mt8");
    btnUsar.type = "button";
    m.caja.appendChild(btnUsar);

    let pendiente: { id: string; nombre: string } | null = null;
    const pintar = () => {
        const q = norm(inNombre.value);
        const grupos = gruposEnMemoria();
        const grupoDe = (id: string) => grupos[id] ?? "";

        const enUso = [...new Set(catalogo.map(x => grupoDe(x.id)).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, "es"));
        const sinGrupo = catalogo.filter(x => !grupoDe(x.id)).length;
        if (grupoActivo && !enUso.includes(grupoActivo)) grupoActivo = "";
        cajaGrupos.empty();
        if (enUso.length || sinGrupo) {
            const chip = (texto: string, valor: string, especial = ""): void => {
                const activo = especial === "sin" ? soloSinGrupo : !soloSinGrupo && grupoActivo === valor;
                const c = el("button", "gym-chip gym-puntero" + (activo ? " on" : ""), texto);
                c.type = "button";
                c.onclick = () => { grupoActivo = valor; soloSinGrupo = especial === "sin"; pintar(); };
                cajaGrupos.appendChild(c);
            };
            chip("Todos", "");
            for (const g of enUso) chip(g, g);
            if (sinGrupo) chip(`Sin grupo (${sinGrupo})`, "", "sin");
        }

        const visibles = catalogo.filter(x =>
            (!grupoActivo || grupoDe(x.id) === grupoActivo) &&
            (!soloSinGrupo || !grupoDe(x.id)) &&
            (!q || norm(x.nombre).includes(q) || norm(grupoDe(x.id)).includes(q)));

        lista.empty();
        if (!visibles.length) {
            lista.appendChild(el("div", "padding:12px;opacity:.65;font-size:.86em;",
                q || grupoActivo
                    ? "Ningún ejercicio guardado encaja: al guardarlo se creará uno nuevo."
                    : "Sin ejercicios todavía: se creará el primero."));
        }
        for (const x of visibles) {
            const u = ultimosValores(rutina, x.id);
            const g = grupoDe(x.id);
            const fila = el("div", "cursor:pointer;padding:9px 12px;" +
                "border-bottom:1px solid var(--background-modifier-border);" +
                "display:flex;align-items:center;gap:8px;");
            const txt = el("div", "flex:1;min-width:0;");

            const nomFila = el("div", "gym-ej-nombre");
            nomFila.append(x.nombre, " ");
            const chipGrupo = el("span", g ? "gym-chip gym-chip-mini gym-grupo" : "gym-chip gym-chip-mini gym-sin-grupo",
                g || "sin grupo");
            nomFila.appendChild(chipGrupo);
            const subFila = el("div", "gym-ej-sub",
                u
                    ? u.tipoEjercicio === "peso"
                        ? `última vez: ${u.reps ?? "–"} × ${pesoTexto(u.peso)} · ${fechaLegible(u.fecha)}`
                        : `última vez: ${u.series} serie${u.series === 1 ? "" : "s"} · ${fechaLegible(u.fecha)}`
                    : x.rutina ? `solo en «${x.rutina}» · sin registros en esta rutina`
                               : "sin registros todavía");
            txt.append(nomFila, subFila);
            fila.appendChild(txt);

            const btnG = el("button", "gym-chip gym-chip-btn", g || "🏷");
            btnG.type = "button";
            btnG.title = g
                ? `Grupo muscular: ${g} — clic para cambiar o quitar`
                : "Asignar grupo muscular (para filtrar y buscar por él)";
            btnG.onclick = async e => {
                e.stopPropagation();
                const sugeridos = [...new Set(Object.values(gruposEnMemoria()))]
                    .sort((a, b) => a.localeCompare(b, "es"));
                const r = await pedirTexto(`🏷 Grupo muscular · ${x.nombre}`, g, sugeridos, true);
                if (r === null) return;
                await fijarGrupo(x.id, r);
                pintar();
            };
            fila.appendChild(btnG);
            fila.onclick = () => { sugiereDescanso(x.id); listo({ id: x.id, nombre: x.nombre }); };
            lista.appendChild(fila);
        }

        const nOtras = catalogo.filter(x => x.rutina).length;
        const sinGrupoVis = visibles.filter(x => !grupoDe(x.id)).length;
        cuenta.textContent = !catalogo.length
            ? "Sin ejercicios guardados en ninguna rutina."
            : (q || grupoActivo || soloSinGrupo)
                ? `${visibles.length} de ${catalogo.length} ejercicios en pantalla` +
                  (q ? ` con «${inNombre.value.trim()}»` : "") +
                  (grupoActivo ? ` · grupo «${grupoActivo}»` : "") +
                  (soloSinGrupo ? " · solo los sin grupo" : "") +
                  (sinGrupoVis ? ` · ${sinGrupoVis} sin grupo` : "")
                : `${catalogo.length} ejercicios en total` +
                  (nOtras ? ` · ${catalogo.length - nOtras} de esta rutina y ${nOtras} de otras` : "") +
                  (sinGrupo ? ` · ${sinGrupo} sin grupo` : "");

        const texto = inNombre.value.trim();
        if (!texto) { pendiente = null; btnUsar.hidden = true; return; }
        const exacto = catalogo.find(x => norm(x.nombre) === q);
        const unico = (!exacto && visibles.length === 1) ? visibles[0] : null;
        pendiente = exacto ? { id: exacto.id, nombre: exacto.nombre }
            : unico ? { id: unico.id, nombre: unico.nombre }
            : resolverEjercicio(catalogo, texto);
        if (pendiente) sugiereDescanso(pendiente.id);
        btnUsar.hidden = false;
        btnUsar.textContent = exacto ? `✔ Usar «${exacto.nombre}»`
            : unico ? `✔ Usar «${unico.nombre}» (único resultado)`
            : `＋ Crear ejercicio nuevo «${texto}»`;
    };
    inNombre.oninput = pintar;
    inNombre.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); if (pendiente) listo(pendiente); } };
    btnUsar.onclick = () => { if (pendiente) listo(pendiente); };

    pintar();
    inNombre.focus();

    void (async () => {
        let total: EjercicioCatalogo[] | null = null;
        try { total = await catalogoEjerciciosTodas(rutina); }
        catch { total = null; }
        if (resuelto || !Array.isArray(total)) return;
        catalogo = total.filter(x => !excluir.includes(x.id));
        pintar();
    })();

    cargarGrupos()
        .then(() => { if (!resuelto) pintar(); })
        .catch((err: unknown) => { console.warn("[Gym Stone] No se pudieron cargar los grupos musculares", err); });
});

export const pintarGestionEjercicios = (cont: HTMLElement): void => {
    cont.appendChild(el("div", "opacity:.75;font-size:.82em;",
        "Renombrar cambia solo el texto mostrado: el id del ejercicio es estable, " +
        "así que el historial, las series guardadas y las gráficas se conservan."));

    const inBusca = el("input", "gym-ejercicios-busca");
    inBusca.type = "text";
    inBusca.placeholder = "Busca por nombre o grupo";
    inBusca.setAttribute("aria-label", "Buscar por nombre o grupo");
    cont.appendChild(inBusca);

    const categorias = el("div", "gym-ejercicios-categorias");
    cont.appendChild(categorias);

    const lista = el("div", "gym-ejercicios-lista");
    cont.appendChild(lista);
    const cuenta = el("div", "font-size:.74em;opacity:.6;margin-top:5px;");
    cont.appendChild(cuenta);

    let cat: EjercicioGestion[] = [];
    let cargando = true;
    let huerfanos: string[] = [];
    const gruposActivos = new Set<string>();
    let incluirSinGrupo = false;
    const editando = new Set<string>();

    const btnPurga = el("button", "gym-btn gym-btn-purga");
    btnPurga.type = "button";
    btnPurga.hidden = true;
    btnPurga.onclick = async () => {
        if (!huerfanos.length) return;
        const ok = await confirmar("🧹 Purgar entradas sin uso",
            `Se quitarán ${huerfanos.length} ejercicio(s) del fichero de grupos: ya no ` +
            "aparecen en ninguna rutina ni plantilla." +
            "\n\nNo se toca ninguna rutina ni plantilla.", "Purgar", "Cancelar");
        if (!ok) return;
        try {
            btnPurga.disabled = true;
            const fuera = await purgarGruposSinUsar(new Set(cat.map(x => x.id)));
            toast(`🧹 ${fuera.length} entrada(s) quitada(s) del fichero de grupos.`);
        } catch (err: unknown) {
            console.error("[Gym Stone purga grupos]", err);
            toast("⚠️ No pude purgar: " + msgError(err), false);
        }
        btnPurga.disabled = false;
        try { cat = await catalogoGestion(); }
        catch (err: unknown) { console.warn("[Gym Stone] No se pudo actualizar el catálogo de ejercicios", err); }
        pintar();
    };
    cont.appendChild(btnPurga);

    const estInput = "box-sizing:border-box;flex:1 1 170px;min-width:0;height:34px;min-height:34px;padding:4px 8px;border-radius:8px;" +
        "border:1px solid var(--background-modifier-border);background:var(--background-secondary);" +
        "color:var(--text-normal);font-size:.92em;box-sizing:border-box;";

    const pintar = () => {

        const sugeridos = new Set<string>(Object.values(gruposEnMemoria()));
        for (const e of cat) if (e.grupo) sugeridos.add(e.grupo);

        const usados = new Set(cat.map(x => x.id));
        huerfanos = Object.keys(gruposEnMemoria()).filter(id => !usados.has(id)).sort();
        btnPurga.hidden = cargando || !huerfanos.length;
        btnPurga.textContent = `🧹 Purgar ${huerfanos.length} entrada${huerfanos.length > 1 ? "s" : ""} sin uso` +
            " (ejercicios que ya no están en ninguna rutina)";

        const grupos = [...new Set(cat.map(x => x.grupo).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, "es"));
        const nSinGrupo = cat.filter(x => !x.grupo).length;
        for (const grupo of gruposActivos) {
            if (!grupos.includes(grupo)) gruposActivos.delete(grupo);
        }
        if (!nSinGrupo) incluirSinGrupo = false;
        categorias.empty();
        const chipCategoria = (texto: string, grupo: string | null): void => {
            const activo = grupo === null ? gruposActivos.size === 0 && !incluirSinGrupo
                : grupo === "" ? incluirSinGrupo : gruposActivos.has(grupo);
            const b = el("button", "gym-chip gym-puntero" + (activo ? " on" : ""), texto);
            b.type = "button";
            b.setAttribute("aria-pressed", String(activo));
            b.onclick = () => {
                if (grupo === null) {
                    gruposActivos.clear();
                    incluirSinGrupo = false;
                } else if (grupo === "") {
                    incluirSinGrupo = !incluirSinGrupo;
                } else if (gruposActivos.has(grupo)) {
                    gruposActivos.delete(grupo);
                } else {
                    gruposActivos.add(grupo);
                }
                pintar();
            };
            categorias.appendChild(b);
        };
        for (const grupo of grupos) {
            chipCategoria(`${grupo} (${cat.filter(x => x.grupo === grupo).length})`, grupo);
        }
        if (nSinGrupo) chipCategoria(`Sin grupo (${nSinGrupo})`, "");

        const filtrosActivos = gruposActivos.size > 0 || incluirSinGrupo || !!inBusca.value.trim();
        const limpiarFiltros = el("button", "gym-btn gym-ejercicios-limpiar-filtros", "Limpiar filtros");
        limpiarFiltros.type = "button";
        limpiarFiltros.disabled = !filtrosActivos;
        limpiarFiltros.onclick = () => {
            gruposActivos.clear();
            incluirSinGrupo = false;
            inBusca.value = "";
            pintar();
        };
        categorias.appendChild(limpiarFiltros);

        const q = norm(inBusca.value);

        const visibles = cat.filter(x =>
            (!(gruposActivos.size || incluirSinGrupo) || gruposActivos.has(x.grupo) || (incluirSinGrupo && !x.grupo)) &&
            (!q || norm(x.nombre).includes(q) || norm(x.grupo).includes(q)));

        lista.empty();
        if (cargando) {
            lista.appendChild(el("div", "padding:12px;opacity:.65;font-size:.86em;",
                "Leyendo todas las rutinas y plantillas…"));
        } else if (!visibles.length) {
            lista.appendChild(el("div", "padding:12px;opacity:.65;font-size:.86em;",
                cat.length ? q ? "Ningún ejercicio coincide con la búsqueda."
                    : "No hay ejercicios en esta categoría."
                           : "Sin ejercicios todavía en ninguna rutina."));
        }
        for (const e of visibles) {
            const estaEditando = editando.has(e.id);
            const fila = el("div", "gym-ejercicios-fila" + (estaEditando ? " editando" : ""));
            const cabecera = el("div", "gym-ejercicios-fila-cab");
            const detalle = el("div", "gym-flex1");
            detalle.appendChild(el("div", "gym-ej-nombre", e.nombre));
            const sitio = [
                e.grupo || "Sin grupo",
                e.rutinas.length ? `en ${e.rutinas.length} rutina${e.rutinas.length > 1 ? "s" : ""}` : "",
                e.plantillas.length ? `${e.plantillas.length} plantilla${e.plantillas.length > 1 ? "s" : ""}` : "",
                `${e.apariciones} aparicion${e.apariciones === 1 ? "" : "es"}`,
            ].filter(Boolean).join(" · ");
            detalle.appendChild(el("div", "gym-ej-sub", sitio));
            const abrir = el("div", "gym-ejercicios-fila-info");
            abrir.setAttribute("role", "button");
            abrir.tabIndex = 0;
            abrir.title = `Ver estadísticas de ${e.nombre}`;
            abrir.setAttribute("aria-label", `Ver estadísticas de ${e.nombre}`);
            abrir.onclick = () => { void abrirEstadisticasEjercicio(e); };
            abrir.onkeydown = evento => {
                if (evento.key !== "Enter" && evento.key !== " ") return;
                evento.preventDefault();
                abrir.click();
            };
            abrir.appendChild(detalle);
            cabecera.appendChild(abrir);

            const editar = el("button", "gym-mini gym-ejercicio-editar", estaEditando ? "✕" : "✎");
            editar.type = "button";
            editar.title = estaEditando ? "Cancelar edición" : "Editar nombre o grupo";
            editar.setAttribute("aria-label", `${editar.title}: ${e.nombre}`);
            editar.onclick = () => {
                if (estaEditando) editando.delete(e.id);
                else editando.add(e.id);
                pintar();
            };
            cabecera.appendChild(editar);
            fila.appendChild(cabecera);

            if (estaEditando) {
                const controles = el("div", "gym-ejercicios-editor");
                controles.appendChild(el("div", "gym-ejercicios-editor-titulo", `Editando: ${e.nombre}`));

                const inN = el("input");
                inN.type = "text"; inN.value = e.nombre;
                inN.setAttribute("aria-label", "Nombre del ejercicio");
                inN.style.cssText = estInput;
                const inG = el("select", "gym-ejercicios-grupo-select");
                inG.setAttribute("aria-label", "Grupo muscular");
                inG.appendChild(el("option", null, "Sin grupo"));
                inG.options[0].value = "";
                const gruposOrdenados = [...sugeridos].sort((a, b) => a.localeCompare(b, "es"));
                for (const grupo of gruposOrdenados) {
                    const opcion = el("option", null, grupo);
                    opcion.value = grupo;
                    inG.appendChild(opcion);
                }
                inG.value = e.grupo;
                const crearGrupo = el("button", "gym-btn gym-ejercicios-crear-grupo", "＋ Crear grupo");
                crearGrupo.type = "button";
                crearGrupo.onclick = async () => {
                    const sugerencias = [...sugeridos].sort((a, b) => a.localeCompare(b, "es"));
                    const escrito = await pedirTexto("Crear grupo muscular", "", sugerencias);
                    if (escrito === null) return;
                    const limpio = escrito.trim();
                    if (!limpio) {
                        toast("⚠️ El nombre del grupo no puede quedar vacío.", false);
                        return;
                    }
                    const existente = sugerencias.find(grupo => norm(grupo) === norm(limpio));
                    const grupo = existente ?? limpio;
                    if (!existente) {
                        const opcion = el("option", null, grupo);
                        opcion.value = grupo;
                        inG.appendChild(opcion);
                    }
                    inG.value = grupo;
                    quitarGrupo.disabled = false;
                };
                const quitarGrupo = el("button", "gym-btn gym-ejercicios-quitar-grupo", "Quitar grupo");
                quitarGrupo.type = "button";
                quitarGrupo.disabled = !inG.value;
                quitarGrupo.onclick = () => {
                    inG.value = "";
                    quitarGrupo.disabled = true;
                };
                inG.onchange = () => { quitarGrupo.disabled = !inG.value; };
                const guardar = el("button", "gym-btn gym-btn-guardar-ej", "Guardar");
                guardar.type = "button";
                guardar.title = "Guardar nombre y grupo de este ejercicio";

                guardar.onclick = async () => {
                    const nuevoNombre = limpiarNombre(inN.value);
                    if (!nuevoNombre) return toast("⚠️ El nombre no puede quedar vacío.", false);
                    const cambioNombre = nuevoNombre !== e.nombre;
                    const nuevoGrupo = inG.value.trim();
                    const cambioGrupo = nuevoGrupo !== e.grupo;
                    if (!cambioNombre && !cambioGrupo) {
                        editando.delete(e.id);
                        pintar();
                        return;
                    }
                    if (cambioNombre) {
                        const choque = cat.some(o => o.id !== e.id && norm(o.nombre) === norm(nuevoNombre));
                        const aviso = choque
                            ? "\n\n⚠️ Ya existe OTRO ejercicio con ese nombre: convivirán (comparten texto, no historial)."
                            : "";
                        const ok = await confirmar("✏️ Renombrar ejercicio",
                            `Se pasará «${e.nombre}» → «${nuevoNombre}» en ${e.rutinas.length} rutina(s)` +
                            (e.plantillas.length ? ` y ${e.plantillas.length} plantilla(s)` : "") + "." +
                            "\nEl historial NO se pierde: el id del ejercicio es estable." + aviso,
                            "Renombrar", "Cancelar");
                        if (!ok) return;
                    }
                    try {
                        guardar.disabled = true;
                        const res = cambioNombre ? await renombrarEjercicio(e.id, nuevoNombre) : null;
                        await fijarGrupo(e.id, nuevoGrupo);
                        toast(cambioNombre
                            ? `✅ «${nuevoNombre}» actualizado: ${res?.rutinas ?? 0} rutina(s)` +
                              (res?.plantillas ? `, ${res.plantillas} plantilla(s)` : "")
                            : nuevoGrupo ? `🏷 «${nuevoNombre}»: grupo «${nuevoGrupo}»`
                                         : `🏷 «${nuevoNombre}»: sin grupo`);
                        editando.delete(e.id);
                        cat = await catalogoGestion();
                        pintar();
                    } catch (err: unknown) {
                        guardar.disabled = false;
                        console.error("[Gym Stone renombrar]", err);
                        toast("⚠️ No pude guardar: " + msgError(err), false);
                    }
                };

                controles.append(inN, inG, crearGrupo, quitarGrupo, guardar);
                fila.appendChild(controles);
            }
            lista.appendChild(fila);
        }
        cuenta.textContent = cargando
            ? "Leyendo el catálogo del vault…"
            : `${cat.length} ejercicios` +
              (nSinGrupo ? ` · ${nSinGrupo} sin grupo` : "") +
              (visibles.length !== cat.length ? ` · ${visibles.length} en pantalla` : "");
    };
    inBusca.oninput = pintar;
    pintar();

    void (async () => {
        try { cat = await catalogoGestion(); }
        catch (e: unknown) {
            console.error("[Gym Stone catálogo]", e);
            toast("⚠️ No pude leer el catálogo: " + msgError(e), false);
        }
        cargando = false;
        pintar();
    })();
};
