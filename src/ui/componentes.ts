import { CONFIG } from "../config";
import { aplicacion } from "../estado";
import { pesoActual, UNIDADES_PESO, fijarUnidadPeso } from "../unidades";
import type { UnidadPeso } from "../tipos";

export function el<K extends keyof HTMLElementTagNameMap>(
    tag: K, claseOCss?: string | null, texto?: string,
): HTMLElementTagNameMap[K] {
    const e = createEl(tag);
    if (claseOCss) {
        if (claseOCss.includes(":")) e.style.cssText = claseOCss;
        else e.className = claseOCss;
    }
    if (texto !== undefined) e.textContent = texto;
    return e;
}

export const parrafo = (raiz: HTMLElement, texto: string): HTMLDivElement => {
    const d = el("div", "gym-parrafo", texto);
    raiz.appendChild(d);
    return d;
};

let globo: HTMLDivElement | null = null;
let globoEscuchas = false;
const cerrarGlobo = (): void => { globo?.remove(); globo = null; };

export const conAyuda = (e: HTMLElement, texto: () => string): void => {
    const abrir = (): void => {
        cerrarGlobo();
        const g = el("div", "position:fixed;z-index:10040;max-width:min(280px,80vw);padding:6px 10px;border-radius:8px;background:var(--background-primary);border:1px solid var(--background-modifier-border);box-shadow:0 4px 14px rgba(0,0,0,.35);font-size:.78em;line-height:1.45;pointer-events:none;", texto());
        document.body.appendChild(g);
        const r = e.getBoundingClientRect();
        const b = g.getBoundingClientRect();
        let top = r.top - b.height - 6;
        if (top < 6) top = r.bottom + 6;
        g.style.top = `${Math.max(6, Math.min(top, window.innerHeight - b.height - 6))}px`;
        g.style.left = `${Math.max(6, Math.min(r.left + r.width / 2 - b.width / 2, window.innerWidth - b.width - 6))}px`;
        globo = g;
        if (!globoEscuchas) {
            globoEscuchas = true;
            window.addEventListener("scroll", cerrarGlobo, { passive: true, capture: true });
        }
    };
    e.classList.add("gym-con-ayuda");
    e.addEventListener("pointerenter", (ev) => { if (ev.pointerType === "mouse") abrir(); });
    e.addEventListener("pointerleave", cerrarGlobo);
    e.addEventListener("pointerdown", () => {                                                   // tap de móvil
        abrir();
        window.setTimeout(() => document.addEventListener("pointerdown", cerrarGlobo, { once: true, capture: true }), 0);
    });
};

export const KPI = (k: string, v: string, color: string, pie?: string | HTMLElement): HTMLDivElement => {
    const d = el("div", "gym-kpi");
    d.style.setProperty("--color", color);
    const p = el("div", "p");
    if (typeof pie === "string") p.textContent = pie;
    else if (pie) p.appendChild(pie);
    d.append(el("div", "k", k), el("div", "v", v), p);
    return d;
};

export const caja = (raiz: HTMLElement, titulo: string, subtitulo?: string): HTMLDivElement => {
    const c = el("div");
    c.style.cssText = `border:1px solid ${CONFIG.BORDE};border-radius:12px;padding:16px;margin:12px 0;line-height:1.45;`;
    raiz.appendChild(c);
    const t = el("div", "gym-tit-caja");
    t.append(el("span", "gym-naranja", titulo), " ", el("span", "gym-sub", subtitulo ?? ""));
    c.appendChild(t);
    return c;
};

export const cajaColapsable = (raiz: HTMLElement, titulo: string, subtitulo: string, clave: string): HTMLDivElement => {
    const c2 = caja(raiz, titulo, subtitulo);
    c2.classList.add("gym-colaps");
    const tTit = c2.firstElementChild as HTMLDivElement;
    tTit.classList.add("gym-colaps-tit");
    const nombre = titulo.replace(/^\S+\s/, "");
    const nombreMin = nombre.charAt(0).toLowerCase() + nombre.slice(1);

    let abierta = false;
    try { abierta = aplicacion().loadLocalStorage(clave) === "1"; }
    catch (err: unknown) { console.warn("[Gym Stone] No se pudo leer el estado plegable", err); }
    const etiqueta = el("div", "gym-colaps-etq");
    etiqueta.append(
        el("span", "gym-naranja", titulo), " ",
        el("span", "gym-sub", subtitulo),
    );
    const bPliegue = el("button", "gym-btn gym-colaps-btn", "");
    bPliegue.type = "button";

    tTit.replaceChildren(etiqueta, bPliegue);
    const pintarTit = () => {
        c2.classList.toggle("oculto", !abierta);
        bPliegue.textContent = (abierta ? "▾ Ocultar " : "▸ Ver ") + nombreMin;
        bPliegue.title = (abierta ? "Ocultar " : "Mostrar ") + nombreMin;
    };
    bPliegue.onclick = () => {
        abierta = !abierta;
        try { aplicacion().saveLocalStorage(clave, abierta ? "1" : "0"); }
        catch (err: unknown) { console.warn("[Gym Stone] No se pudo guardar el estado plegable", err); }
        pintarTit();
    };
    pintarTit();

    const cuerpo = el("div", "gym-colaps-cuerpo");
    c2.appendChild(cuerpo);
    return cuerpo;
};

const parseColor = (c: string): { r: number; g: number; b: number; a: number } | null => {
    const s = String(c || "").trim();
    if (!s || s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    const m = /^rgba?\(([^)]+)\)$/i.exec(s);
    if (!m) return null;
    const p = m[1].replace(/\//g, " ").trim().split(/[\s,]+/).filter(Boolean);
    const r = Number(p[0]), g = Number(p[1]), b = Number(p[2]);
    if (![r, g, b].every(Number.isFinite)) return null;
    let a = 1;
    if (p.length > 3) {
        a = p[3].endsWith("%") ? Number(p[3].slice(0, -1)) / 100 : Number(p[3]);
        if (!Number.isFinite(a)) a = 1;
    }
    return { r, g, b, a };
};

const opacaFondo = (th: HTMLTableCellElement): void => {
    const fijo = (col: { r: number; g: number; b: number }) => {
        const t = `rgb(${col.r},${col.g},${col.b})`;
        if (th.style.background !== t) th.style.background = t;
    };
    const c = parseColor(getComputedStyle(th).backgroundColor);
    if (c && c.a >= 1) return fijo(c);
    let n = th.parentElement;
    while (n) {   // transparente: se sube buscando el primer ancestro con fondo opaco
        const cn = parseColor(getComputedStyle(n).backgroundColor);
        if (cn && cn.a >= 1) return fijo(cn);
        n = n.parentElement;
    }
    const lum = c ? (c.r * .299 + c.g * .587 + c.b * .114) / 255 : 1;
    const solido = lum > .5 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
    fijo(solido);
};

export const limitaAlto = (wrap: HTMLElement, t: HTMLTableElement, n: number): void => {
    const cabeceras = t.tHead ? [...t.tHead.rows[0].cells] : [];
    const medir = () => {
        cabeceras.forEach(c => opacaFondo(c));
        const filas = [...(t.tBodies[0]?.rows ?? [])].slice(0, n);
        if (!filas.length) { wrap.style.removeProperty("max-height"); return; }
        const cab = t.tHead ? t.tHead.offsetHeight : 0;
        const alto = cab + filas.reduce((s, f) => s + f.offsetHeight, 0);
        if (alto <= 0) return;
        const px = `${Math.ceil(alto)}px`;
        if (wrap.style.maxHeight !== px) wrap.style.maxHeight = px;
    };
    medir();
    if (typeof ResizeObserver === "function") {
        const ro = new ResizeObserver(medir);
        ro.observe(wrap);
    }
};

export const tablaEn = (
    raiz: HTMLElement, cabeceras: string[], filas: (string | HTMLElement)[][],
    { filasVisibles = 0 }: { filasVisibles?: number } = {},
): HTMLTableElement => {
    const t = createEl("table");
    t.className = "gym-tabla";
    const thead = el("thead");
    const trh = el("tr");
    for (const h of cabeceras) trh.append(el("th", null, h));
    thead.appendChild(trh);
    t.appendChild(thead);
    const tb = createEl("tbody");
    for (const f of filas) {
        const tr = createEl("tr");
        for (const c of f) {
            if (typeof c === "string") tr.append(el("td", null, c));
            else { const td = el("td"); td.appendChild(c); tr.append(td); }
        }
        tb.appendChild(tr);
    }
    t.appendChild(tb);
    const wrap = el("div", "gym-tabla-wrap" + (filasVisibles ? " gym-tabla-vista" : ""));
    wrap.appendChild(t);
    raiz.appendChild(wrap);
    if (filasVisibles) limitaAlto(wrap, t, filasVisibles);
    return t;
};

export const btn = (texto: string, css: string | null, accion: (() => void | Promise<void>) | null): HTMLButtonElement => {
    const b = el("button", "gym-btn" + (css ? " " + css : ""), texto);
    b.type = "button";
    if (accion) b.onclick = () => { void accion(); };
    return b;
};

export const toast = (txt: string, ok = true): void => {
    const d = el("div",
        `position:fixed;bottom:26px;left:50%;transform:translateX(-50%);background:var(--background-primary);` +
        `color:var(--text-normal);border:1px solid ${ok ? CONFIG.VERDE : CONFIG.ROJO};border-radius:10px;padding:11px 20px;` +
        `z-index:10030;box-shadow:0 8px 28px rgba(0,0,0,.4);font-size:.9em;max-width:82vw;text-align:center;`, txt);
    d.className = "gym-toast";
    document.body.appendChild(d);
    window.setTimeout(() => {
        d.classList.add("gym-saliendo");
        window.setTimeout(() => d.remove(), 500);
    }, 3600);
};

export const confirmar = (titulo: string, mensaje: string, textoOk = "Aceptar", textoNo = "Cancelar",
    peligro = false): Promise<boolean> =>
    new Promise(resolve => {
        let resuelto = false;
        const terminar = (v: boolean) => {
            if (resuelto) return;
            resuelto = true;
            document.removeEventListener("keydown", onKey, true);
            overlay.remove();
            resolve(v);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") { e.stopPropagation(); terminar(false); }
        };
        const overlay = el("div",
            `position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10020;display:flex;` +
            `align-items:center;justify-content:center;padding:16px;`);
        overlay.id = "gym-confirm-activo";
        const cajaM = el("div",
            `background:var(--background-primary);border:1px solid var(--background-modifier-border);` +
            `border-radius:14px;padding:18px;width:min(480px,94vw);max-height:86vh;overflow:auto;` +
            `box-shadow:0 18px 50px rgba(0,0,0,.5);line-height:1.45;`);
        const t = el("div",
            `font-weight:700;color:${CONFIG.NARANJA};border-bottom:2px solid ${CONFIG.NARANJA};padding-bottom:6px;margin-bottom:12px;`, titulo);
        const p = el("div", "opacity:.9;white-space:pre-wrap;margin-bottom:4px;", mensaje);
        const fila = el("div", "display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;");
        const baseBtn = `box-sizing:border-box;height:44px;padding:6px 10px;border-radius:9px;border:1px solid var(--background-modifier-border);` +
            `background:var(--background-secondary);color:var(--text-normal);font-family:inherit;` +
            `font-size:.88em;font-weight:600;min-height:44px;cursor:pointer;`;

        const estiloOk = peligro
            ? `background:${CONFIG.ROJO};border-color:${CONFIG.ROJO};color:#fff;font-weight:800;`
            : `background:${CONFIG.NARANJA};border-color:${CONFIG.NARANJA};color:#101010;font-weight:800;`;
        const ok = el("button", baseBtn + estiloOk, textoOk);
        const no = el("button", baseBtn, textoNo);
        ok.type = no.type = "button";
        ok.onclick = () => terminar(true);
        no.onclick = () => terminar(false);
        overlay.onclick = e => { if (e.target === overlay) terminar(false); };
        fila.appendChild(ok); fila.appendChild(no);
        cajaM.appendChild(t); cajaM.appendChild(p); cajaM.appendChild(fila);
        overlay.appendChild(cajaM);
        document.addEventListener("keydown", onKey, true);
        document.body.appendChild(overlay);
        no.focus();
    });

export interface ModalUI {
    overlay: HTMLDivElement;
    caja: HTMLDivElement;
    cab: HTMLDivElement;
    cerrar: () => void;
}

export const modal = (titulo: string, subtitulo?: string, anidado = false): ModalUI => {
    const viejo = document.getElementById("gym-modal-activo");
    if (viejo && !anidado) viejo.remove();
    const overlay = el("div", "gym-modal");
    overlay.id = anidado ? "gym-modal-anidado" : "gym-modal-activo";
    const cajaM = el("div", "gym-modal-caja");
    overlay.appendChild(cajaM);
    const cab = el("div", "gym-tit-caja");
    cab.append(el("span", "gym-naranja", titulo));
    if (subtitulo) cab.append(" ", el("span", "gym-sub", subtitulo));
    cajaM.appendChild(cab);
    const cerrar = () => { overlay.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        if (document.getElementById("gym-confirm-activo")) return;

        const modales = [...document.body.children].filter(n => /^gym-modal/.test(n.className || ""));
        if (modales.length && modales[modales.length - 1] !== overlay) return;
        cerrar();
    };
    overlay.onclick = e => { if (e.target === overlay) cerrar(); };
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
    return { overlay, caja: cajaM, cab, cerrar };
};

export const ponerX = (m: ModalUI, titulo = "Cerrar"): HTMLButtonElement => {
    const contenido = el("div", "gym-flex1");
    while (m.cab.firstChild) contenido.appendChild(m.cab.firstChild);
    const bX = el("button", "gym-btn-g gym-cerrar-x", "✕");
    bX.type = "button";
    bX.title = titulo;
    bX.onclick = () => m.cerrar();
    m.cab.classList.add("gym-fila-cab");
    m.cab.appendChild(contenido); m.cab.appendChild(bX);
    return bX;
};

let dlN = 0;
export const pedirTexto = (
    titulo: string, inicial?: string, sugerencias?: string[], anidado = false,
): Promise<string | null> => new Promise(resolve => {
    const m = modal(titulo, undefined, anidado);
    const input = el("input");
    input.type = "text";
    input.value = inicial ?? "";
    if (sugerencias?.length) {
        const id = `gym-sug-${++dlN}`;
        const dl = createEl("datalist"); dl.id = id;
        for (const s of sugerencias) {
            const o = createEl("option"); o.value = s;
            dl.appendChild(o);
        }
        input.setAttribute("list", id);
        m.caja.appendChild(dl);
    }
    const c = el("div", "gym-fila");
    c.appendChild(input);
    m.caja.appendChild(c);
    const onKey = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        if (document.getElementById("gym-confirm-activo")) return;

        if (m.overlay.isConnected) {
            const modales = [...document.body.children].filter(n => /^gym-modal/.test(n.className || ""));
            if (modales.length && modales[modales.length - 1] !== m.overlay) return;
        }
        cerrar(null);
    };
    document.addEventListener("keydown", onKey);
    const cerrar = (v: string | null): void => {
        document.removeEventListener("keydown", onKey);
        m.cerrar();
        resolve(v);
    };
    const fila = el("div", "gym-botones");
    const ok = btn("Guardar", "primario", () => cerrar(input.value.trim()));
    const no = btn("Cancelar", null, () => cerrar(null));
    fila.appendChild(ok); fila.appendChild(no);
    m.caja.appendChild(fila);
    m.overlay.onclick = e => { if (e.target === m.overlay) cerrar(null); };
    input.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); ok.click(); } };
    input.focus();
    input.select();
});

export const selectorUnidad = (alCambiar?: (u: UnidadPeso) => void): HTMLElement => {
    const cont = el("div", "gym-selector-um");
    const pintar = () => {
        cont.empty();
        for (const u of UNIDADES_PESO) {
            const activo = pesoActual() === u;
            const b = el("button", "", u);
            b.type = "button";
            b.title = u === "kg" ? "Mostrar y teclear los pesos en kilogramos" : "Mostrar y teclear los pesos en libras";
            b.setAttribute("aria-pressed", String(activo));
            b.style.cssText =
                "box-sizing:border-box;min-width:54px;height:44px;min-height:44px;padding:6px 12px;border-radius:8px;cursor:pointer;" +
                "font-size:.88em;font-weight:800;letter-spacing:.05em;" +
                (activo
                    ? `background:${CONFIG.NARANJA};border:1px solid ${CONFIG.NARANJA};color:#111;`
                    : "background:var(--background-primary);border:1px solid var(--background-modifier-border);color:var(--text-normal);opacity:.72;");
            b.onclick = () => {
                if (!fijarUnidadPeso(u)) return;
                pintar();
                if (alCambiar) alCambiar(u);
            };
            cont.appendChild(b);
        }
    };
    pintar();
    return cont;
};

export const limpiarOverlays = (): void => {
    for (const s of [".gym-modal", ".gym-modo", "#gym-confirm-activo", ".gym-hoja-overlay", ".gym-toast"]) {
        document.querySelectorAll(s).forEach(n => n.remove());
    }
};
