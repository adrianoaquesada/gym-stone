import { CONFIG, DIAS, DIAS_LARGO } from "../config";
import { carpetaPlantillas, rutaIndice } from "../ajustes";
import {
    escribirRutina, ejercicioVacio, finDesde,
    listarPlantillas, leerPlantilla, plantillaDeRutina, plantillaExiste,
    rutaDatosDe, rutinaVacia, escribirPlantilla, tipoEjercicioDe, tipoSerieDe,
    catalogoGestion, normalizarGrupos, etiquetasDeDia,
} from "../datos";
import { aNumero, clonarJSON, esFechaValida, hoy, limpiarNombre, msgError, norm, slug, tsDe } from "../util";
import { uid } from "../util/texto";
import { pesoActual, pesoACampo, pesoAKg } from "../unidades";
import type { DiaRutina, EjercicioDef, EstadoRutina, Rutina } from "../tipos";
import { btn, confirmar, el, modal, pedirTexto, ponerX, selectorUnidad, toast } from "./componentes";
import { abrirRutina } from "./vistas";
import { crearComparacionPlan } from "./comparacion-plan";

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
    plantillaOrigen: string | null;
    comoPlantilla: boolean;
    nombrePlantilla: string;
    plantillaEditada: boolean;
    estadoRutina: EstadoRutina;
    guardado: boolean;
    guardandoPlantilla: boolean;
}

const almacen: Record<string, EstadoForm> = {};

interface OpcionesMontar {
    cont: HTMLElement;
    inicial: Rutina | null;
    esEdicion: boolean;
    onGuardado?: (rutina: Rutina) => void;
    enHoja?: boolean;
}

export const montar = async ({ cont, inicial, esEdicion, onGuardado, enHoja = false }: OpcionesMontar): Promise<void> => {
    cont.empty();
    const claveEstado = esEdicion ? `edit:${inicial?.id ?? ""}` : "crear";
    let estado = almacen[claveEstado];

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
            plantillaOrigen: base.plantillaOrigen ?? null,
            comoPlantilla: false,
            nombrePlantilla: base.nombre ?? "",
            plantillaEditada: false,
            estadoRutina: base.estado === "pausada" || base.estado === "finalizada" ? base.estado : "activa",
            guardado: false,
            guardandoPlantilla: false,
        };
    }

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
    let gruposDisponibles: string[] = [];
    let ejerciciosCatalogo: Awaited<ReturnType<typeof catalogoGestion>> = [];
    try {
        ejerciciosCatalogo = await catalogoGestion();
        gruposDisponibles = normalizarGrupos([
            ...ejerciciosCatalogo.flatMap(ejercicio => ejercicio.grupos),
            ...estado.dias.flatMap(dia => (dia.ejercicios ?? []).flatMap(ejercicio => ejercicio.grupos ?? [])),
        ]);
    } catch (err: unknown) {
        console.error("[Gym Stone grupos del creador]", err);
        error("No pude cargar el catálogo de grupos. Puedes crear grupos nuevos, pero revisa el aviso antes de editar el catálogo.");
    }

    const campo = (etiqueta: string, control: HTMLElement, ayuda?: string): HTMLDivElement => {
        const f = el("div", "gym-campo");
        f.appendChild(el("div", "gym-etiqueta", etiqueta));
        f.appendChild(control);
        if (ayuda) f.appendChild(el("div", "gym-ayuda", ayuda));
        raiz.appendChild(f);
        return f;
    };

    let campoOrigen: HTMLDivElement | null = null, campoEstructura: HTMLDivElement | null = null;
    let campoPlantilla: HTMLDivElement | null = null, refPintaPlantilla: (() => void) | null = null;
    const aplicaTipo = () => {
        const libre = estado.tipo === "libre";
        if (libre) estado.comoPlantilla = false;
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

    const selPlantilla = el("select");
    const plantillas = listarPlantillas();
    if (estado.modo === "editar" && estado.plantillaOrigen && !estado.plantilla) {
        for (const nombre of plantillas) {
            const lectura = await leerPlantilla(nombre);
            if (!lectura.error && lectura.datos?.id === estado.plantillaOrigen) {
                estado.plantilla = nombre;
                break;
            }
        }
    }
    const opBlanco = createEl("option");
    opBlanco.value = "";
    opBlanco.textContent = "En blanco";
    selPlantilla.appendChild(opBlanco);
    for (const p of plantillas) {
        const o = createEl("option");
        o.value = p; o.textContent = p;
        selPlantilla.appendChild(o);
    }
    if (estado.modo === "editar" && estado.plantillaOrigen && !estado.plantilla) {
        const o = createEl("option");
        o.value = "__origen_no_disponible__";
        o.textContent = "Plantilla de origen no disponible";
        selPlantilla.appendChild(o);
        estado.plantilla = o.value;
    }
    selPlantilla.value = estado.plantilla ?? "";
    if (estado.modo === "editar") selPlantilla.disabled = true;
    const controlOrigen = el("div", "display:flex;flex-direction:column;align-items:flex-start;gap:8px;");
    controlOrigen.appendChild(selPlantilla);
    const btnCompararPlantilla = el("button", "gym-chip", "🔎 Comparar plan base con los ajustes actuales");
    btnCompararPlantilla.type = "button";
    btnCompararPlantilla.disabled = !estado.plantilla || estado.plantilla === "__origen_no_disponible__";
    btnCompararPlantilla.onclick = async () => {
        const nombre = estado.plantilla;
        if (!nombre || nombre === "__origen_no_disponible__") return;
        const lectura = await leerPlantilla(nombre);
        if (lectura.error || !lectura.datos) {
            const mensaje = lectura.error ?? `No se pudo leer la plantilla «${nombre}».`;
            console.error("[Gym Stone comparación desde la plantilla]", mensaje);
            toast(`⚠️ ${mensaje}`, false);
            return;
        }
        const m = modal("Plan base y ajustes actuales", nombre);
        ponerX(m);
        m.caja.appendChild(crearComparacionPlan(lectura.datos, construir()));
    };
    controlOrigen.appendChild(btnCompararPlantilla);
    selPlantilla.onchange = () => {
        estado.plantilla = selPlantilla.value;
        btnCompararPlantilla.disabled = !estado.plantilla;
        if (estado.plantilla) void aplicarPlantilla(estado.plantilla);
        else estado.plantillaOrigen = null;
        limpiarError();
    };
    const ayudaOrigen = estado.modo === "editar"
        ? estado.plantillaOrigen && estado.plantilla !== "__origen_no_disponible__"
            ? "Plantilla de origen de solo lectura; los ajustes de esta rutina se guardan aparte."
            : estado.plantillaOrigen
                ? "La rutina conserva la referencia a su plantilla, pero esta ya no está disponible para comparar."
                : "Esta rutina no tiene una plantilla de origen."
        : plantillas.length
            ? "Partir de una plantilla precarga días y ejercicios; la rutina guarda su propia copia editable."
            : "Todavía no hay plantillas: se crean desde una rutina existente con el botón «Guardar como plantilla».";
    campoOrigen = campo("Origen", controlOrigen, ayudaOrigen);

    const aplicarPlantilla = async (nombre: string): Promise<void> => {
        const r = await leerPlantilla(nombre);
        if (r.error) {
            error(r.error);
            selPlantilla.value = estado.plantilla = "";
            estado.plantillaOrigen = null;
            return;
        }
        if (estado.dias.length && !(await confirmar("📋 Plantilla",
            `¿Reemplazar la estructura actual por la plantilla «${nombre}»?`,
            "Reemplazar", "Cancelar"))) {
            selPlantilla.value = estado.plantilla = "";
            estado.plantillaOrigen = null;
            return;
        }
        const p = r.datos!;
        estado.plantillaOrigen = p.id ?? null;

        estado.tipo = "planificada";
        estado.nombre = estado.nombre || p.nombre || "";
        estado.objetivo = p.objetivo || estado.objetivo;
        estado.semanas = p.semanas || estado.semanas;
        estado.dias = (p.dias ?? []).map(d => ({
            id: d.id || slug(d.nombre || "dia"),
            nombre: d.nombre || "Día",
            diasSemana: [...(d.diasSemana ?? [])],
            etiquetasPersonalizadas: normalizarGrupos(d.etiquetasPersonalizadas),
            ejercicios: (d.ejercicios ?? []).map(e => ({
                ...ejercicioVacio(), ...e, grupos: normalizarGrupos(e.grupos),
            })),
        }));
        if (!estado.dias.length) estado.dias = [nuevoDia("A")];
        estado.nombrePlantilla = estado.nombrePlantilla || p.nombre || "";

        estado.plantillaEditada = true;

        inNombre.value = estado.nombre;
        pintarObjetivos();
        inSemanas.value = String(estado.semanas);
        pintaFin();
        inPlantillaNombre.value = estado.nombrePlantilla;
        revisaConflicto();
        limpiarError();
        pintarTipo();
        repintar();
    };

    const inNombre = el("input");
    inNombre.type = "text";
    inNombre.placeholder = "Ejemplo: PPL 12 semanas";
    inNombre.value = estado.nombre;
    inNombre.oninput = () => {
        estado.nombre = inNombre.value;

        if (!esEdicion && !estado.plantillaEditada) {
            estado.nombrePlantilla = inNombre.value;
            inPlantillaNombre.value = estado.nombrePlantilla;
            revisaConflicto();
        }
        actualizaRuta(); limpiarError();
    };
    campo("Nombre de la rutina", inNombre, "Obligatorio. Es el nombre del dashboard y del archivo de datos.");

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

    campo("Peso en", selectorUnidad(() => { repintar(); }),
        "Se muestra y se teclea solo en esa unidad; el archivo de datos siempre guarda kg.");

    const contDias = el("div");
    campoEstructura = campo("Estructura por día de rutina", contDias,
        "Cada día declara SUS días de la semana (p. ej. «Push» el lunes y el jueves). Los ejercicios se precargan con los objetivos que pongas aquí.");

    function nuevoDia(letra: string): DiaRutina {
        const l = String(letra || "A").toUpperCase();
        return {
            id: `dia-${slug(l)}`, nombre: `Día ${l}`, diasSemana: [],
            ejercicios: [], etiquetasPersonalizadas: [],
        };
    }

    const repintar = (): void => {
        contDias.empty();
        estado.dias.forEach((dia, i) => contDias.appendChild(tarjetaDia(dia, i)));
        const btnMas = el("button", "gym-chip gym-mt4", "＋ Añadir día");
        btnMas.type = "button";
        btnMas.onclick = () => {
            const letra = String.fromCharCode(65 + estado.dias.length);
            estado.dias.push({
                id: `dia-${slug(letra)}`, nombre: `Día ${letra}`, diasSemana: [],
                ejercicios: [], etiquetasPersonalizadas: [],
            });
            limpiarError();
            repintar();
        };
        contDias.appendChild(btnMas);
        actualizaRuta();
    };

    const tarjetaDia = (dia: DiaRutina, i: number): HTMLDivElement => {
        const cajaDia = el("div", "gym-dia");

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

        const tipoDia = el("div");
        cajaDia.appendChild(el("div", "gym-etiqueta", "Tipo de día"));
        cajaDia.appendChild(tipoDia);
        const pintarTipoDia = () => {
            tipoDia.empty();
            const etiquetas = etiquetasDeDia(dia);
            const grupos = new Set(etiquetas.gruposDerivados.map(g => g.toLocaleLowerCase("es")));
            const personalizadas = new Set(etiquetas.personalizadas.map(g => g.toLocaleLowerCase("es")));
            for (const etiqueta of etiquetas.todas) {
                const clave = etiqueta.toLocaleLowerCase("es");
                const esGrupo = grupos.has(clave);
                const esPersonalizada = personalizadas.has(clave);
                const chip = el("span",
                    esGrupo ? "gym-chip gym-chip-mini gym-grupo" : "gym-chip gym-chip-mini",
                    etiqueta);
                chip.title = esGrupo && esPersonalizada
                    ? "Grupo derivado del ejercicio y también etiqueta personalizada"
                    : esGrupo ? "Grupo derivado de los ejercicios" : "Etiqueta personalizada";
                if (esPersonalizada) {
                    chip.setAttribute("role", "button");
                    chip.tabIndex = 0;
                    chip.title += " — clic para quitar la etiqueta personalizada";
                    const quitar = () => {
                        dia.etiquetasPersonalizadas = normalizarGrupos(
                            (dia.etiquetasPersonalizadas ?? []).filter(g => g.toLocaleLowerCase("es") !== clave),
                        );
                        pintarTipoDia();
                    };
                    chip.onclick = quitar;
                    chip.onkeydown = evento => {
                        if (evento.key !== "Enter" && evento.key !== " ") return;
                        evento.preventDefault();
                        quitar();
                    };
                }
                tipoDia.appendChild(chip);
            }
            if (!etiquetas.todas.length) {
                tipoDia.appendChild(el("div", "gym-ayuda", "Elige grupos en los ejercicios o añade etiquetas personalizadas."));
            }
        };
        pintarTipoDia();

        const filaEtiqueta = el("div", "display:flex;gap:6px;align-items:center;margin:6px 0;");
        const inEtiqueta = el("input", "flex:1;min-width:120px;");
        inEtiqueta.type = "text";
        inEtiqueta.placeholder = "Añadir etiqueta personalizada";
        const btnEtiqueta = el("button", "gym-chip", "＋ Añadir etiqueta");
        btnEtiqueta.type = "button";
        const agregarEtiqueta = () => {
            const escrita = limpiarNombre(inEtiqueta.value);
            if (!escrita) return;
            const existente = (dia.etiquetasPersonalizadas ?? [])
                .find(etiqueta => etiqueta.toLocaleLowerCase("es") === escrita.toLocaleLowerCase("es"));
            dia.etiquetasPersonalizadas = normalizarGrupos([
                ...(dia.etiquetasPersonalizadas ?? []), existente ?? escrita,
            ]);
            inEtiqueta.value = "";
            pintarTipoDia();
            limpiarError();
        };
        btnEtiqueta.onclick = agregarEtiqueta;
        inEtiqueta.onkeydown = evento => {
            if (evento.key !== "Enter") return;
            evento.preventDefault();
            agregarEtiqueta();
        };
        filaEtiqueta.append(inEtiqueta, btnEtiqueta);
        cajaDia.appendChild(filaEtiqueta);

        const contEj = el("div");
        cajaDia.appendChild(contEj);

        const filaEjercicio = (ej: EjercicioDef): HTMLDivElement => {
            const fila = el("div", "gym-ej");

            const celda = (etiqueta: string, control: HTMLElement) => {
                const c = el("div");
                const l = el("label", null, etiqueta);
                c.append(l, control);
                fila.appendChild(c);
                return { c, l };
            };
            const inEj = el("input");
            inEj.type = "text";
            inEj.placeholder = "Busca o escribe un ejercicio";
            inEj.value = ej.nombre;
            inEj.autocomplete = "off";
            inEj.setAttribute("aria-label", "Buscar o escribir ejercicio");
            inEj.setAttribute("role", "combobox");
            inEj.setAttribute("aria-autocomplete", "list");
            const celdaNombre = celda("Ejercicio", inEj).c;
            celdaNombre.classList.add("gym-ej-nombre", "gym-form-ejercicio-busqueda");
            const resultadosEjercicio = el("div", "gym-form-ejercicio-resultados");
            resultadosEjercicio.id = uid("gym-ejercicio-resultados");
            resultadosEjercicio.setAttribute("role", "listbox");
            resultadosEjercicio.hidden = true;
            inEj.setAttribute("aria-controls", resultadosEjercicio.id);
            celdaNombre.appendChild(resultadosEjercicio);

            const cajaGrupos = el("div", "gym-ej-grupos-control");
            const pintarGrupos = () => {
                cajaGrupos.empty();
                const asignados = normalizarGrupos(ej.grupos);
                const btnElegirGrupos = el("button", "gym-chip",
                    asignados.length ? `Editar (${asignados.length})` : "＋ Elegir");
                btnElegirGrupos.type = "button";
                btnElegirGrupos.title = "Elegir o crear grupos";
                btnElegirGrupos.setAttribute("aria-label", "Elegir o crear grupos");
                btnElegirGrupos.onclick = () => abrirSelectorGrupos(asignados);
                cajaGrupos.appendChild(btnElegirGrupos);
            };
            const cerrarResultados = () => {
                resultadosEjercicio.hidden = true;
                inEj.setAttribute("aria-expanded", "false");
            };
            const seleccionarEjercicio = (existente: typeof ejerciciosCatalogo[number]) => {
                ej.id = existente.id;
                ej.nombre = existente.nombre;
                ej.grupos = normalizarGrupos(existente.grupos);
                gruposDisponibles = normalizarGrupos([...gruposDisponibles, ...existente.grupos]);
                inEj.value = existente.nombre;
                cerrarResultados();
                pintarGrupos();
                pintarTipoDia();
                limpiarError();
            };
            const pintarResultados = () => {
                resultadosEjercicio.empty();
                const consulta = norm(inEj.value);
                if (!consulta) {
                    cerrarResultados();
                    return;
                }
                const encontrados = ejerciciosCatalogo
                    .filter(existente =>
                        norm(existente.nombre).includes(consulta) ||
                        norm(existente.grupos.join(" ")).includes(consulta))
                    .slice(0, 8);
                if (!encontrados.length) {
                    resultadosEjercicio.appendChild(el("div", "gym-form-ejercicio-sin-resultados",
                        "Sin coincidencias; se creará como ejercicio nuevo al guardar."));
                } else {
                    for (const existente of encontrados) {
                        const opcion = el("button", "gym-form-ejercicio-opcion");
                        opcion.type = "button";
                        opcion.setAttribute("role", "option");
                        opcion.setAttribute("aria-selected", "false");
                        opcion.appendChild(el("span", null, existente.nombre));
                        if (existente.grupos.length) {
                            opcion.appendChild(el("small", null, existente.grupos.join(" · ")));
                        }
                        opcion.onmousedown = evento => evento.preventDefault();
                        opcion.onclick = () => seleccionarEjercicio(existente);
                        opcion.onkeydown = evento => {
                            const opciones = [...resultadosEjercicio.querySelectorAll<HTMLButtonElement>("button")];
                            const indice = opciones.indexOf(opcion);
                            if (evento.key === "ArrowDown") {
                                evento.preventDefault();
                                opciones[indice + 1]?.focus();
                            } else if (evento.key === "ArrowUp") {
                                evento.preventDefault();
                                if (indice > 0) opciones[indice - 1]?.focus();
                                else inEj.focus();
                            } else if (evento.key === "Escape") {
                                cerrarResultados();
                                inEj.focus();
                            }
                        };
                        resultadosEjercicio.appendChild(opcion);
                    }
                }
                resultadosEjercicio.hidden = false;
                inEj.setAttribute("aria-expanded", "true");
            };
            inEj.oninput = () => {
                ej.nombre = inEj.value;
                pintarResultados();
                limpiarError();
            };
            inEj.onfocus = pintarResultados;
            inEj.onblur = () => {
                window.setTimeout(() => {
                    if (!celdaNombre.contains(document.activeElement)) cerrarResultados();
                }, 0);
            };
            inEj.onkeydown = evento => {
                if (evento.key === "ArrowDown" && !resultadosEjercicio.hidden) {
                    evento.preventDefault();
                    resultadosEjercicio.querySelector("button")?.focus();
                } else if (evento.key === "Escape") {
                    cerrarResultados();
                }
            };
            const abrirSelectorGrupos = (iniciales: string[]): void => {
                const seleccionados = new Set(iniciales.map(grupo => grupo.toLocaleLowerCase("es")));
                const selector = modal("Grupos del ejercicio", ej.nombre);
                ponerX(selector);
                selector.caja.appendChild(el("div", "gym-ayuda", "Selecciona los grupos que pertenecen a este ejercicio."));
                const lista = el("div", "gym-form-grupos-lista");
                const pintarOpciones = () => {
                    lista.empty();
                    const disponibles = normalizarGrupos([...gruposDisponibles, ...(ej.grupos ?? [])])
                        .sort((a, b) => a.localeCompare(b, "es"));
                    if (!disponibles.length) {
                        lista.appendChild(el("div", "gym-ayuda", "Todavía no hay grupos. Puedes crear uno nuevo."));
                    }
                    for (const grupo of disponibles) {
                        const opcion = el("label", "gym-form-grupo-opcion");
                        const check = el("input");
                        check.type = "checkbox";
                        check.checked = seleccionados.has(grupo.toLocaleLowerCase("es"));
                        check.onchange = () => {
                            const clave = grupo.toLocaleLowerCase("es");
                            if (check.checked) seleccionados.add(clave);
                            else seleccionados.delete(clave);
                        };
                        opcion.append(check, el("span", null, grupo));
                        lista.appendChild(opcion);
                    }
                };
                pintarOpciones();
                selector.caja.appendChild(lista);

                const acciones = el("div", "gym-botones");
                const btnCrearGrupo = btn("＋ Crear grupo", null, async () => {
                    const disponibles = normalizarGrupos([...gruposDisponibles, ...(ej.grupos ?? [])]);
                    const escrito = await pedirTexto("Crear grupo", "", disponibles, true);
                    if (escrito === null) return;
                    const limpio = limpiarNombre(escrito);
                    if (!limpio) {
                        toast("⚠️ El nombre del grupo no puede quedar vacío.", false);
                        return;
                    }
                    const existente = disponibles.find(g => g.toLocaleLowerCase("es") === limpio.toLocaleLowerCase("es"));
                    const grupo = existente ?? limpio;
                    gruposDisponibles = normalizarGrupos([...gruposDisponibles, grupo]);
                    seleccionados.add(grupo.toLocaleLowerCase("es"));
                    pintarOpciones();
                });
                const btnCancelar = btn("Cancelar", null, () => selector.cerrar());
                const btnGuardarGrupos = btn("Guardar selección", "primario", () => {
                    const disponibles = normalizarGrupos([...gruposDisponibles, ...(ej.grupos ?? [])]);
                    ej.grupos = disponibles.filter(grupo => seleccionados.has(grupo.toLocaleLowerCase("es")));
                    selector.cerrar();
                    pintarGrupos();
                    pintarTipoDia();
                    limpiarError();
                });
                acciones.append(btnCrearGrupo, btnCancelar, btnGuardarGrupos);
                selector.caja.appendChild(acciones);
            };
            pintarGrupos();
            celda("Grupos", cajaGrupos).c.classList.add("gym-ej-grupos");

            const selTipo = el("select", "gym-mini");
            for (const [v, t] of [["peso", "Peso"], ["tiempo", "Tiempo"], ["intervalo", "Intervalo"]] as const) {
                const o = el("option", null, t); o.value = v; selTipo.appendChild(o);
            }
            selTipo.value = tipoEjercicioDe(ej);
            selTipo.title = "Tipo de ejercicio: peso, tiempo con hold o repeticiones, e intervalos de trabajo y descanso.";
            celda("Tipo", selTipo).c.classList.add("gym-ej-tipo");

            const num = (valor: string | number | null | undefined, min: number, paso: number, titulo: string) => {
                const n = el("input", "gym-mini");
                n.type = "number"; n.min = String(min); n.step = String(paso);
                n.value = valor === null || valor === undefined ? "" : String(valor);
                n.title = titulo;
                return n;
            };
            const inSeries = num(ej.series, 1, 1, "Series objetivo");
            inSeries.oninput = () => { ej.series = Math.max(1, Number(inSeries.value) || 1); };
            const celdaSeries = celda("Series", inSeries);
            celdaSeries.c.classList.add("gym-ej-series");
            const etqSeries = celdaSeries.l;

            const inReps = num(ej.repsObjetivo, 1, 1, "Repeticiones objetivo");
            inReps.oninput = () => { ej.repsObjetivo = Math.max(1, Number(inReps.value) || 1); };

            const selSerie = el("select", "gym-mini");
            for (const [v, t] of [["", "Trabajo"], ["calentamiento", "Calentamiento"], ["descenso", "Descenso"], ["fallo", "Fallo"]] as const) {
                const o = el("option", null, t); o.value = v; selSerie.appendChild(o);
            }
            selSerie.value = ej.tipoSerie ?? "";
            selSerie.title = "Tipo de serie de este ejercicio: cómo se leen sus reps (en «fallo» son al fallo, sin número objetivo).";
            const cReps = el("div", "gym-reps");
            cReps.append(selSerie, inReps);
            const celdaReps = celda("Tipo · Reps", cReps);
            celdaReps.c.classList.add("gym-ej-reps");

            const inDur = num(ej.duracionObjetivo, 1, 1, "Duración del hold (segundos)");
            inDur.oninput = () => { ej.duracionObjetivo = aNumero(inDur.value); };
            const inTrabajo = num(ej.trabajoSeg, 1, 1, "Trabajo de cada ciclo (segundos)");
            inTrabajo.oninput = () => { ej.trabajoSeg = aNumero(inTrabajo.value); };
            const inTrans = num(ej.transicionSeg ?? ej.descansoSeg, 0, 1, "Descanso entre intervalos (segundos)");
            inTrans.oninput = () => { ej.transicionSeg = aNumero(inTrans.value); };
            const cTiempo = el("div", "gym-par");
            cTiempo.append(inDur, inTrabajo, inTrans);
            const celdaTiempo = celda("Duración (s)", cTiempo);
            celdaTiempo.c.classList.add("gym-ej-duracion");
            const etqTiempo = celdaTiempo.l;

            const inPeso = num(pesoACampo(ej.pesoObjetivo), 0, 0.5, `Peso objetivo (${pesoActual()}, opcional)`);
            const celdaPeso = celda(`Peso (${pesoActual()})`, inPeso);
            celdaPeso.c.classList.add("gym-ej-peso");

            inPeso.oninput = () => { ej.pesoObjetivo = pesoAKg(inPeso.value); };

            const modoTiempoPeso = el("label", "display:flex;align-items:center;gap:6px;");
            const chkTiempoPeso = el("input");
            chkTiempoPeso.type = "checkbox";
            chkTiempoPeso.checked = ej.repsPesoDuranteTiempo === true;
            modoTiempoPeso.append(chkTiempoPeso, "Registrar repeticiones y peso durante el tiempo");
            const celdaModoTiempoPeso = celda("Registro cronometrado", modoTiempoPeso);
            celdaModoTiempoPeso.c.classList.add("gym-ej-registro-tiempo");
            chkTiempoPeso.onchange = () => {
                ej.repsPesoDuranteTiempo = chkTiempoPeso.checked;
                if (chkTiempoPeso.checked) ej.repsObjetivo = null;
                pintaCampos();
            };

            const inDesc = num(ej.descansoSeg, 0, 15, "Descanso entre series (segundos)");
            inDesc.oninput = () => { ej.descansoSeg = aNumero(inDesc.value); };
            const celdaDescanso = celda("Descanso (s)", inDesc);
            celdaDescanso.c.classList.add("gym-ej-descanso");

            const inNotas = el("input", "gym-mini"); inNotas.type = "text";
            inNotas.placeholder = "Notas (opcional)"; inNotas.value = ej.notas ?? "";
            inNotas.oninput = () => { ej.notas = inNotas.value; };
            celda("Notas", inNotas).c.classList.add("gym-ej-notas");

            const pintaCampos = () => {
                const t = tipoEjercicioDe(ej);
                if (t === "intervalo" && ej.transicionSeg == null && ej.descansoSeg != null) {
                    ej.transicionSeg = ej.descansoSeg;
                }
                fila.classList.toggle("gym-ej-peso", t === "peso");
                fila.classList.toggle("gym-ej-tiempo", t === "tiempo");
                fila.classList.toggle("gym-ej-tiempo-con-peso",
                    t === "tiempo" && ej.repsPesoDuranteTiempo === true);
                fila.classList.toggle("gym-ej-intervalo", t === "intervalo");

                etqSeries.textContent = t === "intervalo" ? "Ciclos" : "Series";
                inSeries.title = t === "intervalo" ? "Ciclos objetivo (cada ciclo es una serie)" : "Series objetivo";

                celdaReps.c.style.display = t === "peso" ? "" : "none";
                inReps.style.display = t !== "peso" || tipoSerieDe(ej) === "fallo" ? "none" : "";
                inReps.placeholder = "Reps";
                inReps.title = tipoSerieDe(ej) === "fallo"
                    ? "Al fallo no hay reps objetivo: se anota lo hecho en cada serie"
                    : "Repeticiones objetivo";

                celdaTiempo.c.style.display = t === "peso" ? "none" : "";
                celdaPeso.c.style.display =
                    t === "peso" || (t === "tiempo" && ej.repsPesoDuranteTiempo === true) ? "" : "none";
                celdaModoTiempoPeso.c.style.display = t === "tiempo" ? "" : "none";
                chkTiempoPeso.checked = ej.repsPesoDuranteTiempo === true;

                inDesc.title = t === "intervalo"
                    ? "Descanso entre series (segundos)"
                    : "Descanso entre series (segundos)";
                celdaDescanso.c.style.display = t === "intervalo" ? "none" : "";

                etqTiempo.textContent = t === "intervalo" ? "Trabajo · descanso entre intervalos (s)" : "Duración (s)";
                etqTiempo.style.display = t === "peso" ? "none" : "";
                inDur.style.display = t === "tiempo" ? "" : "none";
                inTrabajo.style.display = inTrans.style.display = t === "intervalo" ? "" : "none";
            };
            selTipo.onchange = () => {
                const v = selTipo.value;
                ej.tipoEjercicio = v === "tiempo" || v === "intervalo" ? v : null;
                if (v !== "tiempo") ej.repsPesoDuranteTiempo = false;
                pintaCampos();
            };
            selSerie.onchange = () => {
                const v = selSerie.value;
                ej.tipoSerie = v === "calentamiento" || v === "descenso" || v === "fallo" ? v : null;
                pintaCampos();
            };
            pintaCampos();

            const cBorrar = el("div");
            cBorrar.classList.add("gym-ej-borrar");
            const bBorrar = el("button", "gym-borrar", "🗑");
            bBorrar.type = "button";
            bBorrar.title = "Borrar ejercicio";
            bBorrar.onclick = () => {
                const p = dia.ejercicios.indexOf(ej);
                if (p >= 0) dia.ejercicios.splice(p, 1);
                pintarEjercicios();
                pintarTipoDia();
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
            b.onclick = () => {
                dia.ejercicios.push(ejercicioVacio());
                pintarEjercicios();
                pintarTipoDia();
                limpiarError();
            };
            contEj.appendChild(b);
        };
        pintarEjercicios();
        return cajaDia;
    };

    const unificaDiasSemana = () => {
        const visto = new Set<number>();
        for (const d of estado.dias) {
            d.diasSemana = (d.diasSemana ?? []).filter(n => (visto.has(n) ? false : (visto.add(n), true)));
        }
    };

    const contPlantilla = el("div", null);
    const inPlantillaNombre = el("input", "margin-top:8px;");
    inPlantillaNombre.type = "text";
    inPlantillaNombre.placeholder = "Nombre de la plantilla";
    inPlantillaNombre.value = estado.nombrePlantilla || estado.nombre || "";

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
        inPlantillaNombre.style.display = on ? "" : "none";
    };
    refPintaPlantilla = pintaPlantilla;
    btnPlantilla.onclick = () => {
        estado.comoPlantilla = !estado.comoPlantilla;

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

    const btnGuardar = el("button", "gym-guardar", estado.modo === "editar" ? "💾 Guardar cambios" : "💾 Guardar rutina");
    btnGuardar.type = "button";

    const filaGuardar = el("div", "gym-fila-guardar");
    filaGuardar.appendChild(btnGuardar);

    if (estado.modo !== "editar") {
        const btnLimpiar = el("button", "gym-limpiar", "🧹 Limpiar");
        btnLimpiar.type = "button";
        btnLimpiar.title = "Vacía el formulario y empieza de cero";
        btnLimpiar.onclick = async () => {
            if (!(await confirmar("🧹 Limpiar formulario",
                "¿Vaciar el formulario? Se borra todo lo escrito aquí (nombre, objetivo, fechas, días y ejercicios) para empezar de cero. No se toca ninguna rutina ya guardada.",
                "Vaciar", "Cancelar"))) return;

            estado.nombre = "";
            estado.objetivo = "";
            estado.tipo = "planificada";
            estado.inicio = hoy();
            estado.semanas = CONFIG.SEMANAS_POR_DEFECTO;
            estado.dias = [nuevoDia("A")];
            estado.plantilla = "";
            estado.plantillaOrigen = null;
            estado.comoPlantilla = false;
            estado.nombrePlantilla = "";
            estado.plantillaEditada = false;
            estado.estadoRutina = "activa";
            estado.id = "";
            estado.guardado = false;

            inNombre.value = "";
            selPlantilla.value = "";
            pintarObjetivos();
            pintarTipo();
            inInicio.value = estado.inicio;
            inSemanas.value = String(estado.semanas);
            pintaFin();
            pintaPlantilla();
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
            etiquetasPersonalizadas: normalizarGrupos(d.etiquetasPersonalizadas),
            ejercicios: d.ejercicios.map((e, j) => {

                const t = tipoEjercicioDe(e);
                return {
                    id: e.id || `${slug(d.nombre || "dia")}-${slug(e.nombre || `ej-${j}`)}`,
                    nombre: limpiarNombre(e.nombre),
                    grupos: normalizarGrupos(e.grupos),
                    tipoEjercicio: e.tipoEjercicio ?? null,
                    series: Math.max(1, Number(e.series) || 1),
                    repsObjetivo: t !== "peso" || tipoSerieDe(e) === "fallo"
                        ? null : Math.max(1, Number(e.repsObjetivo) || 1),
                    pesoObjetivo: t === "peso" || (t === "tiempo" && e.repsPesoDuranteTiempo === true)
                        ? e.pesoObjetivo ?? null : null,
                    duracionObjetivo: t === "tiempo" ? Math.max(1, Number(e.duracionObjetivo) || 1) : null,
                    repsPesoDuranteTiempo: t === "tiempo" && e.repsPesoDuranteTiempo === true,
                    descansoSeg: e.descansoSeg ?? null,
                    trabajoSeg: t === "intervalo" ? Math.max(1, Number(e.trabajoSeg) || 1) : null,
                    transicionSeg: t === "intervalo" ? Math.max(0, Number(e.transicionSeg) || 0) : null,
                    notas: e.notas ?? "",
                    tipoSerie: e.tipoSerie ?? null,
                };
            }),
        }));
        const union = [...new Set(dias.flatMap(d => d.diasSemana))].sort();
        const fin = finDesde(estado.inicio, estado.semanas);
        const libre = estado.tipo === "libre";
        return {
            id: idPropuesto(),
            plantillaOrigen: estado.plantillaOrigen ?? null,
            nombre: limpiarNombre(estado.nombre),
            objetivo: estado.objetivo || "",
            tipo: libre ? "libre" : "planificada",
            inicio: estado.inicio,
            fin,
            semanas: estado.semanas,

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
            await escribirRutina(rutina);

            if (estado.comoPlantilla) {
                try {
                    const idPlantilla = uid("plantilla");
                    await escribirPlantilla(limpiarNombre(estado.nombrePlantilla), {
                        ...plantillaDeRutina(rutina),
                        id: idPlantilla,
                    });
                    if (!rutina.plantillaOrigen) {
                        const rutinaConOrigen = { ...rutina, plantillaOrigen: idPlantilla };
                        await escribirRutina(rutinaConOrigen);
                        Object.assign(rutina, rutinaConOrigen);
                    }
                } catch (e: unknown) {
                    toast("⚠️ La rutina se guardó, pero no pude guardar o vincular la plantilla: " + msgError(e), false);
                }
            }

            estado.guardado = true;
            guardando = false;
            delete almacen[claveEstado];
            toast(`✅ Rutina guardada → ${rutaDatosDe(rutina.id)}`);

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

    aplicaTipo();
    repintar();
};

export const crear = async (
    cont: HTMLElement, onGuardado?: (r: Rutina) => void, enHoja = false,
): Promise<void> => {
    await montar({ cont, inicial: null, esEdicion: false, onGuardado, enHoja });
};

export const editar = async (
    cont: HTMLElement, rutina: Rutina,
    onGuardado?: (r: Rutina) => void, enHoja = false,
): Promise<void> => {
    await montar({ cont, inicial: rutina, esEdicion: true, onGuardado, enHoja });
};
