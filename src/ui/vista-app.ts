/* ═══════════════════════════════════════════════════════════════════════════
   La pestaña del plugin: UNA sola vista para las dos pantallas.

   Inicio y el dashboard de una rutina son dos pantallas de ESTA misma vista
   (estado { pantalla }), no dos tipos de vista distintos: al navegar,
   Obsidian reutiliza la instancia y solo llama a setState → se repinta en el
   mismo sitio, sin destruir ni remontar la pestaña. Ese recreado era el que
   producía el salto visual al entrar en una rutina desde Inicio (paneles,
   cabecera y barra de acciones se volvían a montar, con un frame en blanco
   de medio leer).

   Reglas que de aquí salen:
     · se PINTA en un contenedor temporal y el cambio se hace de una sola
       tacada: mientras se leen los datos sigue visible lo anterior (nunca
       pantalla en blanco) y, si el contenido cambia de pantalla, el scroll
       empieza arriba;
     · la navegación NO toca archivos: los .md son solo consulta y guardado
       (leerRutina/escribirRutina…), nunca un medio de moverse por la
       interfaz. Abrir una nota desde el explorador sigue convirtiéndose en
       esta vista, pero ya dentro de ella la navegación es memoria pura.

   VistaLista y VistaRutina son sólo los tipos antiguos (una pestaña
   restaurada de una versión previa): heredan de aquí para que esas pestañas
   hereden también el pintado suave; al navegar, pasan a VISTA_APP.
   ═══════════════════════════════════════════════════════════════════════════ */

import { ItemView, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { aplicacion } from "../estado";
import { rutaIndice } from "../ajustes";
import { leerRutina, rutaDatosDe } from "../datos";
import type { Rutina } from "../tipos";
import { el } from "./componentes";
import { pintarDashboard } from "./gestor";
import { PantallaInicio, esRutaDeInicio } from "./pantalla-inicio";
import { VISTA_APP, VISTA_LISTA, VISTA_RUTINA, abrirLista } from "./vistas";

/* La pestaña está viendo Inicio o la ficha de una rutina */
type Pantalla = "lista" | "rutina";

interface EstadoApp {
    [k: string]: unknown;
    pantalla?: Pantalla;
    rutinaId?: string | null;
}

export class VistaApp extends ItemView {
    /* Pantalla que muestra el tipo de vista si el estado no trae `pantalla`
       (las pestañas antiguas solo guardaban el rutinaId) */
    protected pantallaPorDefecto: Pantalla = "lista";

    private pantalla: Pantalla = "lista";
    private rutinaId: string | null = null;
    private nombre = "";
    private pintadaEn: Pantalla | null = null;   // la pantalla que hay MONTADA ahora
    private pintando = 0;                        // nº de pintado: el que llega tarde se descarta
    private readonly inicio: PantallaInicio;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.inicio = new PantallaInicio(() => void this.pintar());
    }

    getViewType(): string { return VISTA_APP; }
    getDisplayText(): string {
        if (this.pantalla === "rutina") return this.nombre || (this.rutinaId ? `Gym stone · ${this.rutinaId}` : "Gym stone");
        return "Gym stone";
    }
    getIcon(): string { return "dumbbell"; }

    /* El estado viaja en la pestaña: al reabrir Obsidian se restaura */
    getState(): EstadoApp { return { pantalla: this.pantalla, rutinaId: this.rutinaId }; }

    async setState(state: EstadoApp, result: ViewStateResult): Promise<void> {
        await super.setState(state, result);
        const p = state?.pantalla;
        this.pantalla = p === "lista" || p === "rutina" ? p : this.pantallaPorDefecto;
        this.rutinaId = state?.rutinaId ?? null;
        // Al llegar a Inicio (desde el plugin, desde una rutina o al restaurar
        // la pestaña) se vuelve a la sección de por defecto: «📋 Rutinas».
        // Los cambios de vault no pasan por aquí, así que repintar no pierde
        // la sección en la que estabas.
        if (this.pantalla === "lista") this.inicio.seccion = "rutinas";
        await this.pintar();
    }

    async onOpen(): Promise<void> {
        // Si la pestaña llega con el estado aún no aplicado (orden de Obsidian
        // al abrirla), se coge el id de la hoja, como hacía la vista de rutina.
        const st = this.leaf.getViewState()?.state;
        if (!this.rutinaId && typeof st?.rutinaId === "string") this.rutinaId = st.rutinaId;

        // Se repinta sola cuando cambia algo relevante en el vault: el índice
        // y las medidas (Inicio) o el archivo de LA rutina abierta (dashboard).
        this.registerEvent(aplicacion().vault.on("modify", f => this.trasCambio(f.path)));
        this.registerEvent(aplicacion().vault.on("create", f => this.trasCambio(f.path)));
        this.registerEvent(aplicacion().vault.on("delete", f => this.trasCambio(f.path)));
        await this.pintar();
    }

    private trasCambio(ruta: string): void {
        const toca = this.pantalla === "rutina"
            ? Boolean(this.rutinaId) && ruta === rutaDatosDe(this.rutinaId!)
            : esRutaDeInicio(ruta);
        if (toca) void this.pintar();
    }

    private accionesHechas = false;

    private acciones(): void {
        if (this.accionesHechas) return;
        this.accionesHechas = true;
        // Solo recargar: los accesos de siempre viven en la fila de navegación
        // (secciones, nueva rutina, sesión guiada…) y «alternar pesos» y
        // «abrir como markdown» en el menú ⋮ (main.ts).
        this.addAction("refresh-cw", "Recargar", () => void this.pintar());
    }

    /* Nota cruda de la pantalla visible (para «abrir como markdown» del menú ⋮) */
    rutaMarkdown(): string | null {
        return this.pantalla === "rutina"
            ? (this.rutinaId ? rutaDatosDe(this.rutinaId) : null)
            : rutaIndice();   // Inicio se guarda en su índice
    }

    /* ── El pintado: se construye FUERA y se monta de una sola tacada ──
       Mientras se leen los datos, la pestaña sigue mostrando lo anterior (sin
       frame en blanco); el scroll solo se conserva si sigue viéndose la misma
       pantalla, para que al entrar en una rutina no se herede la posición de
       la lista. `generacion` descarta el pintado que llegue tarde: si mientras
       se leían los datos ya se navegó (o cambió algo más), manda el último. */
    async pintar(): Promise<void> {
        const raiz = this.contentEl;
        raiz.addClass("gym-vista");
        this.acciones();

        const generacion = ++this.pintando;
        const pantalla = this.pantalla;
        const despl = raiz.scrollTop;
        // El carrusel de navegación se reconstruye en cada pintado: sin esto,
        // su scroll horizontal volvería a la izquierda y los botones saltarían
        // lateralmente tras cualquier repintado.
        const desplNav = raiz.querySelector<HTMLElement>(".gym-nav")?.scrollLeft ?? 0;
        const cont = el("div");   // temporal: sus hijos se mueven abajo
        let nombre = "";

        if (pantalla === "rutina") {
            if (!this.rutinaId) { void abrirLista(); return; }
            const r = await leerRutina(this.rutinaId);
            if (r.error) {
                cont.createDiv({ cls: "gym-error-vista", text: "⚠️ " + r.error });
            } else {
                nombre = r.datos?.nombre || "";
                // La navegación interna del dashboard repinta la pestaña entera
                await pintarDashboard(cont, this.rutinaId, {
                    rutina: r.datos as Rutina,
                    alRepintar: () => void this.pintar(),
                });
            }
        } else {
            await this.inicio.pintar(cont);
        }

        if (generacion !== this.pintando) return;   // ya hay un pintado más nuevo
        this.nombre = nombre;

        // Mientras tanto no se ha tocado lo que se veía: ahora el cambio
        const mismaPantalla = this.pintadaEn === pantalla;
        raiz.empty();
        while (cont.firstChild) raiz.appendChild(cont.firstChild);
        if (mismaPantalla) {
            raiz.scrollTop = despl;
            const nav = raiz.querySelector<HTMLElement>(".gym-nav");
            if (nav) nav.scrollLeft = desplNav;   // el carrusel se queda donde estaba
        } else {
            raiz.scrollTop = 0;   // al cambiar de pantalla, se empieza arriba
        }
        this.pintadaEn = pantalla;
        this.actualizarTitulo();
    }

    /* El rótulo de la pestaña sigue el nombre de la rutina (o vuelve a «Gym stone») */
    private actualizarTitulo(): void {
        // updateHeader() existe en runtime pero la librería de tipos no lo
        // declara: mismo enganche con cast que «leaf-menu» en main.ts.
        const hoja = this.leaf as WorkspaceLeaf & { updateHeader?: () => void };
        hoja.updateHeader?.();
    }
}

/* ── Tipos antiguos, solo para pestañas guardadas de versiones previas ──
   Ambos pintan igual que VISTA_APP (heredan), pero su `getViewType` propio
   hace que Obsidian no cree la vista de nuevo al restaurarlas. */

export class VistaLista extends VistaApp {
    constructor(leaf: WorkspaceLeaf) { super(leaf); this.pantallaPorDefecto = "lista"; }
    getViewType(): string { return VISTA_LISTA; }
}

export class VistaRutina extends VistaApp {
    constructor(leaf: WorkspaceLeaf) { super(leaf); this.pantallaPorDefecto = "rutina"; }
    getViewType(): string { return VISTA_RUTINA; }
}
