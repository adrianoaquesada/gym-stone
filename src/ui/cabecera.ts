import { el } from "./componentes";

export interface Miga { texto: string; ir?: () => void; }

export interface OpcionesCabecera {
    subtitulo?: string;
}

export const pintarCabecera = (
    cont: HTMLElement,
    migas: Miga[],
    { subtitulo = "" }: OpcionesCabecera = {},
): HTMLElement => {
    const cab = el("div", "gym-cab");

    migas.forEach((m, i) => {
        if (i > 0) cab.appendChild(el("span", "gym-miga-sep", "›"));
        const ultima = i === migas.length - 1;
        if (!ultima && m.ir) {
            const b = el("button", "gym-miga", m.texto);
            b.type = "button";
            b.title = `Ir a ${m.texto}`;
            b.onclick = m.ir;
            cab.appendChild(b);
        } else {
            cab.appendChild(el("span", "t", m.texto));
        }
    });

    if (subtitulo) cab.appendChild(el("span", "s", subtitulo));
    cont.appendChild(cab);
    return cab;
};

export interface BotonNav {
    texto: string;
    alPulsar: () => void;
    principal?: boolean;
    activo?: boolean;
    derecha?: boolean;
}

export const pintarNavegacion = (cont: HTMLElement, botones: BotonNav[]): HTMLElement => {
    const nav = el("div", "gym-nav");
    let espacio = false;
    for (const b of botones) {

        if (b.derecha && !espacio) { nav.appendChild(el("div", "gym-nav-espacio")); espacio = true; }
        const x = el("button", "gym-nav-btn" + (b.principal ? " primario" : "") + (b.activo ? " activo" : ""), b.texto);
        x.type = "button";
        x.onclick = b.alPulsar;
        nav.appendChild(x);
    }
    cont.appendChild(nav);
    return nav;
};

export const pintarTituloSeccion = (
    cont: HTMLElement, titulo: string, subtitulo = "",
): HTMLElement => {
    const t = el("div", "gym-tit-caja");
    t.append(el("span", "gym-naranja", titulo), " ", el("span", "gym-sub", subtitulo));
    cont.appendChild(t);
    return t;
};
