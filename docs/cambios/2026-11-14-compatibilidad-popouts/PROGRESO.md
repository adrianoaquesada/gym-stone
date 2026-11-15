# Progreso: compatibilidad con ventanas emergentes (popouts)

**Subfase actual:** 1b · **Última actualización:** 2026-11-14

## Estado
- [x] 1a listeners por ventana y globo de ayuda
- [ ] 1b overlays, modales y toasts en el documento activo
- [ ] 2a hoja, gráfica y ajustes
- [ ] 2b creador y ejercicios
- [ ] 2c despierta (wake lock)
- [ ] 3a temporizador
- [ ] 3b sesión guiada
- [ ] 4a prueba en ventana emergente y documentación
- [ ] 4b versión 1.0.10

## Bitácora (la más reciente arriba)
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
- En 1b hay que decidir si `limpiarOverlays()` recorre todas las ventanas (no solo la
  activa) al descargar el plugin, para no dejar overlays huérfanos en popouts.
- `npm audit` mantiene 10 alertas moderadas de desarrollo (`minimatch` en
  `typescript-eslint` y `eslint-plugin-n`), sin corrección compatible publicada; 0 alertas
  en producción (`npm audit --omit=dev`).
- La 1.0.9 ya está publicada: este cambio se entrega como 1.0.10.

## Notas para la próxima sesión
- El lint de partida está en 0 errores y 48 avisos; tras 1a quedan 41 (39
  `prefer-active-doc` y 2 `prefer-instanceof`).
- Los avisos no son autofixables: `eslint --fix` no modifica nada.
- El patrón de listeners por ventana ya existe: `escucharEnVentanas` en
  `src/ui/componentes.ts` (privado del módulo). Si otra subfase necesita listeners
  globales, conviene exportarlo o replicarlo con el mismo criterio.
- Reglas acordadas: `activeDocument`/`activeDocument.body` para DOM, `instanceOf` de
  Obsidian para nodos y eventos, y listeners globales registrados por ventana con
  `window-open`/`window-close`.
- La subfase 13b de `2026-10-26-tipos-de-ejercicio-y-series` queda en pausa hasta cerrar
  este cambio.
