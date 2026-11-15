# Progreso: compatibilidad con ventanas emergentes (popouts)

**Subfase actual:** 2c · implementación subida; validación local pendiente · **Última actualización:** 2026-11-14

## Estado
- [x] 1a listeners por ventana y globo de ayuda
- [x] 1b overlays, modales y toasts en el documento activo (build y `git diff --check` correctos; lint sin errores, 30 avisos restantes)
- [x] 2a hoja, gráfica y ajustes (implementación subida; falta confirmar lint/build)
- [x] 2b creador y ejercicios (implementación subida; falta confirmar lint/build)
- [ ] 2c despierta (wake lock)
- [ ] 3a temporizador
- [ ] 3b sesión guiada
- [ ] 4a prueba en ventana emergente y documentación
- [ ] 4b versión 1.0.10

## Bitácora (la más reciente arriba)
- 2026-11-14 · 2a · `hoja.ts` captura `activeDocument` al montar y usa ese documento para el overlay y el listener Escape; `grafica.ts` crea los nodos SVG en `raiz.ownerDocument`; `tabla-ajustes.ts` consulta el elemento de opciones rápidas en `activeDocument`. Sin cambios visuales ni de flujo. Validación local pendiente.
- 2026-11-14 · 2b · `creador.ts` comprueba el foco con `inEj.ownerDocument.activeElement`; `ejercicios-ui.ts` registra y consulta eventos/elementos en el documento propietario de cada modal y observa el `body` de ese documento. Sin cambios visuales ni de flujo. Validación local pendiente.
- 2026-11-14 · 2a · `hoja.ts` captura `activeDocument` al montar y usa ese documento para el overlay y el listener Escape; `grafica.ts` crea los nodos SVG en `raiz.ownerDocument`; `tabla-ajustes.ts` consulta el elemento de opciones rápidas en `activeDocument`. Sin cambios visuales ni de flujo. Validación pendiente tras subir los cambios.
- 2026-11-14 · 1b · validación local: `npm run build` correcto y `git diff --check` limpio; `npm run lint` sin errores, con 30 avisos restantes en fases 2a–3b. La implementación 1b queda validada en compilación; pendiente prueba manual de popouts.
- 2026-11-14 · 1b · implementación subida en dos commits: `2451343` y
  `881c7f7`. `toast`, `confirmar`, `modal` y `pedirTexto` crean y consultan
  sus elementos en `activeDocument`, y los temporizadores usan la ventana del documento.
  `limpiarOverlays()` recorre documentos conocidos por los listeners de ventana,
  documentos con overlays y el documento principal/activo, para limpiar también popouts.
  Se conserva el comportamiento visual y funcional. Validación local pendiente: la validación local se realizó después: build correcto y diff limpio; el lint no reportó errores, aunque quedaron avisos de fases posteriores.
- 2026-11-14 · 1a · `escucharEnVentanas` instala y retira listeners en la ventana principal y
  en cada popout, con dedupe por documento y `offref` al descargar; `enfocarCamposAlTocar`
  usa `instanceOf` y el documento del campo; el globo de ayuda se monta en el documento de
  su ancla, mide con su ventana y limpia `scroll`/`pagehide` al cerrarse. Archivos:
  `src/ui/componentes.ts`. Commit: `c390339`.
  Verificado: `eslint src/ui/componentes.ts` 0 errores y solo los 11 avisos de 1b,
  `npm run build` y `git diff --check` en verde. Revisor: APROBADO.
- 2026-11-14 · preparación · cambio creado con 48 avisos de partida (45
  `prefer-active-doc`, 3 `prefer-instanceof`) tras actualizar a `eslint-plugin-obsidianmd`
  0.6.0 · archivos: `docs/cambios/2026-11-14-compatibilidad-popouts/`, `AGENTS.md`

## Pendiente / problemas conocidos
- La limpieza de overlays ya recorre los documentos conocidos de las ventanas abiertas;
  confirmar en pruebas manuales que no quedan overlays huérfanos al descargar el plugin.
- `npm audit` mantiene 10 alertas moderadas de desarrollo (`minimatch` en
  `typescript-eslint` y `eslint-plugin-n`), sin corrección compatible publicada; 0 alertas
  en producción (`npm audit --omit=dev`).
- La 1.0.9 ya está publicada: este cambio se entrega como 1.0.10.

## Notas para la próxima sesión
- Tras 1a y 1b, la validación local reportó 0 errores y 30 avisos (28 `prefer-active-doc` y 2 `prefer-instanceof`).
- Los avisos no son autofixables: `eslint --fix` no modifica nada.
- El patrón de listeners por ventana ya existe: `escucharEnVentanas` en
  `src/ui/componentes.ts` (privado del módulo). Si otra subfase necesita listeners
  globales, conviene exportarlo o replicarlo con el mismo criterio.
- Reglas acordadas: `activeDocument`/`activeDocument.body` para DOM, `instanceOf` de
  Obsidian para nodos y eventos, y listeners globales registrados por ventana con
  `window-open`/`window-close`.
- La subfase 13b de `2026-10-26-tipos-de-ejercicio-y-series` queda en pausa hasta cerrar
  este cambio.
