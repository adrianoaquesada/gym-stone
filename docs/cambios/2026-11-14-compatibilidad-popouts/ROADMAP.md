# Roadmap: compatibilidad con ventanas emergentes (popouts)

## Fase 1: capa común de UI

### Subfase 1a: listeners por ventana y globo de ayuda
- Objetivo: que los listeners globales de `componentes.ts` se instalen y retiren en cada
  ventana (principal y emergentes) y que el globo de ayuda viva en el documento activo.
- Archivos esperados: `src/ui/componentes.ts`
- No tocar: `confirmar`, `modal`, `pedirTexto`, `toast`, `limpiarOverlays`
- Hecho cuando: `eslint src` no reporta avisos de `prefer-active-doc` en las líneas de
  `enfocarCamposAlTocar` ni de `conAyuda`/`cerrarGlobo`; `npm run build` en verde.
- Revisión: el revisor devuelve APROBADO
- Depende de: nada

### Subfase 1b: overlays, modales y toasts en el documento activo
- Objetivo: montar y desmontar los overlays de la capa común en `activeDocument`, con
  comprobaciones `instanceOf`, sin cambiar su apariencia ni su comportamiento.
- Archivos esperados: `src/ui/componentes.ts`
- No tocar: `enfocarCamposAlTocar`, `conAyuda`, `cerrarGlobo`
- Hecho cuando: `eslint src` deja `src/ui/componentes.ts` en 0 avisos y `npm run build`
  pasa; `limpiarOverlays` limpia el documento activo.
- Revisión: el revisor devuelve APROBADO
- Depende de: 1a

## Fase 2: vistas independientes

### Subfase 2a: hoja, gráfica y ajustes
- Objetivo: sustituir `document` por `activeDocument` en la hoja inferior, la gráfica y el
  salto a los ajustes rápidos.
- Archivos esperados: `src/ui/hoja.ts`, `src/ui/grafica.ts`, `src/ui/tabla-ajustes.ts`
- No tocar: `componentes.ts` ni las vistas de sesión/temporizador
- Hecho cuando: esos tres archivos quedan en 0 avisos y `npm run build` pasa.
- Revisión: el revisor devuelve APROBADO
- Depende de: 1b

### Subfase 2b: creador y ejercicios
- Objetivo: usar el documento activo en los diálogos del creador y en las acciones de la
  biblioteca de ejercicios.
- Archivos esperados: `src/ui/creador.ts`, `src/ui/ejercicios-ui.ts`
- No tocar: `sesion-guiada.ts`, `temporizador.ts`
- Hecho cuando: ambos archivos quedan en 0 avisos y `npm run build` pasa.
- Revisión: el revisor devuelve APROBADO
- Depende de: 1b

### Subfase 2c: despierta (wake lock)
- Objetivo: consultar la visibilidad y registrar `visibilitychange` en el documento activo
  sin alterar el conteo de reclamos del wake lock.
- Archivos esperados: `src/despierta.ts`
- No tocar: `src/estado.ts`, `src/main.ts`
- Hecho cuando: `src/despierta.ts` queda en 0 avisos y `npm run build` pasa.
- Revisión: el revisor devuelve APROBADO
- Depende de: 1b

## Fase 3: sesión guiada y temporizador

### Subfase 3a: temporizador
- Objetivo: documento activo y `instanceOf(Element)` en el temporizador, incluidos sus
  overlays y sus atajos.
- Archivos esperados: `src/ui/temporizador.ts`
- No tocar: `sesion-guiada.ts`
- Hecho cuando: `src/ui/temporizador.ts` queda en 0 avisos y `npm run build` pasa.
- Revisión: el revisor devuelve APROBADO
- Depende de: 1b

### Subfase 3b: sesión guiada
- Objetivo: documento activo en los overlays, consultas y listeners de la sesión guiada.
- Archivos esperados: `src/ui/sesion-guiada.ts`
- No tocar: `temporizador.ts`, `componentes.ts`
- Hecho cuando: `eslint src` queda en **0 errores y 0 avisos** y `npm run build` pasa.
- Revisión: el revisor devuelve APROBADO
- Depende de: 3a

## Fase 4: verificación y publicación

### Subfase 4a: prueba en ventana emergente y documentación
- Objetivo: verificar a mano el plugin con una nota abierta en ventana emergente y dejar
  constancia en PROGRESO y README de la deuda de `npm audit`.
- Archivos esperados: `README.md`, `docs/cambios/2026-11-14-compatibilidad-popouts/PROGRESO.md`
- No tocar: código fuente salvo correcciones puntuales que dicte la prueba
- Hecho cuando: `npm run lint`, `npm run build`, `git diff --check` en verde; probados en
  popout temporizador, sesión guiada, hoja, toasts, modales y gráfica; audit documentado
  con 10 moderadas de desarrollo y 0 en producción.
- Revisión: el revisor devuelve APROBADO
- Depende de: 3b

### Subfase 4b: versión 1.0.10
- Objetivo: publicar la versión con el arreglo de popouts.
- Archivos esperados: `manifest.json`, `package.json`, `package-lock.json`, `versions.json`
- No tocar: código fuente
- Hecho cuando: tag `1.0.10` empujado, workflow Release en verde y release publicada con
  `main.js`, `manifest.json` y `styles.css`.
- Revisión: el revisor devuelve APROBADO
- Depende de: 4a
