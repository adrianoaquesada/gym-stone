import { CONFIG, DIA_MS } from "../config";
import { dos } from "../util/fechas";
import { decimal } from "../util/texto";
import { el } from "./componentes";

export interface PuntoGrafica {
    ts: number;
    v: number;
    titulo?: string;
}

export interface SerieGrafica {
    nombre: string;
    color: string;
    puntos: PuntoGrafica[];
}

const NS_SVG = "http://www.w3.org/2000/svg";
const svgEl = (tag: string, attrs: Record<string, string>): SVGElement => {
    const n = document.createElementNS(NS_SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
};

export const grafica = (
    raiz: HTMLElement,
    series: SerieGrafica[],
    { alto = 200, fmt = (v: number) => decimal(v, 0) }: { alto?: number; fmt?: (v: number) => string } = {},
): void => {
    const pts = series.flatMap(s => s.puntos);
    if (!pts.length) { raiz.appendChild(el("div")); return; }

    const envoltorio = el("div", "gym-graf-env");

    const W = 760, H = alto, mg = { t: 14, r: 18, b: 26, l: 48 };
    const iw = W - mg.l - mg.r, ih = H - mg.t - mg.b;
    const tMin = Math.min(...pts.map(p => p.ts)), tMax = Math.max(...pts.map(p => p.ts));

    const hayVentanaCorta = tMax - tMin < DIA_MS;
    const t0 = hayVentanaCorta ? (tMin + tMax) / 2 - DIA_MS : tMin;
    const t1 = hayVentanaCorta ? (tMin + tMax) / 2 + DIA_MS : tMax;
    const spanT = t1 - t0;
    let vMin = Math.min(...pts.map(p => p.v)), vMax = Math.max(...pts.map(p => p.v));
    if (vMax - vMin < 1e-6) { vMax += 1; vMin -= 1; }
    const pad = (vMax - vMin) * 0.12;
    vMin -= pad; vMax += pad;

    const x = (t: number) => mg.l + (t - t0) / spanT * iw;
    const y = (v: number) => mg.t + (vMax - v) / (vMax - vMin) * ih;

    const svg = document.createElementNS(NS_SVG, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("class", "gym-graf-svg");

    const paso = (vMax - vMin) / 4;
    for (let i = 0; i <= 4; i++) {
        const v = vMin + paso * i, py = y(v);
        svg.appendChild(svgEl("line", {
            x1: String(mg.l), y1: py.toFixed(1), x2: String(W - mg.r), y2: py.toFixed(1),
            stroke: CONFIG.BORDE, opacity: ".6",
        }));
        const texto = svgEl("text", {
            x: String(mg.l - 7), y: (py + 3.5).toFixed(1), "text-anchor": "end",
            "font-size": "10", fill: "currentColor", opacity: ".6",
        });
        texto.textContent = fmt(v);
        svg.appendChild(texto);
    }

    const nTicks = 4;
    let etiquetaPrev = "";
    for (let i = 0; i <= nTicks; i++) {
        const t = t0 + spanT * i / nTicks;
        const d = new Date(t);
        const txt = spanT > 200 * DIA_MS ? `${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}` : `${d.getDate()}/${d.getMonth() + 1}`;
        if (txt === etiquetaPrev) continue;
        etiquetaPrev = txt;
        const etiqueta = svgEl("text", {
            x: x(t).toFixed(1), y: String(H - 8), "text-anchor": "middle",
            "font-size": "10", fill: "currentColor", opacity: ".6",
        });
        etiqueta.textContent = txt;
        svg.appendChild(etiqueta);
    }

    for (const s of series) {
        const ordenados = [...s.puntos].sort((a, b) => a.ts - b.ts);
        if (ordenados.length > 1) {
            svg.appendChild(svgEl("polyline", {
                points: ordenados.map(p => `${x(p.ts).toFixed(1)},${y(p.v).toFixed(1)}`).join(" "),
                fill: "none", stroke: s.color, "stroke-width": "2.2",
                "stroke-linejoin": "round", "stroke-linecap": "round",
            }));
        }
        for (const p of ordenados) {
            svg.appendChild(svgEl("circle", {
                cx: x(p.ts).toFixed(1), cy: y(p.v).toFixed(1), r: "3.2",
                fill: s.color, stroke: "var(--background-primary)", "stroke-width": "1.2",
            }));
        }
    }

    const tip = el("div", "gym-graf-tip");
    envoltorio.appendChild(svg);
    envoltorio.appendChild(tip);
    raiz.appendChild(envoltorio);

    svg.addEventListener("pointermove", e => {
        const r = svg.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width * W, py = (e.clientY - r.top) / r.height * H;
        let mejor: { p: PuntoGrafica; s: SerieGrafica } | null = null, dMejor = 16;
        for (const s of series) {
            for (const p of s.puntos) {
                const d = Math.hypot(x(p.ts) - px, y(p.v) - py);
                if (d < dMejor) { dMejor = d; mejor = { p, s }; }
            }
        }
        if (mejor) {
            const d = new Date(mejor.p.ts);
            tip.empty();
            const nom = el("b", null, mejor.s.nombre);
            nom.style.color = mejor.s.color;
            tip.append(nom, el("br"));
            tip.append(`${dos(d.getDate())}/${dos(d.getMonth() + 1)} — ${mejor.p.titulo ?? fmt(mejor.p.v)}`);
            const rc = envoltorio.getBoundingClientRect();
            tip.style.left = `${Math.min(Math.max(0, e.clientX - rc.left + 12), Math.max(0, rc.width - 190))}px`;
            tip.style.top = `${Math.max(0, e.clientY - rc.top - 12)}px`;
            tip.classList.add("on");
        } else tip.classList.remove("on");
    });
    svg.addEventListener("pointerleave", () => { tip.classList.remove("on"); });

    const ley = el("div", "gym-graf-ley");
    for (const s of series) {
        const it = el("span");
        const cuadro = el("span", "gym-graf-cuadro");
        cuadro.style.background = s.color;
        it.append(cuadro, s.nombre);
        ley.appendChild(it);
    }
    raiz.appendChild(ley);
};
