/* ═══════════════════════════════════════════════════════════════════════════
   Creador de rutinas — formulario de creación y de edición.

   Se dibuja en la pestaña del formulario (ui/vista-form.ts); al guardar, esa
   misma pestaña pasa al dashboard de la rutina (no se abren pestañas nuevas).

     1 · archivo de datos (siempre primero: los datos nunca se pierden)
     2 · plantilla opcional (solo estructura, sin fechas ni registros)
     3 · esta misma pestaña pasa al dashboard de la rutina
   No hay notas-dashboard ni frontmatter: el plugin es el dueño de los archivos.
   ═══════════════════════════════════════════════════════════════════════════ */

import { CONFIG, DIAS, DIAS_LARGO } from "../config";
import { carpetaPlantillas, rutaIndice } from "../ajustes";
import {
    escribirRutina, ejercicioVacio, finDesde,
    listarPlantillas, leerPlantilla, plantillaDeRutina, plantillaExiste,
    rutaDatosDe, rutinaVacia, escribirPlantilla,
} from "../datos";
import { aNumero, clonarJSON, esFechaValida, hoy, limpiarNombre, msgError, slug, tsDe } from "../util";
import { pesoActual, pesoACampo, pesoAKg } from "../unidades";
import type { DiaRutina, EjercicioDef, EstadoRutina, Rutina } from "../tipos";
import { confirmar, el, selectorUnidad, toast } from "./componentes";
import { abrirRutina } from "./vistas";

/* ══════════════════ Estado (sobrevive a los re-renders de la nota) ══════════════════ */

interface EstadoForm {
    modo: "crear" | "editar";
    id: string;
    nombre: string;
    objetivo: string;
    tipo: string;
    inicio: string;
    semanas: number;
    dias: DiaRutina[];
    plantilla: string;
    comoPlantilla: boolean;
    nombrePlantilla: string;
    plantillaEditada: boolean;   // el usuario ha tecleado un nombre de plantilla distinto a mano
    estadoRutina: EstadoRutina;  // al editar: activa | pausada | finalizada
    guardado: boolean;
    guardandoPlantilla: boolean;
}

const almacen: Record<string, EstadoForm> = {};

/* ══════════════════ El formulario ══════════════════ */

interface OpcionesMontar {
    cont: HTMLElement;    // contenido de la pestaña o del cuerpo de la hoja
    inicial: Rutina | null;
    esEdicion: boolean;
    onGuardado?: (rutina: Rutina) => void;
    enHoja?: boolean;     // true: la hoja superpuesta ya lleva su propia cabecera
}

export const montar = async ({ cont, inicial, esEdicion, onGuardado, enHoja = false }: OpcionesMontar): Promise<void> => {
    cont.empty();
    const claveEstado = esEdicion ? `edit:${inicial?.id ?? ""}` : "crear";
    let estado = almacen[claveEstado];

    // ── Estado inicial ──
    if (!estado) {
        const base: Rutina = inicial ? clonarJSON(inicial) : rutinaVacia();
        if (!base.inicio) base.inicio = hoy();
        if (!base.semanas) base.semanas = CONFIG.SEMANAS_POR_DEFECTO;
        if (!base.fin) base.fin = finDesde(base.inicio, base.semanas);
        estado = almacen[claveEstado] = {
            modo: esEdicion ? "editar" : "crear",
            id: inicial?.id ?? "",
            nombre: base.nombre ?? "",
            objetivo: base.objetivo ?? "",
            tipo: base.tipo === "libre" ? "libre" : "planificada",
            inicio: base.inicio,
            semanas: base.semanas,
            dias: (base.dias ?? []).length ? base.dias : [nuevoDia("A")],
            plantilla: "",
            comoPlantilla: false,
            nombrePlantilla: base.nombre ?? "",
            plantillaEditada: false,
            estadoRutina: base.estado === "pausada" || base.estado === "finalizada" ? base.estado : "activa",
            guardado: false,
            guardandoPlantilla: false,
        };
    }

    // ══════════════════ Montaje del panel ══════════════════
    // Sin marco: el formulario va suelto en la pestaña (igual que el dashboard)
    const raiz = el("div", "margin:12px 0;line-height:1.45;");
    raiz.className = "gym-form";
    cont.appendChild(raiz);

    {   // cabecera (la hoja superpuesta ya trae la suya)
        if (!enHoja) {
            const titulo = el("div", "font-weight:700;border-bottom:2px solid " + CONFIG.NARANJA + ";padding-bottom:6px;margin-bottom:14px;");
            titulo.append(
                el("span", "gym-naranja", estado.modo === "editar" ? "✏️ Editar rutina" : "🏋️ Crear rutina"),
                " ",
                el("span", "gym-subtitulo", estado.modo === "editar"
                    ? "las sesiones registradas se conservan"
                    : "al guardar, esta pestaña pasa al dashboard de la rutina"),
            );
            raiz.appendChild(titulo);
        }
    }

    const aviso = el("div", "gym-aviso gym-oculto");
    raiz.appendChild(aviso);
    const error = (txt: string) => { aviso.textContent = "⚠️ " + txt; aviso.classList.remove("gym-oculto"); raiz.scrollIntoView({ block: "nearest" }); };
    const limpiarError = () => { aviso.classList.add("gym-oculto"); };

    const campo = (etiqueta: string, control: HTMLElement, ayuda?: string): HTMLDivElement => {
        const f = el("div", "gym-campo");
        f.appendChild(el("div", "gym-etiqueta", etiqueta));
        f.appendChild(control);
        if (ayuda) f.appendChild(el("div", "gym-ayuda", ayuda));
        raiz.appendChild(f);
        return f;
    };

    // ── Tipo de rutina: decide qué más se le pide ──
    //   planificada → la clásica: días de la semana con ejercicios y objetivos
    //   libre       → sin nada fijo: cada día anotas lo que haces de verdad
    // Los tres bloques de abajo se ocultan en la libre (no hay estructura que
    // rellenar ni plantilla que guardar); se declaran aquí para poder tocarlos.
    let campoOrigen: HTMLDivElement | null = null, campoEstructura: HTMLDivElement | null = null;
    let campoPlantilla: HTMLDivElement | null = null, refPintaPlantilla: (() => void) | null = null;
    const aplicaTipo = () => {
        const libre = estado.tipo === "libre";
        if (libre) estado.comoPlantilla = false;   // una rutina libre no tiene estructura que plantillear
        if (campoOrigen) campoOrigen.style.display = libre ? "none" : "";
        if (campoEstructura) campoEstructura.style.display = libre ? "none" : "";
        if (campoPlantilla) campoPlantilla.style.display = libre ? "none" : "";
        if (refPintaPlantilla) refPintaPlantilla();
    };
    const filaTipo = el("div", "gym-dias-semana");
    const pintarTipo = () => {
        filaTipo.empty();
        const ayudaTipo: Record<string, string> = {
            planificada: "Días de la semana con sus ejercicios y objetivos: el plan te dice qué hacer cada día.",
            libre: "Sin días ni ejercicios fijos: cada día anotas lo que has hecho de verdad (ejercicio, peso y reps).",
        };
        for (const t of CONFIG.TIPOS_RUTINA) {
            const activo = estado.tipo === t;
            const b = el("button", "gym-chip" + (activo ? " on" : ""), t === "libre" ? "🗒 Libre" : "📅 Planificada");
            b.type = "button";
            b.setAttribute("aria-pressed", String(activo));
            if (estado.modo === "editar") {
                // El tipo no se puede cambiar al editar: cambiarlo reescribiría
                // la estructura de la rutina (días y ejercicios) y sus sesiones
                b.disabled = true;
                b.title = "El tipo de rutina no se puede cambiar al editar.";
            } else {
                b.title = ayudaTipo[t] ?? t;
                b.onclick = () => {
                    if (estado.tipo === t) return;
                    estado.tipo = t;
                    pintarTipo(); limpiarError();
                };
            }
            filaTipo.appendChild(b);
        }
        aplicaTipo();
    };
    campo("Tipo de rutina", filaTipo, esEdicion
        ? "No se puede cambiar al editar: el tipo fija la estructura de la rutina (días, ejercicios y sesiones)."
        : "Planificada = días de la semana con ejercicios fijos. Libre = sin plan: cada día anotas lo que haces.");
    pintarTipo();

    // ── Origen: plantilla o en blanco ──
    const selPlantilla = el("select");
    const plantillas = listarPlantillas();
    const opBlanco = createEl("option");
    opBlanco.value = "";
    opBlanco.textContent = "En blanco";
    selPlantilla.appendChild(opBlanco);
    for (const p of plantillas) {
        const o = createEl("option");
        o.value = p; o.textContent = p;
        selPlantilla.appendChild(o);
    }
    selPlantilla.value = estado.plantilla ?? "";
    if (estado.modo === "editar") selPlantilla.disabled = true;
    selPlantilla.onchange = () => {
        estado.plantilla = selPlantilla.value;
        if (estado.plantilla) void aplicarPlantilla(estado.plantilla);
        limpiarError();
    };
    campoOrigen = campo("Origen", selPlantilla, plantillas.length
        ? "Partir de una plantilla precarga días y ejercicios; puedes editarlos todo antes de guardar."
        : "Todavía no hay plantillas: se crean desde una rutina existente con el botón «Guardar como plantilla».");

    const aplicarPlantilla = async (nombre: string): Promise<void> => {
        const r = await leerPlantilla(nombre);
        if (r.error) { error(r.error); return; }
        if (estado.dias.length && !(await confirmar("📋 Plantilla",
            `¿Reemplazar la estructura actual por la plantilla «${nombre}»?`,
            "Reemplazar", "Cancelar"))) {
            selPlantilla.value = estado.plantilla = "";
            return;
        }
        const p = r.datos!;
        // Una plantilla ES una estructura: al cargarla la rutina pasa a planificada
        // (si estaba en libre, el usuario está pidiendo cambiar de modelo).
        estado.tipo = "planificada";
        estado.nombre = estado.nombre || p.nombre || "";
        estado.objetivo = p.objetivo || estado.objetivo;
        estado.semanas = p.semanas || estado.semanas;
        estado.dias = (p.dias ?? []).map(d => ({
            id: d.id || slug(d.nombre || "dia"),
            nombre: d.nombre || "Día",
            diasSemana: [...(d.diasSemana ?? [])],
            ejercicios: (d.ejercicios ?? []).map(e => ({ ...ejercicioVacio(), ...e })),
        }));
        if (!estado.dias.length) estado.dias = [nuevoDia("A")];
        estado.nombrePlantilla = estado.nombrePlantilla || p.nombre || "";
        // El nombre viene de la plantilla cargada: no lo debe pisar el de la rutina
        estado.plantillaEditada = true;

        // El estado ya tiene los datos de la plantilla, pero los controles
        // visibles no se redibujan solos: aquí se sincronizan todos
        // (chips de objetivo, nombre, semanas y fecha de fin calculada).
        inNombre.value = estado.nombre;
        pintarObjetivos();
        inSemanas.value = String(estado.semanas);
        pintaFin();
        inPlantillaNombre.value = estado.nombrePlantilla;
        revisaConflicto();
        limpiarError();
        pintarTipo();   // la plantilla la cambió a planificada: los chips tienen que verse
        repintar();
    };

    // ── Nombre ──
    const inNombre = el("input");
    inNombre.type = "text";
    inNombre.placeholder = "Ejemplo: PPL 12 semanas";
    inNombre.value = estado.nombre;
    inNombre.oninput = () => {
        estado.nombre = inNombre.value;
        // El nombre de la plantilla sigue al de la rutina mientras no lo cambies a mano
        // (antes se congelaba con la primera letra tecleada)
        if (!esEdicion && !estado.plantillaEditada) {
            estado.nombrePlantilla = inNombre.value;
            inPlantillaNombre.value = estado.nombrePlantilla;
            revisaConflicto();
        }
        actualizaRuta(); limpiarError();
    };
    campo("Nombre de la rutina", inNombre, "Obligatorio. Es el nombre del dashboard y del archivo de datos.");

    // ── Objetivo ──
    const filaObj = el("div", "gym-dias-semana");
    const pintarObjetivos = () => {
        filaObj.empty();
        const extra = estado.objetivo && !CONFIG.OBJETIVOS.includes(estado.objetivo) ? [estado.objetivo] : [];
        for (const o of [...CONFIG.OBJETIVOS, ...extra]) {
            const b = el("button", "gym-chip" + (estado.objetivo === o ? " on" : ""), o);
            b.type = "button";
            b.onclick = () => { estado.objetivo = estado.objetivo === o ? "" : o; pintarObjetivos(); };
            filaObj.appendChild(b);
        }
    };
    pintarObjetivos();
    campo("Objetivo (opcional)", filaObj);

    // ── Estado (SOLO al editar): lo que se muestra en la lista de Rutinas ──
    if (esEdicion) {
        const filaEst = el("div", "gym-dias-semana");
        const estados: { v: EstadoRutina; txt: string }[] = [
            { v: "activa", txt: "🟢 Activa" },
            { v: "pausada", txt: "⏸ Pausada" },
            { v: "finalizada", txt: "🏁 Finalizada" },
        ];
        const pintarEstado = () => {
            filaEst.empty();
            for (const e of estados) {
                const b = el("button", "gym-chip" + (estado.estadoRutina === e.v ? " on" : ""), e.txt);
                b.type = "button";
                b.onclick = () => { estado.estadoRutina = e.v; pintarEstado(); };
                filaEst.appendChild(b);
            }
        };
        pintarEstado();
        campo("Estado", filaEst,
            "Cómo aparece la rutina en la lista: 🟢 activa, ⏸ pausada o 🏁 finalizada. No borra ni pausa nada: es solo su etiqueta.");
    }

    // ── Duración: inicio + semanas → fin en vivo ──
    const dur = el("div", "display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;");
    const cajaIni = el("div", "flex:1;min-width:150px;");
    const inInicio = el("input"); inInicio.type = "date"; inInicio.value = estado.inicio;
    cajaIni.appendChild(el("div", "gym-etiqueta", "Inicio"));
    cajaIni.appendChild(inInicio);
    const cajaSem = el("div", "flex:1;min-width:110px;");
    const inSemanas = el("input"); inSemanas.type = "number"; inSemanas.min = "1";
    inSemanas.value = String(estado.semanas);
    cajaSem.appendChild(el("div", "gym-etiqueta", "Semanas"));
    cajaSem.appendChild(inSemanas);
    const cajaFin = el("div", "flex:1;min-width:150px;");
    const txtFin = el("div", "padding:9px 4px;font-size:.9em;font-weight:600;");
    cajaFin.appendChild(el("div", "gym-etiqueta", "Fin (calculado)"));
    cajaFin.appendChild(txtFin);
    dur.appendChild(cajaIni); dur.appendChild(cajaSem); dur.appendChild(cajaFin);
    const pintaFin = () => {
        const s = Math.max(1, Number(inSemanas.value) || 1);
        estado.semanas = s;
        txtFin.textContent = finDesde(estado.inicio, s);
    };
    inInicio.oninput = () => { estado.inicio = inInicio.value; pintaFin(); limpiarError(); };
    inSemanas.oninput = () => { pintaFin(); limpiarError(); };
    campo("Duración", dur, "La rutina se usará durante ese tiempo; se puede extender más adelante desde el dashboard.");
    pintaFin();

    // ── Unidad de peso: kg | lb (lo mismo que en la rutina) ──
    campo("Peso en", selectorUnidad(() => { repintar(); }),
        "Se muestra y se teclea solo en esa unidad; el archivo de datos siempre guarda kg.");

    // ══════════════════ Estructura: días y ejercicios ══════════════════
    const contDias = el("div");
    campoEstructura = campo("Estructura por día de rutina", contDias,
        "Cada día declara SUS días de la semana (p. ej. «Push» el lunes y el jueves). Los ejercicios se precargan con los objetivos que pongas aquí.");

    // Día vacío con letra (A, B, C…) usada tanto en el id como en el nombre
    function nuevoDia(letra: string): DiaRutina {
        const l = String(letra || "A").toUpperCase();
        return { id: `dia-${slug(l)}`, nombre: `Día ${l}`, diasSemana: [], ejercicios: [] };
    }

    const repintar = (): void => {
        contDias.empty();
        estado.dias.forEach((dia, i) => contDias.appendChild(tarjetaDia(dia, i)));
        const btnMas = el("button", "gym-chip gym-mt4", "＋ Añadir día");
        btnMas.type = "button";
        btnMas.onclick = () => {
            const letra = String.fromCharCode(65 + estado.dias.length);
            estado.dias.push({ id: `dia-${slug(letra)}`, nombre: `Día ${letra}`, diasSemana: [], ejercicios: [] });
            limpiarError();
            repintar();
        };
        contDias.appendChild(btnMas);
        actualizaRuta();
    };

    const tarjetaDia = (dia: DiaRutina, i: number): HTMLDivElement => {
        const cajaDia = el("div", "gym-dia");

        // Cabecera del día: nombre + días de la semana + borrar
        const cab = el("div", "gym-dia-cab");
        const inNombreDia = el("input", "flex:1;min-width:140px;");
        inNombreDia.type = "text";
        inNombreDia.placeholder = "Nombre del día (push, día a…)";
        inNombreDia.value = dia.nombre;
        inNombreDia.oninput = () => { dia.nombre = inNombreDia.value; };
        cab.appendChild(inNombreDia);

        const semana = el("div", "gym-dias-semana");
        const pintarSemana = () => {
            semana.empty();
            DIAS.forEach((d, idx) => {
                const n = idx + 1;
                const activo = (dia.diasSemana ?? []).includes(n);
                const b = el("button", "gym-chip" + (activo ? " on" : ""), d);
                b.type = "button";
                b.title = DIAS_LARGO[idx];
                b.dataset.letra = d;
                b.onclick = () => {
                    dia.diasSemana = dia.diasSemana ?? [];
                    const p = dia.diasSemana.indexOf(n);
                    if (p >= 0) dia.diasSemana.splice(p, 1);
                    else {
                        // Exclusivo: si ese día de la semana ya lo tenía OTRO día
                        // de la rutina, se lo "roba" (así el clic siempre se ve)
                        dia.diasSemana.push(n);
                        for (const otro of estado.dias) {
                            if (otro === dia) continue;
                            otro.diasSemana = (otro.diasSemana ?? []).filter(x => x !== n);
                        }
                    }
                    dia.diasSemana.sort((a, b) => a - b);
                    repintar();
                    limpiarError();
                };
                semana.appendChild(b);
            });
        };
        pintarSemana();
        cab.appendChild(semana);

        const btnBorrarDia = el("button", "gym-borrar", "🗑");
        btnBorrarDia.type = "button";
        btnBorrarDia.title = "Borrar este día";
        btnBorrarDia.onclick = async () => {
            if (estado.dias.length === 1) { error("La rutina necesita al menos un día."); return; }
            const conRegistros = esEdicion && (inicial?.sesiones ?? []).some(s => s.diaId === dia.id);
            if (conRegistros && !(await confirmar("🗑 Borrar día",
                `El «${dia.nombre}» tiene sesiones registradas. Sus registros se conservarán en el archivo de datos aunque borres el día de la definición. ¿Borrarlo igualmente?`,
                "Borrar día", "Cancelar"))) return;
            estado.dias.splice(i, 1);
            repintar();
        };
        cab.appendChild(btnBorrarDia);
        cajaDia.appendChild(cab);

        // Ejercicios
        const contEj = el("div");
        cajaDia.appendChild(contEj);

        const filaEjercicio = (ej: EjercicioDef): HTMLDivElement => {
            const fila = el("div", "gym-ej");
            const celda = (etiqueta: string, control: HTMLElement) => {
                const c = el("div");
                c.appendChild(el("label", null, etiqueta));
                c.appendChild(control);
                fila.appendChild(c);
                return c;
            };
            const inEj = el("input"); inEj.type = "text"; inEj.placeholder = "Ejercicio"; inEj.value = ej.nombre;
            inEj.oninput = () => { ej.nombre = inEj.value; limpiarError(); };
            celda("Ejercicio", inEj);

            const num = (valor: string | number | null, min: number, paso: number, titulo: string) => {
                const n = el("input", "gym-mini");
                n.type = "number"; n.min = String(min); n.step = String(paso);
                n.value = valor === null || valor === undefined ? "" : String(valor);
                n.title = titulo;
                return n;
            };
            const inSeries = num(ej.series, 1, 1, "Series objetivo");
            inSeries.oninput = () => { ej.series = Math.max(1, Number(inSeries.value) || 1); };
            celda("Series", inSeries);

            const inReps = num(ej.repsObjetivo, 1, 1, "Repeticiones objetivo");
            inReps.oninput = () => { ej.repsObjetivo = Math.max(1, Number(inReps.value) || 1); };
            // Cómo se leen esas reps: número fijo, mínimo al fallo o al fallo
            // (en «al fallo» el número se oculta: no hay objetivo que fijar)
            const selModo = el("select", "gym-mini");
            for (const [v, t] of [["", "Reps fijas"], ["minimo", "Mínimo al fallo"], ["todas", "Al fallo"]] as const) {
                const o = el("option", null, t); o.value = v; selModo.appendChild(o);
            }
            selModo.value = ej.modoFallo ?? "";
            selModo.title = "Cómo se leen esas reps: número exacto, llegar al menos a ese número y seguir hasta el fallo, o tantas repeticiones como puedas.";
            const cReps = el("div", "gym-reps");
            cReps.append(selModo, inReps);
            const pintaModo = () => {
                const todas = ej.modoFallo === "todas";
                inReps.style.display = todas ? "none" : "";
                inReps.placeholder = ej.modoFallo === "minimo" ? "mín." : "reps";
                inReps.title = ej.modoFallo === "minimo"
                    ? "Mínimo de repeticiones: después de ese número se sigue hasta el fallo"
                    : "Repeticiones objetivo";
            };
            selModo.onchange = () => {
                const v = selModo.value;
                ej.modoFallo = v === "minimo" || v === "todas" ? v : null;
                pintaModo();
            };
            pintaModo();
            celda("Reps", cReps);

            const inPeso = num(pesoACampo(ej.pesoObjetivo), 0, 0.5, `Peso objetivo (${pesoActual()}, opcional)`);
            celda(`Peso (${pesoActual()})`, inPeso);
            // El valor se teclea en la unidad activa y se guarda SIEMPRE en kg
            inPeso.oninput = () => { ej.pesoObjetivo = pesoAKg(inPeso.value); };

            const inDesc = num(ej.descansoSeg, 0, 15, "Descanso entre series (segundos)");
            inDesc.oninput = () => { ej.descansoSeg = aNumero(inDesc.value); };
            celda("Descanso (s)", inDesc);

            const inNotas = el("input", "gym-mini"); inNotas.type = "text";
            inNotas.placeholder = "Notas (opcional)"; inNotas.value = ej.notas ?? "";
            inNotas.oninput = () => { ej.notas = inNotas.value; };
            celda("Notas", inNotas);

            const cBorrar = el("div");
            const bBorrar = el("button", "gym-borrar", "🗑");
            bBorrar.type = "button";
            bBorrar.title = "Borrar ejercicio";
            bBorrar.onclick = () => {
                const p = dia.ejercicios.indexOf(ej);
                if (p >= 0) dia.ejercicios.splice(p, 1);
                pintarEjercicios();
            };
            cBorrar.appendChild(bBorrar);
            fila.appendChild(cBorrar);
            return fila;
        };

        const pintarEjercicios = () => {
            contEj.empty();
            if (!dia.ejercicios.length) contEj.appendChild(el("div", "gym-ayuda", "Sin ejercicios todavía."));
            dia.ejercicios.forEach(ej => contEj.appendChild(filaEjercicio(ej)));
            const b = el("button", "gym-chip", "＋ Añadir ejercicio");
            b.type = "button";
            b.onclick = () => { dia.ejercicios.push(ejercicioVacio()); pintarEjercicios(); limpiarError(); };
            contEj.appendChild(b);
        };
        pintarEjercicios();
        return cajaDia;
    };

    // Un día de la semana solo puede pertenecer a un día de la rutina
    const unificaDiasSemana = () => {
        const visto = new Set<number>();
        for (const d of estado.dias) {
            d.diasSemana = (d.diasSemana ?? []).filter(n => (visto.has(n) ? false : (visto.add(n), true)));
        }
    };

    // ── Guardar como plantilla: toggle estilo chip (misma pinta que Objetivo,
    //    para que se note que es un botón y no texto plano) ──
    const contPlantilla = el("div", null);
    const inPlantillaNombre = el("input", "margin-top:8px;");
    inPlantillaNombre.type = "text";
    inPlantillaNombre.placeholder = "Nombre de la plantilla";
    inPlantillaNombre.value = estado.nombrePlantilla || estado.nombre || "";

    // Aviso en vivo: si el nombre ya existe, NO se dejará guardar (no se pisa)
    const hintPlantilla = el("div", `font-size:.7em;color:var(--text-error, ${CONFIG.ROJO});margin-top:5px;`);
    contPlantilla.appendChild(hintPlantilla);
    const revisaConflicto = () => {
        const n = limpiarNombre(estado.nombrePlantilla || "");
        const choque = estado.comoPlantilla && n && plantillaExiste(n);
        hintPlantilla.textContent = choque
            ? `⚠️ Ya existe una plantilla «${n}.md». No se guardará así para no pisarla: cambia el nombre (o desactiva el botón).`
            : "";
    };
    inPlantillaNombre.oninput = () => {
        estado.nombrePlantilla = inPlantillaNombre.value;
        // Si lo dejas igual que el nombre de la rutina (o lo vacías), vuelve a seguirle
        estado.plantillaEditada = Boolean(inPlantillaNombre.value.trim()) &&
            inPlantillaNombre.value.trim() !== (estado.nombre ?? "").trim();
        revisaConflicto(); limpiarError();
    };

    const btnPlantilla = el("button", "gym-chip", "📦 Guardar esta rutina como plantilla");
    btnPlantilla.type = "button";
    btnPlantilla.title = "Actívalo para poder reutilizar esta estructura en rutinas futuras";
    const pintaPlantilla = () => {
        const on = Boolean(estado.comoPlantilla);
        btnPlantilla.classList.toggle("on", on);
        btnPlantilla.setAttribute("aria-pressed", String(on));
        inPlantillaNombre.style.display = on ? "" : "none";   // el nombre solo se pide si está activo
    };
    refPintaPlantilla = pintaPlantilla;
    btnPlantilla.onclick = () => {
        estado.comoPlantilla = !estado.comoPlantilla;
        // Al activarlo se propone el mismo nombre que el de la rutina
        // (si no lo has cambiado a mano)
        if (estado.comoPlantilla && !estado.plantillaEditada) {
            estado.nombrePlantilla = estado.nombre;
            inPlantillaNombre.value = estado.nombrePlantilla;
        }
        pintaPlantilla();
        revisaConflicto(); limpiarError();
        if (estado.comoPlantilla) inPlantillaNombre.focus();
    };
    pintaPlantilla();
    revisaConflicto();

    contPlantilla.appendChild(btnPlantilla);
    contPlantilla.appendChild(inPlantillaNombre);
    campoPlantilla = campo("Plantilla (opcional)", contPlantilla,
        "Se guarda solo la estructura (días y ejercicios), sin fechas ni registros, en " + carpetaPlantillas() +
        ". Pulsa el botón para activarlo: se rellenará el nombre con el de la rutina y podrás cambiarlo.");

    // ── Ruta en vivo: el archivo de datos de la rutina ──
    const rutaVista = el("div", "gym-ruta");
    raiz.appendChild(rutaVista);
    const idPropuesto = (): string => {
        if (estado.id) return estado.id;
        const f = hoy().slice(0, 7);
        return `rutina-${f}-${slug(estado.nombre) || "sin-nombre"}`;
    };
    const actualizaRuta = () => {
        rutaVista.empty();
        const l1 = el("div", "gym-ruta-lin");
        l1.append("🗂 ", el("b", null, rutaDatosDe(idPropuesto())));
        const l2 = el("div", "gym-ruta-lin gym-mt4");
        l2.append("y su fila en ", el("b", null, rutaIndice()));
        rutaVista.append(l1, l2);
    };
    actualizaRuta();

    // ══════════════════ Guardar ══════════════════
    const btnGuardar = el("button", "gym-guardar", estado.modo === "editar" ? "💾 Guardar cambios" : "💾 Guardar rutina");
    btnGuardar.type = "button";

    const filaGuardar = el("div", "gym-fila-guardar");
    filaGuardar.appendChild(btnGuardar);

    // 🧹 Limpiar: vacía el formulario para empezar de cero. Solo en modo
    // CREAR (en edición vaciaría la estructura de una rutina existente).
    if (estado.modo !== "editar") {
        const btnLimpiar = el("button", "gym-limpiar", "🧹 Limpiar");
        btnLimpiar.type = "button";
        btnLimpiar.title = "Vacía el formulario y empieza de cero";
        btnLimpiar.onclick = async () => {
            if (!(await confirmar("🧹 Limpiar formulario",
                "¿Vaciar el formulario? Se borra todo lo escrito aquí (nombre, objetivo, fechas, días y ejercicios) para empezar de cero. No se toca ninguna rutina ya guardada.",
                "Vaciar", "Cancelar"))) return;
            // Estado → valores por defecto
            estado.nombre = "";
            estado.objetivo = "";
            estado.tipo = "planificada";
            estado.inicio = hoy();
            estado.semanas = CONFIG.SEMANAS_POR_DEFECTO;
            estado.dias = [nuevoDia("A")];
            estado.plantilla = "";
            estado.comoPlantilla = false;
            estado.nombrePlantilla = "";
            estado.plantillaEditada = false;
            estado.estadoRutina = "activa";
            estado.id = "";
            estado.guardado = false;
            // Controles ligados → lo mismo
            inNombre.value = "";
            selPlantilla.value = "";
            pintarObjetivos();
            pintarTipo();          // vuelve a planificada y se re-habilita la estructura
            inInicio.value = estado.inicio;
            inSemanas.value = String(estado.semanas);
            pintaFin();
            pintaPlantilla();          // toggle de plantilla → apagado y nombre oculto
            revisaConflicto();
            inPlantillaNombre.value = "";
            limpiarError();
            repintar();
            inNombre.focus();
            toast("🧹 Formulario vacío: a empezar de cero");
        };
        filaGuardar.appendChild(btnLimpiar);
    }
    raiz.appendChild(filaGuardar);
    raiz.appendChild(el("div", "gym-ayuda",
        estado.modo === "editar"
            ? "Se actualiza el archivo de datos (con copia .bak previa) y su fila en el índice; las sesiones no se tocan."
            : enHoja
                ? "Al guardar se escribe el archivo de datos, se añade la rutina al índice y la hoja se cierra sobre su ficha."
                : "Al guardar se escribe el archivo de datos, se añade la rutina al índice y esta pestaña pasa a su dashboard."));

    const construir = (): Rutina => {
        unificaDiasSemana();
        const dias = estado.dias.map((d, i) => ({
            id: d.id || `dia-${slug(d.nombre || String.fromCharCode(65 + i))}`,
            nombre: limpiarNombre(d.nombre) || `Día ${String.fromCharCode(65 + i)}`,
            diasSemana: [...(d.diasSemana ?? [])],
            ejercicios: d.ejercicios.map((e, j) => ({
                id: e.id || `${slug(d.nombre || "dia")}-${slug(e.nombre || `ej-${j}`)}`,
                nombre: limpiarNombre(e.nombre),
                series: Math.max(1, Number(e.series) || 1),
                repsObjetivo: e.modoFallo === "todas" ? null : Math.max(1, Number(e.repsObjetivo) || 1),
                pesoObjetivo: e.pesoObjetivo ?? null,
                descansoSeg: e.descansoSeg ?? null,
                notas: e.notas ?? "",
                modoFallo: e.modoFallo ?? null,
            })),
        }));
        const union = [...new Set(dias.flatMap(d => d.diasSemana))].sort();
        const fin = finDesde(estado.inicio, estado.semanas);
        const libre = estado.tipo === "libre";
        return {
            id: idPropuesto(),
            nombre: limpiarNombre(estado.nombre),
            objetivo: estado.objetivo || "",
            tipo: libre ? "libre" : "planificada",
            inicio: estado.inicio,
            fin,
            semanas: estado.semanas,
            // La libre NO guarda días: cada sesión lleva su diaId vacío y los
            // ejercicios se anotan dentro de la sesión, no en un plan previo.
            diasSemana: libre ? [] : union,
            dias: libre ? [] : dias,
            sesiones: esEdicion ? (inicial!.sesiones ?? []) : [],
            notasDia: esEdicion ? (inicial!.notasDia ?? []) : [],
            estado: esEdicion ? estado.estadoRutina : "activa",
            creado: esEdicion ? (inicial!.creado || hoy()) : hoy(),
            modificado: hoy(),
        };
    };

    const validar = (rutina: Rutina): string | null => {
        if (!rutina.nombre) return "Falta el nombre de la rutina.";
        if (!esFechaValida(rutina.inicio)) return "La fecha de inicio no es válida (formato YYYY-MM-DD).";
        if (!Number.isFinite(tsDe(rutina.fin)) || tsDe(rutina.fin) < tsDe(rutina.inicio))
            return "Las fechas no cuadran: el fin tiene que ser posterior al inicio.";
        // La rutina libre no tiene estructura: aquí no hay nada más que comprobar
        if (rutina.tipo === "libre") return null;
        if (!rutina.dias.length) return "La rutina necesita al menos un día.";
        const sinEjercicios = rutina.dias.filter(d => !d.ejercicios.length);
        if (sinEjercicios.length === rutina.dias.length) return "Ningún día tiene ejercicios: añade al menos uno.";
        const sinDia = rutina.dias.filter(d => !d.diasSemana.length);
        if (sinDia.length === rutina.dias.length)
            return "Elige en qué días de la semana se entrena cada día de la rutina.";
        for (const d of rutina.dias) {
            const vacios = d.ejercicios.filter(e => !e.nombre);
            if (vacios.length === d.ejercicios.length && d.ejercicios.length) return `El día «${d.nombre}» no tiene ningún ejercicio con nombre.`;
        }
        return null;
    };

    let guardando = false;

    const guardar = async (): Promise<void> => {
        if (estado.guardado || guardando) return;
        limpiarError();
        unificaDiasSemana();
        const rutina = construir();
        const fallo = validar(rutina);
        if (fallo) {
            const sinDias = rutina.dias.filter(d => !d.diasSemana.length);
            error(fallo + (sinDias.length && fallo.includes("días de la semana")
                ? ` → ${sinDias.map(d => `«${d.nombre}»`).join(", ")}` : ""));
            return;
        }
        if (estado.comoPlantilla) {
            const nomPlant = limpiarNombre(estado.nombrePlantilla);
            if (!nomPlant) { error("Has marcado «guardar como plantilla» pero no le has puesto nombre."); return; }
            if (plantillaExiste(nomPlant)) {
                error(`Ya existe una plantilla «${nomPlant}.md». Para no pisarla, pon otro nombre de plantilla (o desactiva «📦 Guardar como plantilla») y vuelve a guardar.`);
                return;
            }
        }

        guardando = true;
        btnGuardar.disabled = true;
        btnGuardar.textContent = "Guardando…";

        try {
            // 1 · Archivo de datos (siempre primero: los datos nunca se pierden)
            //     escribirRutina también deja su fila al día en el índice
            await escribirRutina(rutina);

            // 2 · Plantilla opcional (solo estructura, sin fechas ni registros)
            if (estado.comoPlantilla) {
                try {
                    await escribirPlantilla(limpiarNombre(estado.nombrePlantilla), plantillaDeRutina(rutina));
                } catch (e: unknown) {
                    toast("⚠️ La rutina se guardó, pero la plantilla no: " + msgError(e), false);
                }
            }

            estado.guardado = true;
            guardando = false;
            delete almacen[claveEstado];
            toast(`✅ Rutina guardada → ${rutaDatosDe(rutina.id)}`);
            // 3 · Se abre el dashboard de la rutina en su pestaña
            await abrirRutina(rutina.id);
            if (typeof onGuardado === "function") onGuardado(rutina);
        } catch (e: unknown) {
            console.error("[Gym Stone]", e);
            guardando = false;
            btnGuardar.disabled = false;
            btnGuardar.textContent = estado.modo === "editar" ? "💾 Guardar cambios" : "💾 Guardar rutina";
            error("No se pudo guardar: " + msgError(e) + " — tus datos siguen intactos, vuelve a intentarlo.");
        }
    };
    btnGuardar.onclick = guardar;

    // Los tres bloques ocultos se ocultan al FINAL: al montar, aplicaTipo()
    // todavía no conocía los controles (aún no existían).
    aplicaTipo();
    repintar();
};

/* ══════════════════ Punto de entrada ══════════════════ */

// Nueva rutina: el formulario vacío (pestaña o hoja superpuesta)
export const crear = async (
    cont: HTMLElement, onGuardado?: (r: Rutina) => void, enHoja = false,
): Promise<void> => {
    await montar({ cont, inicial: null, esEdicion: false, onGuardado, enHoja });
};

// Edición: el mismo formulario, pero partiendo de una rutina existente
export const editar = async (
    cont: HTMLElement, rutina: Rutina,
    onGuardado?: (r: Rutina) => void, enHoja = false,
): Promise<void> => {
    await montar({ cont, inicial: rutina, esEdicion: true, onGuardado, enHoja });
};
