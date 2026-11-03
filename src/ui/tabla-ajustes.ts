import { App, PluginSettingTab, Setting } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import type GymStone from "../main";
import { normalizarAjustes, type AjustesGym } from "../ajustes";
import { actualizarAjustes, conf } from "../estado";
import { refrescarDespierta } from "../despierta";
import { toast } from "./componentes";
import { probarSonido } from "./sonido";
import { fijarUnidadPeso, pesoActual } from "../unidades";

interface AppConAjustes extends App {
    setting: {
        open(): void;
        openTabById(id: string): void;
    };
}

export function abrirAjustesOpcionesRapidas(app: App): boolean {
    const ajustes = (app as AppConAjustes).setting;
    if (!ajustes || typeof ajustes.open !== "function" || typeof ajustes.openTabById !== "function") {
        console.error("[Gym Stone] La API para abrir los ajustes de Obsidian no está disponible.");
        toast("No se pudieron abrir los ajustes de opciones rápidas.", false);
        return false;
    }
    ajustes.open();
    ajustes.openTabById("gym-stone");
    window.setTimeout(() => {
        document.querySelector<HTMLElement>(".gym-ajustes-opciones-rapidas-setting")
            ?.scrollIntoView({ block: "center" });
    }, 0);
    return true;
}

export class GymStoneTab extends PluginSettingTab {
    constructor(app: App, private readonly pluginRef: GymStone) {
        super(app, pluginRef);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass("gym-ajustes");

        new Setting(containerEl)
            .setName("Carpeta raíz")
            .setDesc("Carpeta donde se guardan los datos del plugin. Cambiarla no mueve los archivos existentes.")
            .addText(t => t.setPlaceholder("Gym-stone")
                .setValue(conf().carpetaRaiz)
                .onChange(async v => this.guardar("carpetaRaiz", v)));

        new Setting(containerEl)
            .setName("Unidad de talla")
            .setDesc("Unidad en la que se muestra la talla. Los datos se guardan en centímetros.")
            .addDropdown(d => d.addOption("cm", "Cm").addOption("in", "In")
                .setValue(conf().unidadTalla)
                .onChange(async v => this.guardar("unidadTalla", v as "cm" | "in")));

        new Setting(containerEl)
            .setName("Unidad de peso")
            .setDesc("Unidad para mostrar e introducir el peso. Los datos se guardan en kilogramos.")
            .addDropdown(d => d.addOption("kg", "Kilogramos (kg)")
                .addOption("lb", "Libras (lb)")
                .setValue(pesoActual())
                .onChange(u => this.fijarPeso(u)));

        new Setting(containerEl)
            .setName("Mantener la pantalla encendida")
            .setDesc("Evita que la pantalla se apague mientras corre un temporizador. Se libera al pausar o parar.")
            .addToggle(t => t.setValue(conf().mantenerDespierta)
                .onChange(async v => this.guardar("mantenerDespierta", v)));

        const seccionSonido = containerEl.createDiv("gym-ajustes-sonido");
        new Setting(seccionSonido)
            .setName("Sonido")
            .setHeading();

        new Setting(seccionSonido)
            .setName("Sonido del temporizador")
            .setDesc("Reproduce un pitido al terminar el temporizador libre.")
            .addToggle(t => t.setValue(conf().sonidoTemporizador)
                .onChange(async v => this.guardar("sonidoTemporizador", v)));

        new Setting(seccionSonido)
            .setName("Sonido del descanso")
            .setDesc("Reproduce un pitido y vibra al terminar un descanso de la sesión guiada.")
            .addToggle(t => t.setValue(conf().sonidoDescanso)
                .onChange(async v => this.guardar("sonidoDescanso", v)));

        new Setting(seccionSonido)
            .setName("Tipo de sonido")
            .setDesc("Elige la forma de onda del sintetizador.")
            .addDropdown(d => d
                .addOption("sine", "Senoidal · suave")
                .addOption("triangle", "Triangular · redonda")
                .addOption("square", "Cuadrada · marcada")
                .addOption("sawtooth", "Diente de sierra · brillante")
                .setValue(conf().formaOndaSonido)
                .onChange(async v => {
                    if (v === "sine" || v === "triangle" || v === "square" || v === "sawtooth") {
                        await this.guardar("formaOndaSonido", v);
                    }
                }));

        new Setting(seccionSonido)
            .setName("Patrón del aviso")
            .setDesc("Elige la secuencia de notas al terminar.")
            .addDropdown(d => d
                .addOption("clasico", "Tres notas")
                .addOption("unico", "Pitido único")
                .addOption("ascendente", "Ascendente")
                .addOption("doble", "Doble")
                .setValue(conf().patronSonido)
                .onChange(async v => {
                    if (v === "clasico" || v === "unico" || v === "ascendente" || v === "doble") {
                        await this.guardar("patronSonido", v);
                    }
                }));

        this.mostrarFrecuencias(
            new Setting(seccionSonido),
            conf().frecuenciasSonido,
        );

        new Setting(seccionSonido)
            .setName("Avisos de cuenta atrás")
            .setDesc("Pitidos en los últimos segundos del temporizador o descanso.")
            .addDropdown(d => d
                .addOption("0", "Desactivados")
                .addOption("3", "Últimos 3 segundos")
                .addOption("5", "Últimos 5 segundos")
                .setValue(String(conf().avisosCuentaAtras))
                .onChange(async v => {
                    const segundos = Number(v);
                    if (segundos === 0 || segundos === 3 || segundos === 5) {
                        await this.guardar("avisosCuentaAtras", segundos);
                    }
                }));

        new Setting(seccionSonido)
            .setName("Volumen del sonido")
            .setDesc("Volumen común para los avisos del temporizador y del descanso.")
            .addSlider(s => s.setLimits(0, 100, 5)
                .setValue(conf().volumenSonido)
                .onChange(async v => this.guardar("volumenSonido", v)));

        new Setting(seccionSonido)
            .setName("Probar el sonido")
            .setDesc("Reproduce el aviso con el volumen actual.")
            .addButton(b => b.setButtonText("🔊 Probar")
                .setTooltip("Probar el sonido")
                .onClick(() => probarSonido()));

        this.mostrarOpcionesRapidas(
            new Setting(containerEl),
            conf().opcionesRapidasTemporizador,
        );
    }

    private mostrarOpcionesRapidas(setting: Setting, valores: number[]): void {
        setting
            .setName("Opciones rápidas del temporizador")
            .setDesc("Una duración por casilla. Formato: minutos:segundos (3:00).");
        setting.settingEl.addClass("gym-ajustes-opciones-rapidas-setting");
        setting.controlEl.addClass("gym-ajustes-controles");
        setting.controlEl.empty();
        const lista = setting.controlEl.createDiv("gym-ajustes-opciones-rapidas");
        type FilaRapida = { fila: HTMLElement; etiqueta: HTMLElement; entrada: HTMLInputElement };
        const filas: FilaRapida[] = [];

        const actualizarNombres = (): void => {
            filas.forEach((fila, i) => {
                fila.etiqueta.textContent = `Opción rápida ${i + 1}`;
                fila.entrada.setAttribute("aria-label", `Duración de la opción rápida ${i + 1}`);
            });
        };
        const ordenarFilas = (): void => {
            filas.sort((a, b) => {
                const duracionA = this.leerDuracion(a.entrada.value) ?? Number.POSITIVE_INFINITY;
                const duracionB = this.leerDuracion(b.entrada.value) ?? Number.POSITIVE_INFINITY;
                return duracionA === duracionB ? 0 : duracionA < duracionB ? -1 : 1;
            });
            filas.forEach(fila => lista.appendChild(fila.fila));
            actualizarNombres();
        };
        const añadirFila = (ms: number): FilaRapida => {
            const elementoFila = lista.createDiv("gym-ajuste-opcion");
            const etiqueta = elementoFila.createSpan({ cls: "gym-ajuste-opcion-etiqueta" });
            const entrada = elementoFila.createEl("input", { cls: "gym-ajuste-opcion-duracion" });
            entrada.type = "text";
            entrada.inputMode = "numeric";
            entrada.placeholder = "3:00";
            entrada.value = this.formatearDuracion(ms);
            entrada.setAttribute("aria-label", `Duración de la opción rápida ${filas.length + 1}`);
            const quitar = elementoFila.createEl("button", { text: "Quitar", cls: "mod-warning" });
            quitar.type = "button";
            quitar.title = "Quitar esta opción rápida";
            quitar.addEventListener("click", () => {
                elementoFila.remove();
                const indice = filas.findIndex(actual => actual.fila === elementoFila);
                if (indice >= 0) filas.splice(indice, 1);
                actualizarNombres();
            });
            const nuevaFila = { fila: elementoFila, etiqueta, entrada };
            filas.push(nuevaFila);
            actualizarNombres();
            return nuevaFila;
        };

        valores.forEach(ms => añadirFila(ms));
        const acciones = setting.controlEl.createDiv("gym-ajustes-opciones-acciones");
        const añadir = acciones.createEl("button", { text: "Añadir opción", cls: "mod-cta" });
        añadir.type = "button";
        añadir.addEventListener("click", () => {
            const existentes = new Set(filas
                .map(fila => this.leerDuracion(fila.entrada.value))
                .filter((ms): ms is number => ms != null));
            let ms = 60_000;
            while (ms <= 99 * 3600000 && existentes.has(ms)) ms += 60_000;
            if (ms > 99 * 3600000) {
                ms = 1000;
                while (ms <= 99 * 3600000 && existentes.has(ms)) ms += 1000;
            }
            if (ms > 99 * 3600000) {
                toast("No hay más duraciones disponibles.", false);
                return;
            }
            const nuevaFila = añadirFila(ms);
            nuevaFila.entrada.focus();
            nuevaFila.fila.scrollIntoView({ block: "nearest" });
        });
        const guardar = acciones.createEl("button", { text: "Guardar opciones rápidas", cls: "mod-cta" });
        guardar.type = "button";
        guardar.addEventListener("click", () => {
            const duraciones: number[] = [];
            for (const fila of filas) {
                const duracion = this.leerDuracion(fila.entrada.value);
                if (duracion == null) {
                    fila.entrada.setCustomValidity("Usa una duración válida entre 0:01 y 99:00:00.");
                    fila.entrada.reportValidity();
                    return;
                }
                fila.entrada.setCustomValidity("");
                duraciones.push(duracion);
            }
            const ordenadas = [...new Set(duraciones)].sort((a, b) => a - b);
            void this.guardar("opcionesRapidasTemporizador", ordenadas)
                .then(() => {
                    ordenarFilas();
                    toast("Opciones rápidas guardadas.");
                })
                .catch(error => {
                    console.error("[Gym Stone opciones rápidas]", error);
                    toast("No se pudieron guardar las opciones rápidas.", false);
                });
        });
    }

    private formatearDuracion(ms: number): string {
        const totalSegundos = Math.floor(ms / 1000);
        const horas = Math.floor(totalSegundos / 3600);
        const minutos = Math.floor((totalSegundos % 3600) / 60);
        const segundos = totalSegundos % 60;
        const dos = (n: number): string => String(n).padStart(2, "0");
        return horas > 0 ? `${horas}:${dos(minutos)}:${dos(segundos)}` : `${minutos}:${dos(segundos)}`;
    }

    private leerDuracion(valor: string): number | null {
        const trozos = valor.trim().split(":");
        if (trozos.length !== 2 && trozos.length !== 3) return null;
        const patron = trozos.length === 2 ? /^\d{1,4}$/ : /^\d{1,2}$/;
        if (trozos.some(t => !patron.test(t))) return null;
        const numeros = trozos.map(Number);
        const [horas, minutos, segundos] = numeros.length === 2
            ? [0, numeros[0], numeros[1]]
            : numeros;
        if (segundos > 59 || (numeros.length === 3 && (minutos > 59 || horas > 99))) return null;
        const ms = (horas * 3600 + minutos * 60 + segundos) * 1000;
        return ms >= 1000 && ms <= 99 * 3600000 ? ms : null;
    }

    override getSettingDefinitions(): SettingDefinitionItem[] {
        return [
            {
                name: "Carpeta raíz",
                desc: "Carpeta donde se guardan los datos del plugin. Cambiarla no mueve los archivos existentes.",
                control: { key: "carpetaRaiz", type: "text", placeholder: "gym-stone" },
            },
            {
                name: "Unidad de talla",
                desc: "Unidad en la que se muestra la talla. Los datos se guardan en centímetros.",
                control: { key: "unidadTalla", type: "dropdown", options: { cm: "Cm", in: "In" } },
            },
            {
                name: "Unidad de peso",
                desc: "Unidad para mostrar e introducir el peso. Los datos se guardan en kilogramos.",
                control: {
                    key: "unidadPeso", type: "dropdown",
                    options: { kg: "Kilogramos (kg)", lb: "Libras (lb)" },
                },
            },
            {
                name: "Mantener la pantalla encendida",
                desc: "Evita que la pantalla se apague mientras corre un temporizador. Se libera al pausar o parar.",
                control: { key: "mantenerDespierta", type: "toggle" },
            },
            {
                name: "Sonido",
                searchable: false,
                render: s => {
                    s.setHeading();
                },
            },
            {
                name: "Sonido del temporizador",
                desc: "Reproduce un pitido al terminar el temporizador libre.",
                control: { key: "sonidoTemporizador", type: "toggle" },
            },
            {
                name: "Sonido del descanso",
                desc: "Reproduce un pitido y vibra al terminar un descanso de la sesión guiada.",
                control: { key: "sonidoDescanso", type: "toggle" },
            },
            {
                name: "Tipo de sonido",
                desc: "Elige la forma de onda del sintetizador.",
                control: {
                    key: "formaOndaSonido", type: "dropdown",
                    options: {
                        sine: "Senoidal · suave",
                        triangle: "Triangular · redonda",
                        square: "Cuadrada · marcada",
                        sawtooth: "Diente de sierra · brillante",
                    },
                },
            },
            {
                name: "Patrón del aviso",
                desc: "Elige la secuencia de notas al terminar.",
                control: {
                    key: "patronSonido", type: "dropdown",
                    options: {
                        clasico: "Tres notas",
                        unico: "Pitido único",
                        ascendente: "Ascendente",
                        doble: "Doble",
                    },
                },
            },
            {
                name: "Avisos de cuenta atrás",
                desc: "Pitidos en los últimos segundos del temporizador o descanso.",
                control: {
                    key: "avisosCuentaAtras", type: "dropdown",
                    options: {
                        "0": "Desactivados",
                        "3": "Últimos 3 segundos",
                        "5": "Últimos 5 segundos",
                    },
                },
            },
            {
                name: "Volumen del sonido",
                desc: "Volumen común para los avisos del temporizador y del descanso.",
                control: {
                    key: "volumenSonido", type: "slider", min: 0, max: 100, step: 5,
                    displayFormat: (v: number) => `${v} %`,
                },
            },
            {
                name: "Probar el sonido",
                desc: "Reproduce el aviso con el volumen actual.",
                searchable: false,
                render: s => {
                    s.addButton(b => b.setButtonText("🔊 Probar")
                        .setTooltip("Probar el sonido")
                        .onClick(() => probarSonido()));
                },
            },
            {
                name: "Frecuencias de las notas",
                desc: "Personaliza las tres notas en hercios (de 100 a 2000).",
                searchable: false,
                render: s => this.mostrarFrecuencias(s, conf().frecuenciasSonido),
            },
            {
                name: "Opciones rápidas del temporizador",
                desc: "Una duración por casilla. Formato: minutos:segundos (3:00).",
                searchable: false,
                render: s => this.mostrarOpcionesRapidas(s, conf().opcionesRapidasTemporizador),
            },
        ];
    }

    private mostrarFrecuencias(setting: Setting, valores: [number, number, number]): void {
        setting
            .setName("Frecuencias de las notas")
            .setDesc("Personaliza las tres notas en hercios (de 100 a 2000).");
        setting.controlEl.addClass("gym-ajustes-frecuencias");
        setting.controlEl.empty();

        const campos = valores.map((frecuencia, i) => {
            const grupo = setting.controlEl.createDiv("gym-ajustes-frecuencia");
            grupo.createSpan({ text: `Nota ${i + 1}` });
            const entrada = grupo.createEl("input", { attr: { type: "number", min: "100", max: "2000", step: "1" } });
            entrada.value = String(frecuencia);
            entrada.setAttribute("aria-label", `Frecuencia de la nota ${i + 1} en hercios`);
            return entrada;
        });

        const guardar = setting.controlEl.createEl("button", { text: "Guardar frecuencias", cls: "mod-cta" });
        guardar.type = "button";
        guardar.addEventListener("click", () => {
            const valoresNuevos = campos.map(campo => Number(campo.value));
            const invalido = campos.findIndex((campo, i) =>
                !Number.isInteger(valoresNuevos[i]) || valoresNuevos[i] < 100 || valoresNuevos[i] > 2000);
            if (invalido >= 0) {
                const campo = campos[invalido];
                campo.setCustomValidity("Introduce una frecuencia entre 100 y 2000 Hz.");
                campo.reportValidity();
                return;
            }
            campos.forEach(campo => campo.setCustomValidity(""));
            const frecuencias: [number, number, number] = [
                valoresNuevos[0],
                valoresNuevos[1],
                valoresNuevos[2],
            ];
            void this.guardar("frecuenciasSonido", frecuencias)
                .then(() => toast("Frecuencias guardadas. Prueba el sonido para escucharlas."))
                .catch(error => {
                    console.error("[Gym Stone frecuencias de sonido]", error);
                    toast("No se pudieron guardar las frecuencias.", false);
                });
        });
    }

    override getControlValue(key: string): unknown {
        if (key === "unidadPeso") return pesoActual();
        if (key === "avisosCuentaAtras") return String(conf().avisosCuentaAtras);
        return (conf() as unknown as Record<string, unknown>)[key];
    }

    override setControlValue(key: string, value: unknown): void | Promise<void> {
        if (key === "unidadPeso") return this.fijarPeso(String(value));
        if (key === "avisosCuentaAtras") {
            const segundos = Number(value);
            if (segundos === 0 || segundos === 3 || segundos === 5) {
                return this.guardar("avisosCuentaAtras", segundos);
            }
            throw new Error(`Opción de cuenta atrás no válida: ${String(value)}`);
        }

        return this.guardar(key as keyof AjustesGym, value as never);
    }

    private fijarPeso(u: string): void {
        if (!fijarUnidadPeso(u)) return;
        this.pluginRef.repintarVistasGym();
    }

    private async guardar<K extends keyof AjustesGym>(clave: K, valor: AjustesGym[K]): Promise<void> {
        const actual = normalizarAjustes({ ...conf(), [clave]: valor });
        actualizarAjustes(actual);
        await this.pluginRef.guardarAjustes(actual);
        if (clave === "mantenerDespierta") refrescarDespierta();
        this.pluginRef.repintarVistasGym();
    }
}
