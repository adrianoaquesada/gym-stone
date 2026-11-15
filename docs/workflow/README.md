# Flujo de trabajo por fases

Guía breve **para humanos**. El procedimiento que sigue el modelo vive en las skills de
`.opencode/skills/`; aquí solo se explica qué piezas hay y cómo se invocan.

## Piezas

```text
AGENTS.md                         # reglas permanentes del repo (corto; se carga en toda sesión)
docs/
  workflow/
    README.md                     # este archivo
    plantillas/                   # DISENO.md, ROADMAP.md, PROGRESO.md, sesion.md
  cambios/
    <AAAA-MM-DD>-<nombre>/
      DISENO.md                   # decisiones y modelo acordado
      ROADMAP.md                  # fases y subfases
      PROGRESO.md                 # registro vivo
.opencode/
  agents/                         # subagentes de solo lectura
    explorador.md                 #   informe de archivos y usos antes de planear
    revisor.md                    #   veredicto APROBADO/CON DESVÍOS contra el diseño
  skills/                         # procedimientos, cargados solo cuando hacen falta
    ciclo-subfase/  cerrar-subfase/  nuevo-cambio/
  commands/
    fase.md  cerrar.md  revisar.md  nuevo-cambio.md
```

## Cómo se invoca (opencode v2.2.0)

| Qué | Cómo |
| --- | --- |
| Avanzar una subfase | `/fase <id>` → carga la skill `ciclo-subfase` y lanza al `explorador` |
| Cerrar una subfase | `/cerrar` → carga `cerrar-subfase` y lanza al `revisor` antes del commit |
| Revisar el diff | `/revisar` → lanza al `revisor` y devuelve su informe sin modificar nada |
| Cambio nuevo | `/nuevo-cambio <nombre>` → carga la skill `nuevo-cambio` |

Skills y agentes también se pueden pedir a mano («carga la skill `ciclo-subfase`»,
«usa el agente `revisor`»). El estado vive en archivos del repo, no en la conversación:
una sesión nueva retoma leyendo `AGENTS.md` y `PROGRESO.md` + `git diff`.

## Diferencias de formato con el documento original

Instalado: **opencode v2.2.0** (el original estaba escrito para otro formato).

- **Agentes**: van en `.opencode/agents/<nombre>.md` (plural). Frontmatter con
  `description`, `mode: subagent` y `permissions` (reglas `action`/`resource`/`effect`).
  El `tools: { write: false, edit: false }` del original es un campo V1 deprecado: en V2
  la restricción se hace con `permissions` (bloquear `edit` cubre edit/write/patch; el
  shell se bloquea por defecto y se abren solo comandos de lectura).
- **Skills**: van en `.opencode/skills/<id>/SKILL.md` (plural). Frontmatter con `name`
  (solo display) y `description` (sin ella no se anuncia al modelo). El id real es el de
  la ruta, no el del frontmatter.
- **Comandos**: van en `.opencode/commands/<nombre>.md` (plural; el singular legacy
  sigue funcionando). El cuerpo del archivo **es** la plantilla del prompt, los argumentos
  van con `$ARGUMENTS`, y el frontmatter admite `description`, `agent`, `model` y
  `subagent`, pero **no** `template`. Un comando no puede cargar una skill por nombre de
  forma nativa: se le pide en el cuerpo («carga la skill X»). Detalle oficial:
  <https://opencode.ai/v2/docs/commands>.

## Reglas de oro

1. El estado vive en archivos: decisiones, diseño, progreso y problemas conocidos se escriben.
2. Una subfase = máximo 3-5 archivos, un objetivo verificable y termina con `npm run review` en verde.
3. El compilador y los comandos son el árbitro: los criterios de hecho se comprueban con comandos, no con afirmaciones.
4. Una sesión nueva por subfase; un commit por subfase (mensaje `<id>: <resumen>`).
5. Decisiones cerradas por escrito: lo que no está en `DISENO.md` no se reinventa ni se reabre.
6. Alcance estricto: no refactorizar código no relacionado ni «mejorar» de más.
7. Subagentes para leer y revisar, nunca para escribir en paralelo sobre los mismos archivos.

## Reutilización en otros proyectos

| Parte | Genérica o específica | Qué hacer al reutilizar |
| --- | --- | --- |
| `docs/workflow/` y `.opencode/` | Genérica | Copiar sin cambios (agents, skills y commands) |
| `AGENTS.md` | Mixta | Copiar la sección «Flujo de trabajo» tal cual; rehacer verificación y convenciones con un reconocimiento del proyecto |
| `docs/cambios/<fecha>-<nombre>/` | Específica | Crear con `/nuevo-cambio <nombre>` para cada cambio |

En este mismo proyecto, para un cambio nuevo: `/nuevo-cambio <nombre>`, responder el
cuestionario, revisar el roadmap generado y empezar con `/fase 1a`.
