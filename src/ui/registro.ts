/* ═══════════════════════════════════════════════════════════════════════════
   3 · Registro: sesión, anotación y medidas.

   · formularioSesion    → crear o editar una sesión: día → ejercicios →
                           series con reps/peso/descanso → guardar
   · abrirRegistro       → si ese día ya tiene sesiones, ofrece editarlas
   · formularioAnotacion → anotación de un día
   · formularioMedidas   → peso y talla (se guardan siempre en kg y cm)

   (La antigua seccionRegistro desapareció: sus botones viven ahora en el
   carrusel de navegación del dashboard de la rutina.)

   El estado de cada formulario vive en su propia closure (los modales no
   dependen del render de la nota) y al guardar se usa escribirRutina /
   escribirMedidas. El CSS ya está en styles.css: solo van estilos inline.
   ═══════════════════════════════════════════════════════════════════════════ */

import { conf } from "../estado";
import { rutaMedidas } from "../ajustes";
import { CONFIG } from "../config";
import {
    conValor, diaPorId, esLibre, escribirMedidas, escribirRutina, esSaltada,
    esSinRegistrar, nombreDia, serieConDatos, seriesHechas, textoRepsObjetivo,
    totalSaltadas, totalSeries, ultimaMedida, ultimosValores, volumenEjercicio, volumenSesion,
} from "../datos";
import { aNumero, clonarJSON, decimal, esFechaValida, fechaLegible, hoy, horaAhora, msgError } from "../util";
import { pesoACampo, pesoActual, pesoAKg, pesoTexto } from "../unidades";
import type {
    EjercicioDef, EjercicioSesion, LecturaNota, Medida, MedidasDatos,
    ModoReps, Rutina, SerieSesion, Sesion,
} from "../tipos";
import { btn, confirmar, el, modal, ponerX, selectorUnidad, toast } from "./componentes";
import { elegirEjercicio, pedirDescanso, textoDescanso } from "./ejercicios-ui";
import type { Pintar } from "./pintar";

/* ── Tipos de trabajo del formulario ──────────────────────────────────────
   El registro se teclea a mano y la copia de trabajo es más laxa que lo que
   se escribe en disco: el descanso puede quedar en null (= «sin descanso
   propio») y las series en hueco. Al guardar, aNumero() normaliza a
   número | null y lo que sale hacia escribirRutina es SIEMPRE una Sesion. */
interface EjercicioTrabajo {
    ejercicioId: string;
    nombre: string;
    series: SerieSesion[];
    notas?: string;
    descansoSeg?: number | null;
    modoFallo?: ModoReps | null;   // elegido en la sesión guiada: al reeditar
                                   // la sesión se conserva (aquí no se elige)
    sinRegistrar?: boolean;
    pista?: string;
}

interface SesionTrabajo {
    fecha: string;
    diaId: string;
    duracionMin?: number | "";
    anotaciones?: string;
    ejercicios: EjercicioTrabajo[];
    enCurso?: boolean;
    idx?: number;
    transcurridoMs?: number;
}

// Contador para el id del <datalist> del campo «Día de la rutina»: cada
// formulario (crear o editar) monta el suyo, así que el id debe ser único.
let dlDiaN = 0;

/* ══════════════════ Formulario de sesión ══════════════════
   Crear o editar. Precarga los objetivos del día (salvo en edición, donde
   lo que no estaba guardado es que no se hizo). */

export function formularioSesion(
    rutina: Rutina,
    opts: { fecha: string; diaId?: string; sesion?: Sesion },
    pintar: Pintar,
): void {
    const { fecha, diaId, sesion } = opts;
    const esEdicion = Boolean(sesion);
    const m = modal(esEdicion ? "✏️ Editar sesión" : "＋ Registrar sesión", rutina.nombre);
    ponerX(m, esEdicion ? "Cerrar sin guardar los cambios" : "Cerrar sin guardar");
    const cajaF = el("div");
    m.caja.appendChild(cajaF);

    const datos: SesionTrabajo = esEdicion
        ? clonarJSON(sesion as Sesion)
        : {
            fecha: fecha || hoy(),
            diaId: diaId || rutina.dias?.[0]?.id || "",
            duracionMin: "",
            anotaciones: "",
            ejercicios: [],
        };
    // `diaId` SIEMPRE presente, aunque sea vacío: si queda `undefined` JSON lo
    // omite al guardar y luego la reanudación de la sesión guiada (que busca
    // `s.diaId === dia.id`) no encontraría el guardado en curso.
    if (datos.diaId === undefined || datos.diaId === null) datos.diaId = "";

    // Cabecera: fecha, día, duración
    const cab = el("div", "display:flex;gap:10px;flex-wrap:wrap;");
    const cF = el("div", "flex:1;min-width:140px;");
    const inFecha = el("input"); inFecha.type = "date"; inFecha.value = datos.fecha;
    cF.appendChild(el("div", "gym-et", "Fecha")); cF.appendChild(inFecha);
    const cD = el("div", "flex:1;min-width:140px;");
    const nuevaOp = (valor: string, texto: string): HTMLOptionElement => {
        const o = createEl("option");
        o.value = valor; o.textContent = texto;
        return o;
    };
    const libre = esLibre(rutina);
    // Lo que se teclea en la libre es el nombre del día (y el nombre ES el
    // diaId): se recortan los espacios y «Sin día» —la etiqueta que en el
    // antiguo select era la opción vacía— cuenta como sin día asignado.
    const diaTecleado = (bruto: string): string => {
        const t = bruto.trim();
        return t === "Sin día" ? "" : t;
    };
    // ── Campo «Día de la rutina» ────────────────────────────────────────
    // · Planificada → <select> con las jornadas del plan, exactamente igual
    //   que siempre (con la opción extra si el día ya no está en la rutina).
    // · Libre → <input type="text"> + <datalist>: el nombre se teclea DIRECTO,
    //   sin el antiguo diálogo «＋ Nuevo día…», y desplegando el campo se
    //   sugieren los días que ya tienen sesiones (al guardar, un nombre nuevo
    //   se da de alta solo: el nombre es el id, que es lo que lee nombreDia).
    // `selDia` es el control que toque; `valorDia()` lo lee sin importar el tipo.
    let selDia: HTMLSelectElement | HTMLInputElement;
    if (libre) {
        const inDia = el("input");
        inDia.type = "text";
        inDia.placeholder = "Escribe o elige un día";
        const dl = createEl("datalist");
        dl.id = `gym-dia-dl-${++dlDiaN}`;   // id único por formulario (como en pedirTexto)
        const usados = [...new Set((rutina.sesiones ?? []).map(s => s.diaId ?? "").filter(Boolean))];
        if (datos.diaId && !usados.includes(datos.diaId)) usados.push(datos.diaId);
        for (const d of usados) dl.appendChild(nuevaOp(d, d));
        inDia.setAttribute("list", dl.id);
        inDia.value = datos.diaId;
        // Escritura directa: cada tecleo (y la elección del datalist) deja
        // `diaId` listo para el guardado, sin esperar al cambio de foco.
        inDia.oninput = () => { datos.diaId = diaTecleado(inDia.value); };
        cD.appendChild(dl);
        selDia = inDia;
    } else {
        const sel = el("select");
        for (const d of rutina.dias ?? []) sel.appendChild(nuevaOp(d.id, d.nombre));
        if (datos.diaId && ![...(rutina.dias ?? [])].some(d => d.id === datos.diaId)) {
            sel.appendChild(nuevaOp(datos.diaId, `${datos.diaId} (ya no está en la rutina)`));
        }
        sel.value = datos.diaId;
        selDia = sel;
    }
    // Lectura ÚNICA del campo: la comparten la recarga de ejercicios, el
    // onChange y el guardado. La planificada se lee tal cual —el id del plan
    // NO se recorta, podría llevar espacios y rompería la búsqueda por id—.
    const valorDia = (): string => libre ? diaTecleado(selDia.value) : selDia.value;
    cD.appendChild(el("div", "gym-et", "Día de la rutina")); cD.appendChild(selDia);
    const cM = el("div", "flex:0 1 120px;");
    const inMin = el("input"); inMin.type = "number"; inMin.min = "0"; inMin.inputMode = "numeric";
    inMin.value = String(datos.duracionMin ?? "");
    cM.appendChild(el("div", "gym-et", "Duración (min)")); cM.appendChild(inMin);
    cab.appendChild(cF); cab.appendChild(cD); cab.appendChild(cM);
    cajaF.appendChild(cab);

    const contEjercicios = el("div", "margin-top:12px;");
    cajaF.appendChild(contEjercicios);

    // Chip de volumen de cada ejercicio, apuntado por OBJETO (no por posición):
    // así sirve igual en la fila compacta de la libre que en la tarjeta de la
    // planificada, y no se descuadra si cambia el orden de los hijos.
    const volEls = new Map<EjercicioTrabajo, HTMLElement | null>();

    const cAnot = el("div", "gym-fila");
    const inAnot = el("textarea"); inAnot.placeholder = "Anotaciones de la sesión (opcional)"; inAnot.value = datos.anotaciones ?? "";
    cAnot.appendChild(el("div", "gym-et", "Anotaciones"));
    cAnot.appendChild(inAnot);
    cajaF.appendChild(cAnot);

    // Rellena los ejercicios del día con sus objetivos (o con los ya registrados)
    const montarEjercicios = (): void => {
        const dia = diaPorId(rutina, valorDia());
        const definidos = dia?.ejercicios ?? [];
        const previos = new Map<string, EjercicioTrabajo>(
            (datos.ejercicios ?? []).map(e => [e.ejercicioId, e]));

        datos.ejercicios = definidos.map(e => {
            const previo = previos.get(e.id);
            if (previo) return previo;                       // ya tenía datos: se conservan
            const n = Math.max(1, Number(e.series) || 1);
            // Sesión NUEVA: se precarga el objetivo (es un formulario de registro manual,
            // para que ajustes solo lo que cambió). Sesión en EDICIÓN: NO se precarga —
            // si no estaba guardado es que no se hizo, y rellenarlo con el objetivo haría
            // que al guardar se inventaran datos que no existían. En «al fallo» tampoco:
            // ahí no hay número que precargar, cada serie es la que salga.
            const series: SerieSesion[] = Array.from({ length: n }, () => esEdicion
                ? { reps: null, peso: null }
                : { reps: e.modoFallo === "todas" ? null : e.repsObjetivo ?? null, peso: e.pesoObjetivo ?? null });
            const nuevo: EjercicioTrabajo = { ejercicioId: e.id, nombre: e.nombre, series, notas: "" };
            if (esEdicion) nuevo.sinRegistrar = true;
            return nuevo;
        });
        // Ejercicios registrados que ya no están en la rutina: no se rompen
        for (const [id, previo] of previos) if (!definidos.some(e => e.id === id)) datos.ejercicios.push(previo);

        volEls.clear();   // los bloques se crean de nuevo: sus chips también
        contEjercicios.empty();
        datos.ejercicios.forEach(ej => contEjercicios.appendChild(bloqueEjercicio(ej, definidos)));
        if (!datos.ejercicios.length) {
            contEjercicios.appendChild(el("div", "opacity:.65;font-size:.88em;padding:6px 0;",
                esLibre(rutina)
                    ? "Sin ejercicios todavía: añade el primero de lo que has hecho hoy."
                    : "Este día no tiene ejercicios."));
        }
        contEjercicios.appendChild(botonAnadir());
    };

    // ── Fila compacta de una rutina libre ───────────────────────────────
    // Una rutina libre no tiene plan ni días, así que no hay objetivos que
    // enseñar: cada ejercicio va en la MISMA fila que en «Editar rutina»
    // (ejercicio · series · reps · peso · descanso · notas · 🗑).
    // Reps y peso son valores COMUNES a todas las series: si las guardadas no
    // coinciden (p. ej. 12-10-8), los campos salen vacíos y lo que teclees se
    // aplica a todas las que no estén saltadas — nunca se pisa un dato sin que
    // tú escribas, y las series dejas de existir solo si lo pides.
    const filaCompacta = (ej: EjercicioTrabajo): HTMLDivElement => {
        const fila = el("div", "gym-ej-fila");
        const celda = (etiqueta: string, control: HTMLElement, ayuda?: string): HTMLDivElement => {
            const c = el("div");
            if (ayuda) c.title = ayuda;
            c.appendChild(el("label", null, etiqueta));
            c.appendChild(control);
            fila.appendChild(c);
            return c;
        };
        const enRutina = (rutina.dias ?? []).some(d =>
            (d.ejercicios ?? []).some(e => e.id === ej.ejercicioId));
        const pista = ej.pista
            || (enRutina ? "objetivo de otro día de la rutina" : "sin objetivo fijo");

        const pintarSinRegistrar = (): void => { sinReg.hidden = !esSinRegistrar(ej); };
        const marcarHecho = (): void => { delete ej.sinRegistrar; pintarSinRegistrar(); };

        // Ejercicio: el nombre se corrige aquí mismo. El id NO cambia, así que
        // el historial, la progresión y los récords siguen unidos al mismo.
        const inEj = el("input"); inEj.type = "text"; inEj.placeholder = "Ejercicio";
        inEj.value = ej.nombre || ej.ejercicioId;
        inEj.oninput = () => { ej.nombre = inEj.value.trim() || ej.ejercicioId; marcarHecho(); };
        celda("Ejercicio", inEj, `${pista} · cada variante cuenta aparte en el historial`);

        // Series: cuántas has hecho. Si al quitar las últimas tienen datos, se
        // avisa antes: no se pierden tecleados por casualidad.
        const inSeries = el("input"); inSeries.type = "number"; inSeries.min = "1"; inSeries.max = "10";
        inSeries.step = "1"; inSeries.inputMode = "numeric";
        inSeries.value = String(Math.max(1, ej.series.length));
        inSeries.oninput = async () => {
            const obj = Math.max(1, Math.min(10, aNumero(inSeries.value) || 1));
            const actual = ej.series.length;
            if (obj === actual) return;
            if (obj < actual) {
                const fuera = ej.series.slice(obj);
                if (fuera.some(serieConDatos) && !(await confirmar("🗑 Quitar series",
                    `Las últimas ${fuera.length} series tienen datos escritos (reps o peso) y se perderán. ¿Quitarlas igualmente?`,
                    "Quitarlas", "Cancelar"))) {
                    inSeries.value = String(Math.max(1, actual));
                    return;
                }
                ej.series.length = obj;   // se corta por la cola: dejan de existir
            } else {
                for (let i = actual; i < obj; i++) ej.series.push({ reps: null, peso: null });
            }
            inSeries.value = String(obj);
            marcarHecho(); actualizaVol();
        };
        celda("Series", inSeries, "Series hechas de este ejercicio");

        // Valor común a todas las series (null si no coinciden → campo vacío)
        const comun = (campo: "reps" | "peso"): number | null | undefined => {
            const vals = ej.series.filter(s => !esSaltada(s)).map(s => s?.[campo]);
            return vals.length && vals.every(v => (v ?? "") === (vals[0] ?? "")) ? vals[0] : null;
        };
        const aplicaComun = (campo: "reps" | "peso", v: number | null): void => {
            if (!ej.series.length) ej.series.push({ reps: null, peso: null });
            for (const s of ej.series) if (!esSaltada(s)) s[campo] = v;
            marcarHecho(); actualizaVol();
        };

        const inReps = el("input"); inReps.type = "number"; inReps.min = "0"; inReps.step = "1";
        inReps.inputMode = "numeric"; inReps.placeholder = "Reps";
        inReps.value = comun("reps") == null ? "" : String(comun("reps"));
        inReps.oninput = () => aplicaComun("reps", aNumero(inReps.value));
        celda("Reps", inReps, "Repeticiones en todas las series (si varían, se vacía y lo que escribas se aplica a todas)");

        const inPeso = el("input"); inPeso.type = "number"; inPeso.min = "0"; inPeso.step = "0.5";
        inPeso.inputMode = "decimal"; inPeso.placeholder = `peso (${pesoActual()})`;
        inPeso.value = pesoACampo(comun("peso"));   // se teclea en la unidad activa, se guarda en kg
        inPeso.oninput = () => aplicaComun("peso", pesoAKg(inPeso.value));
        celda(`Peso (${pesoActual()})`, inPeso, "Peso en todas las series, en la unidad activa (en el archivo se guarda siempre en kg)");

        const descSeg = (): number => Number(ej.descansoSeg) > 0 ? Math.round(Number(ej.descansoSeg)) : 0;
        const inDesc = el("input"); inDesc.type = "number"; inDesc.min = "0"; inDesc.step = "15";
        inDesc.inputMode = "numeric"; inDesc.placeholder = "90";
        inDesc.value = descSeg() ? String(descSeg()) : "";
        inDesc.oninput = () => {
            const v = aNumero(inDesc.value) ?? 0;
            ej.descansoSeg = v > 0 ? Math.round(v) : null;   // vacío o 0 = sin descanso propio
            marcarHecho();
        };
        celda("Descanso (s)", inDesc, "Segundos de descanso entre series (vacío = sin descanso fijado)");

        const inNotas = el("input"); inNotas.type = "text"; inNotas.placeholder = "Notas (opcional)";
        inNotas.value = ej.notas ?? "";
        inNotas.oninput = () => { ej.notas = inNotas.value; marcarHecho(); };
        celda("Notas", inNotas);

        const cBorrar = el("div");
        const bBorrar = el("button", "gym-borrar", "🗑");
        bBorrar.type = "button";
        bBorrar.title = "Quitar este ejercicio de la sesión";
        bBorrar.onclick = async () => {
            const escrito = (ej.series ?? []).some(serieConDatos) || String(ej.notas ?? "").trim();
            if (escrito && !(await confirmar("🗑 Quitar ejercicio",
                `«${ej.nombre || ej.ejercicioId}» tiene datos escritos en esta sesión. ¿Quitarlo del registro?`,
                "Quitar", "Cancelar"))) return;
            const p = datos.ejercicios.indexOf(ej);
            if (p >= 0) datos.ejercicios.splice(p, 1);
            montarEjercicios(); actualizaVol();
        };
        cBorrar.appendChild(bBorrar);
        fila.appendChild(cBorrar);

        // Debajo, en una línea: el volumen en vivo, la referencia de la última
        // vez y el aviso de «sin registrar» (la misma info de antes, en tarjeta).
        // Ocupa el ancho entero: es una fila más del grid, no una columna.
        const nota = el("div", "grid-column:1 / -1;display:flex;gap:8px;flex-wrap:wrap;align-items:center;" +
            "font-size:.75em;opacity:.7;margin:2px 2px 0;");
        const spanVol = el("span", null, "–");
        nota.appendChild(spanVol);
        nota.appendChild(el("span", null, pista));
        const sinReg = el("span", "gym-sinreg", "⏳ sin registrar");
        nota.appendChild(sinReg);
        fila.appendChild(nota);
        volEls.set(ej, spanVol);
        pintarSinRegistrar();
        return fila;
    };

    const bloqueEjercicio = (ej: EjercicioTrabajo, definidos: EjercicioDef[]): HTMLElement => {
        // La rutina libre va en fila compacta (lo de «Editar rutina»): no hay
        // objetivos del día ni series que detallar una a una.
        if (esLibre(rutina)) return filaCompacta(ej);
        const def = definidos.find(e => e.id === ej.ejercicioId);
        const box = el("div", "gym-ej-reg");
        const cabE = el("div", "gym-ej-reg-cab");
        // El chip solo dice «objetivo» cuando lo hay de verdad (el del día). Si el
        // ejercicio no está en ese día —que es lo normal en una rutina libre, que
        // no tiene plan—, se enseña la pista de este formulario y, si ya no queda
        // ninguna (una sesión guardada), que no tiene objetivo fijo: el «ya no está
        // en la rutina» solo aplica al que estuvo en otra jornada y ya salió.
        const enRutina = (rutina.dias ?? []).some(d =>
            (d.ejercicios ?? []).some(e => e.id === ej.ejercicioId));
        const chipObj = el("span", "gym-chip", def
            ? `objetivo ${def.series}×${textoRepsObjetivo(def)}${def.pesoObjetivo ? ` @ ${pesoTexto(def.pesoObjetivo)}` : ""}`
            : ej.pista
                ? ej.pista
                : enRutina
                    ? "objetivo de otro día de la rutina"
                    : "sin objetivo fijo");
        // Descanso: el elegido al añadir el ejercicio; si no, el del plan del día.
        // El chip es tocable: así se corrige sin tener que quitar y reañadir.
        const descSeg = (): number => Number(ej.descansoSeg) > 0 ? Number(ej.descansoSeg)
            : Number(def?.descansoSeg) > 0 ? Number(def?.descansoSeg) : 0;
        const chipDesc = el("span", "gym-chip gym-puntero", textoDescanso(descSeg()) + " ");
        chipDesc.title = "Tocar para cambiar el descanso";
        const chipVol = el("span", "gym-chip", "–");
        const chipNoReg = el("span", "gym-chip gym-sinreg", "⏳ sin registrar");
        chipNoReg.hidden = true;
        const filaChips = el("div", null);
        filaChips.append(chipObj, chipDesc, chipVol, chipNoReg);
        cabE.append(
            el("div", "gym-ej-nombre", ej.nombre || ej.ejercicioId),
            filaChips,
        );
        chipDesc.onclick = async () => {
            const v = await pedirDescanso(descSeg());
            if (v == null) return;
            // Vacío o 0 = sin descanso propio: el chip vuelve a mirar el del plan
            ej.descansoSeg = v > 0 ? Math.round(v) : null;
            const n = ej.descansoSeg ?? (Number(def?.descansoSeg) > 0 ? Number(def?.descansoSeg) : 0);
            chipDesc.textContent = textoDescanso(n) + " ";
            marcarHecho();   // cambiar el descanso cuenta como tocar la sesión
        };
        box.appendChild(cabE);
        volEls.set(ej, chipVol);   // volumen en vivo (misma idea que en la fila compacta)
        // El distintivo "sin registrar" se apaga en cuanto hay algo que cuente
        const pintarEstado = (): void => { chipNoReg.hidden = !esSinRegistrar(ej); };
        const marcarHecho = (): void => { delete ej.sinRegistrar; pintarEstado(); };
        pintarEstado();   // refleja el estado inicial (puede venir sinRegistrar de la sesión guardada)

        const lista = el("div");
        box.appendChild(lista);
        const pintarSeries = (): void => {
            lista.empty();
            ej.series.forEach((s, i) => {
                const saltada = esSaltada(s);
                const f = el("div", "gym-serie" + (saltada ? " saltada" : ""));
                const cN = el("div", "gym-serie-num" + (saltada ? " gym-tachado" : ""), `${i + 1}`);
                f.appendChild(cN);
                const r = el("input"); r.type = "number"; r.min = "0"; r.step = "1"; r.inputMode = "numeric";
                // Con mínimo al fallo el hueco recuerda cuánto era lo mínimo
                r.placeholder = def?.modoFallo === "minimo" && def.repsObjetivo ? `mín. ${def.repsObjetivo}` : "Reps";
                r.value = String(s.reps ?? "");
                r.oninput = () => { s.reps = aNumero(r.value); if (conValor(r.value)) marcarHecho(); actualizaVol(); };
                const p = el("input"); p.type = "number"; p.min = "0"; p.step = "0.5"; p.inputMode = "decimal";
                // Se teclea en la unidad activa; s.peso sigue guardándose en kg
                p.placeholder = `peso (${pesoActual()})`; p.value = pesoACampo(s.peso);
                p.oninput = () => { s.peso = pesoAKg(p.value); if (conValor(p.value)) marcarHecho(); actualizaVol(); };
                if (saltada) {   // serie saltada: sus campos no se editan, solo se puede rehacer
                    r.disabled = p.disabled = true;
                    r.placeholder = p.placeholder = "Saltada";
                }
                const b = el("button", "gym-mini", saltada ? "↩" : "×");
                b.type = "button";
                b.title = saltada ? "Rehacer serie (vuelve a estar pendiente)"
                    : "Marcar serie como saltada: queda en el registro aunque no la hayas hecho";
                b.onclick = () => {
                    if (saltada) { delete s.saltada; }   // rehacer: recupera sus datos y vuelve a editarse
                    else { s.saltada = true; }           // saltar: ocupa su hueco, no se borra
                    pintarSeries(); actualizaVol();
                };
                f.appendChild(r); f.appendChild(p); f.appendChild(b);
                lista.appendChild(f);
            });
            const mas = el("button", "gym-mini", "＋ serie");
            mas.type = "button";
            mas.onclick = () => { ej.series.push({ reps: null, peso: null }); pintarSeries(); };
            lista.appendChild(mas);
        };
        pintarSeries();

        const cNotas = el("div", "margin-top:6px;");
        const inNotas = el("input"); inNotas.type = "text"; inNotas.placeholder = "Notas de este ejercicio (opcional)";
        inNotas.value = ej.notas ?? "";
        inNotas.oninput = () => { ej.notas = inNotas.value; if (inNotas.value.trim()) marcarHecho(); };
        cNotas.appendChild(inNotas);
        box.appendChild(cNotas);
        return box;
    };

    // Añadir un ejercicio que NO esté predefinido: es lo que permite que una
    // rutina libre anote variantes de un día para otro (barra una semana,
    // mancuernas la siguiente). Cada variante es su propio ejercicio, con su
    // id y su historial aparte, y se guarda igual que los del plan.
    const botonAnadir = (): HTMLButtonElement => {
        const b = el("button", "gym-btn gym-btn-anadir", "＋ Añadir ejercicio");
        b.type = "button";
        b.title = "Elige uno que ya hayas hecho o escribe uno nuevo: cada variante cuenta aparte";
        b.onclick = async () => {
            const r = await elegirEjercicio(rutina, { excluir: (datos.ejercicios ?? []).map(e => e.ejercicioId) });
            if (!r) return;
            const u = ultimosValores(rutina, r.id);
            const n = Math.max(1, Math.min(10, Number(u?.series) || 1));
            // Series VACÍAS a propósito: en ESTE formulario lo que se teclea se
            // guarda tal cual, así que precargar el peso de la última vez podría
            // dejar registrado como hecho algo que no se hizo. La referencia de la
            // última vez va en la cabecera, donde solo se lee.
            const nuevo: EjercicioTrabajo = {
                ejercicioId: r.id, nombre: r.nombre, notas: "",
                pista: u ? `última vez: ${u.reps ?? "–"} × ${pesoTexto(u.peso)} · ${fechaLegible(u.fecha)}`
                        : "ejercicio nuevo · sin registros",
                series: Array.from({ length: n }, () => ({ reps: null, peso: null })),
            };
            // Descanso elegido en el selector: se guarda con la sesión (sin 0:
            // no apetece un campo «descanso: 0» que luego se ignora igual).
            if (r.descansoSeg > 0) nuevo.descansoSeg = r.descansoSeg;
            datos.ejercicios.push(nuevo);
            montarEjercicios();
            actualizaVol();
        };
        return b;
    };

    const actualizaVol = (): void => {
        for (const ej of datos.ejercicios ?? []) {
            const chip = volEls.get(ej);
            if (chip) chip.textContent = pesoTexto(volumenEjercicio(ej));
        }
    };

    selDia.onchange = async () => {
        // En la libre el nombre ya se ha tecleado DIRECTO en el campo (el
        // oninput mantiene diaId): aquí solo se asienta. En la planificada se
        // pide confirmación antes de recargar los ejercicios del nuevo día.
        const recargar = !libre;   // en la libre no hay objetivos que recargar
        if (recargar && (datos.ejercicios ?? []).length &&
            !(await confirmar("📅 Cambiar de día",
                "¿Cambiar de día? Se recargan los ejercicios de ese día (lo que hayas escrito se mantiene para los que coincidan).",
                "Sí, cambiar", "No, quedarme"))) {
            selDia.value = datos.diaId;
            return;
        }
        datos.diaId = valorDia();
        if (recargar) montarEjercicios();
    };

    montarEjercicios();
    actualizaVol();

    const acciones = el("div", "gym-botones");
    const guardar = el("button", "gym-btn primario", esEdicion ? "💾 Guardar cambios" : "💾 Guardar sesión");
    guardar.type = "button";
    guardar.onclick = async () => {
        const f = inFecha.value;
        if (!esFechaValida(f)) return toast("⚠️ La fecha no es válida.", false);
        const completos = (datos.ejercicios ?? []).filter(e => seriesHechas(e).some(serieConDatos));
        if (!completos.length && !(await confirmar("📭 Sesión vacía",
            "No has metido ni una repetición ni un peso. ¿Guardar la sesión vacía?",
            "Sí, guardar", "No, cancelar"))) return;

        const nueva: Sesion = {
            fecha: f,
            // `valorDia()` normaliza lo tecleado en la libre; `|| ""` es deliberado:
            // con undefined la clave NO se serializa y luego la reanudación de la
            // sesión guiada no encontraría el guardado en curso.
            diaId: valorDia() || "",
            duracionMin: aNumero(inMin.value) ?? "",
            anotaciones: inAnot.value.trim(),
            ejercicios: (datos.ejercicios ?? []).map(e => {
                const serie = (e.series ?? [])
                    .filter(s => esSaltada(s) || serieConDatos(s))   // ni saltadas ni vacías
                    .map(s => esSaltada(s)
                        ? { saltada: true }
                        : { reps: aNumero(s.reps), peso: aNumero(s.peso) });
                const out: EjercicioSesion = { ejercicioId: e.ejercicioId, nombre: e.nombre, notas: e.notas ?? "", series: serie };
                // El descanso elegido al añadir el ejercicio viaja con la sesión:
                // así la próxima vez el selector lo trae ya puesto.
                if (Number(e.descansoSeg) > 0) out.descansoSeg = Math.round(Number(e.descansoSeg));
                // El modo de reps elegido en la sesión guiada también viaja: al
                // reeditar la sesión no se pierde (en ESTE formulario no se elige)
                if (e.modoFallo === "todas" || e.modoFallo === "minimo") out.modoFallo = e.modoFallo;
                // Se conserva la marca de "no hecho" para que el registro siga cuadrando con el plan
                if (esSinRegistrar(e) || (!serie.length && !out.notas)) out.sinRegistrar = true;
                return out;
            }).filter(e => e.series.length || e.notas || e.sinRegistrar),
        };

        // Reanudar la sesión en curso: si lo que se edita es el guardado a
        // mitad de sesión de la sesión guiada, la marca de progreso viaja con
        // él (enCurso, idx y transcurridoMs) y no se pierde el punto de reanudación.
        if (sesion?.enCurso) {
            nueva.enCurso = true;
            nueva.idx = sesion.idx;
            nueva.transcurridoMs = sesion.transcurridoMs;
        }

        try {
            if (esEdicion) {
                const i = sesion ? rutina.sesiones.indexOf(sesion) : -1;
                if (i >= 0) rutina.sesiones[i] = nueva; else rutina.sesiones.push(nueva);
            } else rutina.sesiones.push(nueva);
            rutina.sesiones.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
            await escribirRutina(rutina);
            m.cerrar();
            toast(`✅ Sesión del ${fechaLegible(f)} guardada`);
            void pintar();
        } catch (e: unknown) {
            console.error("[Gym Stone sesión]", e);
            toast("⚠️ No pude guardar: " + msgError(e), false);
        }
    };
    acciones.appendChild(guardar);
    acciones.appendChild(btn("Cancelar", "", () => m.cerrar()));
    cajaF.appendChild(acciones);
}

/* ══════════════════ Abrir el registro de un día ══════════════════
   Abre el formulario de sesión SIN borrar de vista lo ya guardado.
   Si ese día ya tiene registros, se ofrecen para editar: si no, "＋ Registrar sesión"
   creaba una sesión en blanco y los datos de la sesión guiada no se veían por ningún sitio. */
export function abrirRegistro(
    rutina: Rutina,
    opts: { fecha: string; diaId?: string },
    pintar: Pintar,
    alCerrar?: () => void,
): void {
    const { fecha, diaId } = opts;
    const f = fecha || hoy();
    const existentes = (rutina.sesiones ?? []).filter(s => s.fecha === f);
    const cerrarPadre = (): void => { if (alCerrar) alCerrar(); };

    if (!existentes.length) {
        cerrarPadre();
        return formularioSesion(rutina, { fecha: f, diaId }, pintar);
    }

    const m = modal("⚡ Sesiones del día", `${fechaLegible(f)} · ${existentes.length} ya registrada${existentes.length > 1 ? "s" : ""}`);
    ponerX(m, "Cerrar");
    const fila = el("div", "gym-botones");
    for (const s of existentes) {
        const nom = nombreDia(rutina, s.diaId);
        const nSer = totalSeries(s);
        const nSal = totalSaltadas(s);
        const nSin = (s.ejercicios ?? []).filter(esSinRegistrar).length;
        const detalle = [
            `${nSer} series`,
            pesoTexto(volumenSesion(s)),
            nSal ? `⏭ ${nSal} saltada${nSal > 1 ? "s" : ""}` : "",
            nSin ? `⏳ ${nSin} sin registrar` : "",
        ].filter(Boolean).join(" · ");
        fila.appendChild(btn(`✏️ Editar — ${nom}`, "primario", () => {
            cerrarPadre();
            formularioSesion(rutina, { fecha: f, sesion: s }, pintar);
        }));
        fila.appendChild(el("div", "font-size:.8em;opacity:.7;margin:-4px 0 8px;", detalle));
    }
    m.caja.appendChild(fila);
    m.caja.appendChild(btn("＋ Añadir otra sesión para ese día", "", () => {
        cerrarPadre();
        formularioSesion(rutina, { fecha: f, diaId: existentes[0]?.diaId ?? diaId }, pintar);
    }));
    m.caja.appendChild(btn("Cancelar", "", () => m.cerrar()));
}

/* ══════════════════ Anotación de un día ══════════════════ */

export function formularioAnotacion(rutina: Rutina, fecha: string, pintar: Pintar): void {
    const m = modal("📝 Añadir anotación", fechaLegible(fecha));
    const cF = el("div", "gym-fila");
    const inFecha = el("input"); inFecha.type = "date"; inFecha.value = fecha;
    cF.appendChild(el("div", "gym-et", "Fecha")); cF.appendChild(inFecha);
    m.caja.appendChild(cF);
    const cT = el("div", "gym-fila");
    const inTxt = el("textarea"); inTxt.placeholder = "Ejemplo: hombro molesto, dormí mal, gym lleno…";
    cT.appendChild(el("div", "gym-et", "Anotación"));
    cT.appendChild(inTxt);
    m.caja.appendChild(cT);
    const acciones = el("div", "gym-botones");
    const ok = el("button", "gym-btn primario", "💾 Guardar");
    ok.type = "button";
    ok.onclick = async () => {
        const t = inTxt.value.trim();
        if (!t) return toast("⚠️ La anotación está vacía.", false);
        if (!esFechaValida(inFecha.value)) return toast("⚠️ La fecha no es válida.", false);
        try {
            rutina.notasDia = rutina.notasDia ?? [];
            rutina.notasDia.push({ fecha: inFecha.value, texto: t, hora: horaAhora() });
            await escribirRutina(rutina);
            m.cerrar();
            toast("✅ Anotación guardada");
            void pintar();
        } catch (e: unknown) {
            console.error("[Gym Stone anotación]", e);
            toast("⚠️ No pude guardar la anotación: " + msgError(e), false);
        }
    };
    acciones.appendChild(ok);
    acciones.appendChild(btn("Cancelar", "", () => m.cerrar()));
    m.caja.appendChild(acciones);
}

/* ══════════════════ Peso y talla ══════════════════
   Se teclea en la unidad activa y en disco (registro.pesoKg / tallaCm) queda
   SIEMPRE en kg y cm. */

export function formularioMedidas(medidas: LecturaNota<MedidasDatos>, pintar: Pintar): void {
    const m = modal("⚖️ Peso y talla", `se guardan en ${rutaMedidas()}`);
    const u = ultimaMedida(medidas.datos);
    const cF = el("div", "display:flex;gap:10px;flex-wrap:wrap;");
    const cFecha = el("div", "flex:1;min-width:140px;");
    const inFecha = el("input"); inFecha.type = "date"; inFecha.value = hoy();
    cFecha.appendChild(el("div", "gym-et", "Fecha")); cFecha.appendChild(inFecha);
    const cPeso = el("div", "flex:1;min-width:120px;");
    const inPeso = el("input"); inPeso.type = "number"; inPeso.step = "0.1"; inPeso.inputMode = "decimal";
    // Se teclea en la unidad activa; en disco (registro.pesoKg) siempre kg
    inPeso.placeholder = u.pesoKg != null ? pesoACampo(u.pesoKg) : "";
    inPeso.value = pesoACampo(u.pesoKg);
    const etPeso = el("div", "gym-et", `Peso (${pesoActual()})`);
    cPeso.appendChild(etPeso); cPeso.appendChild(inPeso);
    const cTalla = el("div", "flex:1;min-width:120px;");
    const inTalla = el("input"); inTalla.type = "number"; inTalla.step = "0.5"; inTalla.inputMode = "decimal";
    inTalla.placeholder = String(u.tallaCm ?? "vacío = la última"); inTalla.value = String(u.tallaCm ?? "");
    cTalla.appendChild(el("div", "gym-et", `Talla (${conf().unidadTalla})`)); cTalla.appendChild(inTalla);
    // Alternar el peso entre kg y lb (lo mismo que en el resto de formularios)
    const cUnidad = el("div", "flex:0 0 auto;");
    cUnidad.appendChild(el("div", "gym-et", "Unidad del peso"));
    let unidadVigente = pesoActual();     // unidad en la que está tecleado el valor
    cUnidad.appendChild(selectorUnidad(() => {
        // El campo sigue con el valor de la unidad ANTERIOR: se pasa a kg y se
        // vuelve a teclear en la nueva (así el guardado no pierde decimales)
        const n = aNumero(inPeso.value);
        if (n !== null) {
            const kg = unidadVigente === "lb" ? Math.round((n / CONFIG.LB_POR_KG) * 100) / 100 : n;
            inPeso.value = pesoACampo(kg);
            inPeso.placeholder = pesoACampo(u.pesoKg);
        }
        unidadVigente = pesoActual();
        etPeso.textContent = `Peso (${pesoActual()})`;
        pintaIMC();
    }));
    cF.appendChild(cFecha); cF.appendChild(cPeso); cF.appendChild(cUnidad); cF.appendChild(cTalla);
    m.caja.appendChild(cF);

    const cNota = el("div", "gym-fila");
    const inNota = el("input"); inNota.type = "text"; inNota.placeholder = "Nota opcional";
    cNota.appendChild(el("div", "gym-et", "Nota"));
    cNota.appendChild(inNota);
    m.caja.appendChild(cNota);

    const ayuda = el("div", "font-size:.8em;opacity:.7;margin-bottom:10px;");
    ayuda.textContent = "La talla cambia poco: si la dejas vacío se hereda de la última medida y no hace falta repetirla.";
    m.caja.appendChild(ayuda);

    const linea = el("div", "font-size:.85em;margin-bottom:10px;");
    const pintaIMC = (): void => {
        // El IMC se calcula SIEMPRE en kg (peso guardado), no en la unidad mostrada
        const p = pesoAKg(inPeso.value), t = aNumero(inTalla.value) ?? (u.tallaCm ? Number(u.tallaCm) : null);
        if (p && t) {
            linea.textContent = "Imc resultante: ";
            linea.append(el("b", null, decimal(p / Math.pow(t / 100, 2))));
        } else linea.textContent = "";
    };
    inPeso.oninput = pintaIMC;
    inTalla.oninput = pintaIMC;
    pintaIMC();
    m.caja.appendChild(linea);

    const acciones = el("div", "gym-botones");
    const ok = el("button", "gym-btn primario", "💾 Guardar medida");
    ok.type = "button";
    ok.onclick = async () => {
        // Si el campo sigue con el valor precargado, no se reconvierte:
        // así un peso que no se ha tocado no pierde decimales al guardarse
        const sinTocar = inPeso.value === pesoACampo(u.pesoKg) && u.pesoKg != null;
        const peso = sinTocar ? Number(u.pesoKg) : pesoAKg(inPeso.value);
        const talla = aNumero(inTalla.value);
        if (peso === null && talla === null) return toast("⚠️ Escribe al menos el peso o la talla.", false);
        if (!esFechaValida(inFecha.value)) return toast("⚠️ La fecha no es válida.", false);
        medidas.datos!.registros = medidas.datos!.registros ?? [];
        const existente = medidas.datos!.registros.find(r => r.fecha === inFecha.value);
        const registro: Medida = existente ?? { fecha: inFecha.value };
        if (peso !== null) registro.pesoKg = peso;
        if (talla !== null) registro.tallaCm = talla;
        else if (u.tallaCm) registro.tallaCm = u.tallaCm;     // hereda la última talla
        registro.notas = inNota.value.trim();
        if (!existente) medidas.datos!.registros.push(registro);
        try {
            await escribirMedidas(medidas.datos!);
            m.cerrar();
            toast(`✅ Medida guardada: ${pesoTexto(registro.pesoKg)}`);
            void pintar();
        } catch (e: unknown) { toast("⚠️ No pude guardar la medida: " + msgError(e), false); }
    };
    acciones.appendChild(ok);
    acciones.appendChild(btn("Cancelar", "", () => m.cerrar()));
    m.caja.appendChild(acciones);
}
