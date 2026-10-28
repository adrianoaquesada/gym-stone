/* ═══════════════════════════════════════════════════════════════════════════
   Ejercicios: catálogo, selector con buscador y descanso entre series.

   El descanso vive en SEGUNDOS (igual que el campo del creador de rutinas).
   ═══════════════════════════════════════════════════════════════════════════ */

import { catalogoEjercicios, catalogoEjerciciosTodas, descansoDe, idEjercicioLibre, ultimosValores } from "../datos/calculos";
import { catalogoGestion, renombrarEjercicio, type EjercicioGestion } from "../datos/ejercicios";
import { cargarGrupos, fijarGrupo, gruposEnMemoria, purgarGruposSinUsar } from "../datos/grupos";
import type { EjercicioCatalogo, Rutina } from "../tipos";
import { pesoTexto } from "../unidades";
import { aNumero, fechaLegible, limpiarNombre, msgError, norm } from "../util";
import { confirmar, modal, pedirTexto, ponerX, toast, el } from "./componentes";

/* Traduce un nombre escrito a mano a un { id, nombre } ESTABLE.
   Si ya existe en el catálogo (aunque esté escrito con otras mayúsculas,
   tildes o espacios) se usa ESE id: si no, «Press banca» y «press banca»
   serían dos ejercicios distintos con el historial partido en dos mitades. */
export const resolverEjercicio = (
    catalogo: EjercicioCatalogo[], nombre: string,
): { id: string; nombre: string } | null => {
    const limpio = limpiarNombre(nombre);
    if (!limpio) return null;
    const q = norm(limpio);
    const existente = catalogo.find(x => norm(x.nombre) === q);
    if (existente) return { id: existente.id, nombre: existente.nombre };
    let id = idEjercicioLibre(limpio), n = 2;
    while (catalogo.some(x => x.id === id)) id = `${idEjercicioLibre(limpio)}-${n++}`;   // choque con otro nombre: se desambigua
    return { id, nombre: limpio };
};

/* ── Descanso entre series ────────────────────────────────────────────────
   Control compartido: lo usa el selector de ejercicios (al añadirlo) y el
   propio cambio de descanso dentro de la sesión. `tocar` avisa cuando el
   usuario lo toca a mano, para que quien lo monte no pise su elección. */
export interface ControlDescanso {
    raiz: HTMLDivElement;
    seg: () => number;
    aplicar: (s: number | null) => void;
}

export const controlDescanso = (
    segInicial: number | null,
    { etiqueta = "Descanso entre series (segundos)", tocar = () => { /* nada */ } }: { etiqueta?: string; tocar?: () => void } = {},
): ControlDescanso => {
    const raiz = el("div", "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px;");
    raiz.appendChild(el("div", "gym-et", etiqueta));
    const inDesc = el("input");
    inDesc.type = "number"; inDesc.min = "0"; inDesc.step = "15"; inDesc.inputMode = "numeric";
    inDesc.value = String(Math.round(Number(segInicial) || 0));
    inDesc.placeholder = "90";   // el mismo por defecto que el plan
    inDesc.style.cssText = "width:96px;min-height:44px;padding:8px 10px;border-radius:8px;" +
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
        // Vacío o 0 = «sin descanso fijado»: quien llama decide si eso es el
        // por defecto de 90 s o simplemente no guardar el campo.
        seg: () => { const s = aNumero(inDesc.value); return s != null && s > 0 ? Math.round(s) : 0; },
        // Recarga el valor sin marcarlo como «puesto a mano» (no dispara oninput).
        aplicar: s => { inDesc.value = String(Math.round(Number(s) || 0)); },
    };
};

// Texto del descanso en la interfaz: siempre en segundos, igual que el
// campo del creador de rutinas. 0 = «sin descanso fijado».
export const textoDescanso = (n: number | null | undefined): string =>
    (Number(n) > 0 ? `descanso ${Math.round(Number(n))} s` : `＋ descanso`);

// Cambiar el descanso desde el propio sitio donde se usa (cabecera de la
// sesión guiada, chip del formulario de registro). Devuelve los segundos
// elegidos o null si se cierra sin tocar nada.
export const pedirDescanso = (segActual: number | null): Promise<number | null> => new Promise(resolve => {
    const m = modal("⏳ Descanso", "segundos entre series de este ejercicio", true);   // anidado: no cierra la sesión
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

/* Selector de ejercicio con buscador: lista TODO lo que se ha usado —en ESTA
   rutina y en las demás, con la última marca de cada uno— y permite escribir uno
   nuevo. Devuelve { id, nombre, descansoSeg } —con el descanso elegido aquí, en
   segundos— o null. */
export const elegirEjercicio = (
    rutina: Rutina, { excluir = [] }: { excluir?: string[] } = {},
): Promise<EleccionEjercicio | null> => new Promise(resolve => {
    // Lo de ESTA rutina se pinta ya (es síncrono); el de TODAS las rutinas del
    // vault llega en segundo plano y repinta la lista entera (al final de esta
    // función). Así el modal no espera a leer los archivos.
    let catalogo = catalogoEjercicios(rutina).filter(x => !excluir.includes(x.id));
    const m = modal("＋ Añadir ejercicio", "elige de TODAS tus rutinas o escribe uno nuevo",
        true);   // anidado: se abre SOBRE el formulario de sesión, que se queda abierto

    let resuelto = false;
    const listo = (r: { id: string; nombre: string } | null) => {
        if (resuelto) return;
        resuelto = true;
        document.removeEventListener("keydown", onKey);
        m.cerrar();
        // Devuelve también el descanso elegido: en la rutina libre no hay plan
        // del que traerlo y aquí es donde se puede fijar.
        resolve(r && { id: r.id, nombre: r.nombre, descansoSeg: segDescanso() });
    };
    // Escape y clic en el fondo también cierran: modal() cierra por su cuenta,
    // pero como no sabe que esto es una promesa, hay que resolverla desde aquí.
    // Como en modal(): solo si SOMOS el de arriba del todo (puede haber un
    // diálogo encima, p. ej. el de asignar grupo muscular).
    const onKey = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        if (document.getElementById("gym-confirm-activo")) return;
        // Como en modal(): solo si SOMOS el de arriba del todo (puede haber un
        // diálogo encima, p. ej. el de asignar grupo muscular). Ojo: el listener
        // de modal() va el primero y puede haber cerrado ya ESTE overlay — si ya
        // no está en pantalla se resuelve igualmente, o la promesa quedaría
        // colgada aunque el diálogo se vea cerrado.
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
    inNombre.style.cssText = "width:100%;min-height:46px;padding:10px 12px;border-radius:8px;" +
        "border:1px solid var(--background-modifier-border);background:var(--background-secondary);" +
        "color:var(--text-normal);font-size:1em;box-sizing:border-box;";
    m.caja.appendChild(el("div", "gym-et", "Ejercicio"));
    m.caja.appendChild(inNombre);

    // Filtro por grupo muscular: chips con los grupos que hay en el catálogo
    // (el 🏷 de cada fila los asigna). «Todos» es el estado inicial.
    const cajaGrupos = el("div", "display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;");
    m.caja.appendChild(cajaGrupos);
    let grupoActivo = "";
    let soloSinGrupo = false;   // chip «Sin grupo»: filtra los ejercicios sin clasificar

    const lista = el("div", "max-height:250px;overflow:auto;margin-top:8px;" +
        "border:1px solid var(--background-modifier-border);border-radius:8px;");
    m.caja.appendChild(lista);

    // Recuento de lo que hay en pantalla: deja claro que la lista sale COMPLETA
    // (y cuánto se ha filtrado al teclear).
    const cuenta = el("div", "font-size:.74em;opacity:.6;margin-top:5px;");
    m.caja.appendChild(cuenta);

    // Descanso entre series: en la rutina libre no hay plan del que traerlo (y en la
    // planificada puede que el ejercicio ni esté en el día), así que se fija aquí.
    // Se recuerda por ejercicio: si cambias de fila se recarga con su último descanso.
    let descansoAMano = false;   // quien ya lo ha puesto a mano no lo pisa el cambio de fila
    const ctrlDesc = controlDescanso(90, { tocar: () => { descansoAMano = true; } });
    m.caja.appendChild(ctrlDesc.raiz);
    const segDescanso = () => ctrlDesc.seg();
    const sugiereDescanso = (id: string) => {
        if (descansoAMano) return;
        ctrlDesc.aplicar(descansoDe(rutina, id) ?? 90);   // 90 s si nunca constó
    };

    const btnUsar = el("button", "gym-btn primario gym-btn-ancho gym-mt8");
    btnUsar.type = "button";
    m.caja.appendChild(btnUsar);

    let pendiente: { id: string; nombre: string } | null = null;   // qué hace el botón en este momento
    const pintar = () => {
        const q = norm(inNombre.value);
        const grupos = gruposEnMemoria();
        const grupoDe = (id: string) => grupos[id] ?? "";

        // Chips: los grupos que hay AHORA en el catálogo (al abrir llegan los
        // del fichero en segundo plano y los chips salen solos). «Sin grupo»
        // avisa de los que aún no estás clasificados y deja filtrarlos.
        const enUso = [...new Set(catalogo.map(x => grupoDe(x.id)).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, "es"));
        const sinGrupo = catalogo.filter(x => !grupoDe(x.id)).length;
        if (grupoActivo && !enUso.includes(grupoActivo)) grupoActivo = "";   // el grupo dejó de existir
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

        // Lista COMPLETA: se filtra lo que no encaje, pero NUNCA se corta.
        // La búsqueda alcanza también el grupo muscular: «hombros» saca los
        // ejercicios de hombros aunque no lo lleven en el nombre.
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
            // Última marca en ESTA rutina; si el ejercicio solo existe en otra, se
            // dice de qué rutina viene en vez de prometer «sin registros todavía».
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
            // 🏷: clasificar el ejercicio por grupo muscular (para filtrar y buscar)
            const btnG = el("button", "gym-chip gym-chip-btn", g || "🏷");
            btnG.type = "button";
            btnG.title = g
                ? `Grupo muscular: ${g} — clic para cambiar o quitar`
                : "Asignar grupo muscular (para filtrar y buscar por él)";
            btnG.onclick = async e => {
                e.stopPropagation();   // NO elegir el ejercicio al clasificarlo
                const sugeridos = [...new Set(Object.values(gruposEnMemoria()))]
                    .sort((a, b) => a.localeCompare(b, "es"));
                const r = await pedirTexto(`🏷 Grupo muscular · ${x.nombre}`, g, sugeridos, true);
                if (r === null) return;   // cancelado
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
            : resolverEjercicio(catalogo, texto);   // o cae en uno existente, o crea el nuevo
        if (pendiente) sugiereDescanso(pendiente.id);   // recarga su último descanso (si no lo tocaste a mano)
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

    // En segundo plano llega el catálogo de TODAS las rutinas del vault: al llegar
    // se repinta la lista entera (sigue sin cortes) para que el buscador encuentre
    // también los ejercicios que solo has hecho en otras rutinas. Si falla la
    // lectura, se queda lo local: el selector sigue funcionando igual que antes.
    void (async () => {
        let total: EjercicioCatalogo[] | null = null;
        try { total = await catalogoEjerciciosTodas(rutina); }
        catch { total = null; }
        if (resuelto || !Array.isArray(total)) return;   // el modal ya se cerró
        catalogo = total.filter(x => !excluir.includes(x.id));
        pintar();   // respeta lo tecleado: recalcula filtros, botón y recuento
    })();

    // Y en segundo plano llegan los grupos musculares asignados: al llegar
    // repintan chips y filas. Si el fichero falla, se queda sin clasificar
    // (igual que antes: el buscador funciona igual que siempre).
    cargarGrupos()
        .then(() => { if (!resuelto) pintar(); })
        .catch(() => { /* sin grupos: se sigue sin clasificar */ });
});

/* ═══════════════════════════════════════════════════════════════════════════
   Gestor del catálogo global: renombrar ejercicios y fijar su grupo muscular
   para el buscador. Una fila = un ejercicio CONCRETO (id estable) con su
   nombre y su grupo; guardar renombra en todas las rutinas y plantillas donde
   aparezca.

   Se pinta dentro de un contenedor que decide quien llama: en Inicio ocupa la
   sección «🗂 Ejercicios» a pantalla completa (ya no hay popup de catálogo).
   ═══════════════════════════════════════════════════════════════════════════ */
let dlGestionN = 0;

export const pintarGestionEjercicios = (cont: HTMLElement): void => {
    cont.appendChild(el("div", "opacity:.75;font-size:.82em;",
        "Renombrar cambia solo el texto mostrado: el id del ejercicio es estable, " +
        "así que el historial, las series guardadas y las gráficas se conservan."));

    const inBusca = el("input", "gym-ejercicios-busca");
    inBusca.type = "text";
    inBusca.placeholder = "Busca por nombre o grupo";
    cont.appendChild(inBusca);

    // Un solo datalist compartido por todos los inputs de grupo (sugerencias),
    // con id único por instancia
    const dl = createEl("datalist");
    dl.id = `gym-grupos-dl-${++dlGestionN}`;
    cont.appendChild(dl);

    const lista = el("div", "gym-ejercicios-lista");
    cont.appendChild(lista);
    const cuenta = el("div", "font-size:.74em;opacity:.6;margin-top:5px;");
    cont.appendChild(cuenta);

    let cat: EjercicioGestion[] = [];
    let cargando = true;
    let huerfanos: string[] = [];   // ids del fichero de grupos que ya no se usan

    // Purga de entradas huérfanas: solo aparece si el fichero de grupos guarda
    // ejercicios que ya no están en ninguna rutina ni plantilla (p. ej. tras
    // borrar una rutina entera). Nunca toca rutinas ni plantillas.
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
        try { cat = await catalogoGestion(); } catch { /* se queda lo leído */ }
        pintar();
    };
    cont.appendChild(btnPurga);

    const estInput = "flex:1 1 170px;min-width:0;min-height:38px;padding:7px 10px;border-radius:8px;" +
        "border:1px solid var(--background-modifier-border);background:var(--background-secondary);" +
        "color:var(--text-normal);font-size:.92em;box-sizing:border-box;";

    const pintar = () => {
        // Sugerencias del datalist: los grupos ya usados (memoria + catálogo)
        const sugeridos = new Set<string>(Object.values(gruposEnMemoria()));
        for (const e of cat) if (e.grupo) sugeridos.add(e.grupo);
        dl.empty();
        for (const g of [...sugeridos].sort((a, b) => a.localeCompare(b, "es"))) {
            const o = createEl("option"); o.value = g;
            dl.appendChild(o);
        }

        // Huérfanos del fichero: ids clasificados que ya no aparecen en NINGUNA
        // rutina ni plantilla (el catálogo del vault acaba de escanearlas todas)
        const usados = new Set(cat.map(x => x.id));
        huerfanos = Object.keys(gruposEnMemoria()).filter(id => !usados.has(id)).sort();
        btnPurga.hidden = cargando || !huerfanos.length;
        btnPurga.textContent = `🧹 Purgar ${huerfanos.length} entrada${huerfanos.length > 1 ? "s" : ""} sin uso` +
            " (ejercicios que ya no están en ninguna rutina)";

        const q = norm(inBusca.value);
        // La búsqueda alcanza también el grupo, igual que en el buscador de sesión
        const visibles = cat.filter(x => !q || norm(x.nombre).includes(q) || norm(x.grupo).includes(q));

        lista.empty();
        if (cargando) {
            lista.appendChild(el("div", "padding:12px;opacity:.65;font-size:.86em;",
                "Leyendo todas las rutinas y plantillas…"));
        } else if (!visibles.length) {
            lista.appendChild(el("div", "padding:12px;opacity:.65;font-size:.86em;",
                cat.length ? "Ningún ejercicio encaja con la búsqueda."
                           : "Sin ejercicios todavía en ninguna rutina."));
        }
        for (const e of visibles) {
            const fila = el("div", "padding:8px 10px;border-bottom:1px solid var(--background-modifier-border);");
            const controles = el("div", "display:flex;flex-wrap:wrap;gap:8px;align-items:center;");

            const inN = el("input");
            inN.type = "text"; inN.value = e.nombre;
            inN.style.cssText = estInput;
            const inG = el("input");
            inG.type = "text"; inG.value = e.grupo; inG.placeholder = "Grupo (por ejemplo: Pecho)";
            inG.setAttribute("list", dl.id);
            inG.style.cssText = "flex:0 1 130px;" + estInput;

            const guardar = el("button", "gym-btn gym-btn-guardar-ej", "💾");
            guardar.type = "button";
            guardar.title = "Guardar nombre y grupo de este ejercicio";
            const marcar = () => guardar.classList.add("primario");   // hay cambios pendientes
            inN.oninput = marcar;
            // Aviso «sin grupo»: visible mientras el campo esté vacío (se oculta
            // al escribir, sin esperar a guardar)
            const chipSin = el("span", "gym-chip", "sin grupo");
            chipSin.style.cssText = "font-size:.7em;font-weight:700;opacity:.5;flex:none;" +
                (e.grupo ? "display:none;" : "");
            inG.oninput = () => { marcar(); chipSin.hidden = !!inG.value.trim(); };

            guardar.onclick = async () => {
                const nuevoNombre = limpiarNombre(inN.value);
                if (!nuevoNombre) return toast("⚠️ El nombre no puede quedar vacío.", false);
                const cambioNombre = nuevoNombre !== e.nombre;
                const nuevoGrupo = inG.value.trim();
                const cambioGrupo = nuevoGrupo !== e.grupo;
                if (!cambioNombre && !cambioGrupo) return;
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
                    await fijarGrupo(e.id, nuevoGrupo);   // vacío = sin grupo
                    toast(cambioNombre
                        ? `✅ «${nuevoNombre}» actualizado: ${res?.rutinas ?? 0} rutina(s)` +
                          (res?.plantillas ? `, ${res.plantillas} plantilla(s)` : "")
                        : nuevoGrupo ? `🏷 «${nuevoNombre}»: grupo «${nuevoGrupo}»`
                                     : `🏷 «${nuevoNombre}»: sin grupo`);
                    cat = await catalogoGestion();   // refrescar nombres, grupos y orden
                    pintar();
                } catch (err: unknown) {
                    guardar.disabled = false;
                    console.error("[Gym Stone renombrar]", err);
                    toast("⚠️ No pude guardar: " + msgError(err), false);
                }
            };

            controles.appendChild(inN); controles.appendChild(inG);
            controles.appendChild(chipSin); controles.appendChild(guardar);
            fila.appendChild(controles);
            const sitio = [
                e.rutinas.length ? `en ${e.rutinas.length} rutina${e.rutinas.length > 1 ? "s" : ""}` : "",
                e.plantillas.length ? `${e.plantillas.length} plantilla${e.plantillas.length > 1 ? "s" : ""}` : "",
                `${e.apariciones} aparicion${e.apariciones === 1 ? "" : "es"}`,
            ].filter(Boolean).join(" · ");
            fila.appendChild(el("div", "font-size:.72em;opacity:.6;margin-top:3px;", sitio));
            lista.appendChild(fila);
        }
        const nSinGrupo = cat.filter(x => !x.grupo).length;
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
