# Gym Stone

Gym Stone es un complemento de Obsidian para planificar rutinas de gimnasio, registrar
entrenamientos y consultar tu progreso. Funciona en escritorio y móvil; los datos se guardan
en tu vault.

## Funciones

- Crea rutinas semanales desde cero o a partir de plantillas.
- Registra sesiones guiadas o manuales, con ejercicios de peso, tiempo e intervalos.
- Añade calentamiento y estiramiento al día: la sesión guiada cronometra estos bloques antes
  o después de los ejercicios según el orden de la rutina; el registro manual permite anotar
  su duración. En una rutina libre, puedes añadirlos desde el selector o con botones junto a
  «Añadir ejercicio»; el calentamiento se añade antes de iniciar y el estiramiento queda al final.
- Organiza ejercicios por grupos musculares y conserva su historial aunque cambies sus nombres.
- Registra peso y talla, y consulta su evolución, el IMC, calendarios y estadísticas.
- Usa temporizadores y cronómetro durante el entrenamiento.

## Instalación

### Desde el directorio de complementos

Si Gym Stone está publicado en el directorio de la comunidad:

1. En Obsidian, ve a **Ajustes → Comunidad de plugins → Explorar**.
2. Busca **Gym Stone**, instálalo y actívalo.

### Instalación manual

1. Descarga `main.js`, `manifest.json` y `styles.css` desde la
   [última versión](https://github.com/adrianoaquesada/gym-stone/releases/latest).
2. Copia los archivos en `<tu-vault>/.obsidian/plugins/gym-stone/`.
3. En Obsidian, activa Gym Stone en **Ajustes → Comunidad de plugins → Plugins sin verificar**.

## Uso

Abre Gym Stone desde el icono de la barra lateral o ejecuta el comando **Abrir la lista de
rutinas**. Crea una rutina, añade ejercicios y registra cada sesión desde la rutina o con la
sesión guiada. Desde Inicio también puedes registrar medidas, explorar el catálogo y consultar
estadísticas.

En cada rutina, la sección **Estadísticas** reúne el resumen, la evolución por ejercicio y el
historial filtrable con la comparación entre el plan y lo realizado.

En Inicio, **Estadísticas** muestra el resumen global de rutinas, las medidas corporales y la
evolución e historial de ejercicios entre rutinas. Desde ahí también puedes registrar medidas.
La sección **Medidas e IMC** se mantiene como acceso independiente.

## Capturas

Sesión guiada:

![Pantalla de sesión guiada con registro de series y temporizador de descanso](screenshots/sesion-guiada.webp)

Rutina semanal y calendario:

![Vista de una rutina semanal y su calendario de sesiones](screenshots/rutina-calendario.webp)

Historial de sesión y estadísticas:

![Historial de una sesión con estadísticas, gráficos y series registradas](screenshots/historial-sesion.webp)

En cada ejercicio puedes definir objetivos de peso y repeticiones, duración o ciclos de
trabajo y descanso. Las sesiones guardan los resultados para consultar el historial y la
progresión.

Al crear o editar una rutina, el botón de guardado permanece disponible al pie del formulario.
Los ejercicios de cada día se pueden reordenar arrastrando el asa.
Cada día admite un bloque fijo de calentamiento y otro de estiramiento; en la sesión guiada
aparecen en el orden definido en el editor, se completan con «Hecho» y no tienen descanso.

La sesión guiada puede minimizarse y restaurarse con un botón persistente; al terminar el
descanso de la última serie de un ejercicio, avanza automáticamente al siguiente.

El historial compara las series y el peso planificados con lo realizado. Al terminar una
sesión o iniciar otra, puedes aplicar al objetivo del día actual los valores sugeridos según
el último registro; la plantilla no se modifica.

## Datos

Gym Stone guarda los datos como JSON dentro de notas Markdown en la carpeta raíz configurada
en los ajustes (`gym-stone` por defecto):

En una instalación nueva, la carpeta `gym-stone` se crea en la raíz del vault. En los ajustes
puedes buscar una carpeta existente escribiendo su ruta o introducir una ruta relativa nueva.
Cambiar esta opción no mueve los datos: si mueves la carpeta desde Obsidian, selecciona después
su nueva ubicación.

| Ruta | Contenido |
| --- | --- |
| `gym-stone/rutinas.gym-stone.md` | Índice de rutinas |
| `gym-stone/datos/rutinas/<id>.gym-stone.md` | Plan, sesiones y anotaciones de cada rutina |
| `gym-stone/datos/medidas.gym-stone.md` | Medidas corporales |
| `gym-stone/datos/ejercicios.gym-stone.md` | Catálogo y grupos musculares |
| `gym-stone/plantillas/<nombre>.md` | Plantillas |

Antes de sobrescribir un archivo de datos, el complemento conserva una copia `.bak`. El peso
se almacena en kilogramos y la talla en centímetros; las unidades elegidas en los ajustes se
usan para mostrar e introducir valores.

## Desarrollo

```bash
npm install
npm run lint
npm run build
```

## Licencia

MIT. Consulta [LICENSE](LICENSE).
