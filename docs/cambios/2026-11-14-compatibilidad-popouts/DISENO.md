# Diseño: compatibilidad con ventanas emergentes (popouts)

## Objetivo
Eliminar los 48 avisos que `eslint-plugin-obsidianmd@0.6.0` reporta sobre `document` y
`instanceof`, para que el plugin funcione igual cuando una nota se abre en una ventana
emergente. No cambia la interfaz ni el comportamiento en la ventana principal: solo el
documento/ventana donde se montan overlays, se consultan elementos y se registran listeners.

## Fuentes
- `npm run lint` con `eslint-plugin-obsidianmd@0.6.0` (reglas `prefer-active-doc` y
  `prefer-instanceof`).
- Guía de plugins de Obsidian sobre `activeDocument`, `activeWindow` e `instanceOf`.
- `src/ui/componentes.ts` como capa común de overlays.

## Decisiones cerradas
| # | Pregunta | Decisión |
| - | -------- | -------- |
| 1 | ¿Actualizar a 0.6.0 y corregir los avisos, o silenciar las reglas? | Corregirlos: «si quisiera hacer lo correcto, y lo nuevo»; se mantiene la 0.6.0 y el lint debe quedar en 0/0. |
| 2 | ¿Forzar `overrides` de `minimatch` para limpiar `npm audit`? | No. La deuda es de tooling de desarrollo (0 vulnerabilidades en producción) y se corrige cuando publiquen `typescript-eslint`/`eslint-plugin-n`; se documenta el estado. |
| 3 | ¿Cómo atender los listeners globales? | Registrarlos y darlos de baja por ventana con `workspace.on("window-open")` / `workspace.on("window-close")`, no solo cambiando `document` por `activeDocument`. |
| 4 | ¿Cambia algo visible para el usuario? | No. Solo compatibilidad: misma UI, mismos atajos y mismos tiempos. |
| 5 | ¿Relación con el cambio 13b activo? | Ninguna: es un cambio nuevo e independiente. |
| 6 | ¿Cuándo se publica? | Al cerrar el cambio, como versión 1.0.10. |

## Modelo de datos / contratos
Sin cambios en el modelo de datos ni en los ajustes.

Reglas de implementación acordadas:
- Elementos que viven en el DOM de una ventana se crean y se consultan con `activeDocument`.
- Overlays colgados del body usan `activeDocument.body` y se retiran del mismo documento.
- Comprobaciones de tipo sobre nodos o eventos usan `instanceof` de Obsidian
  (`nodo.instanceOf(Node)`, `evento.instanceOf(Element)`).
- Temporizadores siguen con `window.setTimeout`/`window.setInterval`, ya correctos.
- Los listeners globales se instalan una vez por ventana y se retiran en `window-close`.

## Fuera de alcance
- Sustituir `minimatch` con overrides o bajar `eslint-plugin-obsidianmd`.
- Rediseño visual, cambios de textos o de flujos de UI.
- Internacionalización o locale inglés.
- Tests automatizados (el proyecto no los tiene).
- Tocar las subfases del cambio de tipos de ejercicio y series.

## Preguntas abiertas
Ninguna.
