# 🏋️ Gym Stone

Plugin de Obsidian con el **sistema de rutinas de gimnasio**: creas una rutina, registras sesiones,
medidas y anotaciones, y ves el progreso en un calendario mensual y unas estadísticas (mismo look
que el panel de trading).

## Instalación (Installation)

Funciona en **escritorio y móvil**. Dos formas de instalarlo:

**Opción A · Desde la lista de plugins de la comunidad** (cuando esté publicado):

1. Abre **Ajustes → Comunidad de plugins → Explorar**.
2. Busca «Gym Stone» o pulsa este enlace:
   [obsidian://show-plugin?id=gym-stone](obsidian://show-plugin?id=gym-stone).
3. Pulsa **Instalar** y después **Habilitar**.

**Opción B · Instalación manual** (o mientras tanto, desde la última release de GitHub):

1. Descarga de la [última release](https://github.com/adrianoaquesada/gym-stone/releases/latest)
   los tres archivos: `main.js`, `manifest.json` y `styles.css`.
2. Colócalos dentro de tu vault, en

   ```
   <tu-vault>/.obsidian/plugins/gym-stone/
   ```

3. Abre **Ajustes → Comunidad de plugins → plugins sin verificar** y activa **Gym Stone**.

## Uso (Usage)

**En corto (basic usage)**: abre el plugin con la **campana de mancuerna** (barra lateral
izquierda) o con el comando «Abrir la lista de rutinas» → **＋ Nueva rutina** para crear la
primera → **🎯** en su fila para empezar la **sesión guiada** y registrar series con sus
descansos. El progreso se guarda solo, en notas `.md` de tu vault.

**Toda la navegación ocurre en una sola pestaña** (se cambia de
pantalla dentro de ella, nunca se abren pestañas de más), y Inicio ⇄ la ficha de una rutina
cambia **en la misma vista, sin remontar la pestaña**: mientras se leen los datos sigue
visible lo anterior (nunca un destello en blanco) y el scroll solo se reinicia al cambiar de
pantalla. La navegación no toca archivos: los `.md` son solo consulta y guardado. Hay un
**carrusel de pestañas** bajo la cabecera naranja: una sola línea que se recorre deslizando,
**sin barra de desplazamiento visible**:

- **📋 Inicio**: tres secciones a pantalla completa que se cambian desde el carrusel, y **📋
  Rutinas es la que sale por defecto**. Ahí están el índice de todas las rutinas (estado,
  fechas, semana en curso y sesiones hechas) con sus KPIs justo debajo del encabezado, y en
  cada fila editas (✏️) o borras (🗑) la rutina, o inicias su sesión guiada (🎯) sin entrar a
  su ficha. Las otras dos secciones son **⚖️ Medidas e IMC** (peso corporal, evolución e IMC,
  con **＋ Registrar medidas** como acción principal cuando estás en ella) y **🗂 Ejercicios**
  (el gestor del catálogo a pantalla completa, ya no como popup: renombra con ids estables
  —**el historial se conserva**—, les asigna grupo muscular para el buscador y purga 🧹, con
  confirmación, las entradas que ya no usan ni rutinas ni plantillas). El carrusel cierra la
  acción principal (**＋ Nueva rutina**, **＋ Registrar medidas** en Medidas e IMC y NINGUNA en
  Ejercicios) y, al final a la derecha, **⏱ Temporizador**.
- **🏋️ Rutina**: el dashboard de la rutina a todo el ancho, con su carrusel: **← Inicio**,
  **✏️ Editar**, **🎯 Empezar sesión guiada** (naranja), **＋ Registrar sesión**,
  **📝 Anotación**, **⚖️ Registrar medidas**, **📈 Estadísticas** y **🗓 Historial**
  (las dos últimas se abren como **popup** con ✕ y Esc) y, **al final a la derecha, ⏱
  Temporizador**. En el **modo sesión guiada** (pensado para el móvil) entrenas un ejercicio a la vez:
  descansos con **−15 s** / **＋30 s**, **tiempo activo real** (las pausas no cuentan ni en el
  cronómetro ni en los tiempos de las series) y «entre series» desglosado en descanso y
  ejecución. En la cabecera de cada ejercicio se cambian también el descanso y el **modo de
  reps** (fijas · mínimo al fallo · al fallo), igual que en el formulario de edición; en las
  rutinas libres es donde se configura, porque ahí no hay plan.
  Al pulsar un día del calendario se abre su detalle: KPIs del día, gráficos de
  volumen, tiempos por serie y la **🕒 línea de tiempo** de toda la sesión; los días con
  anotación muestran su 📝 siempre a la vista.
- **✏️ Nueva/Editar**: el formulario se abre en una **hoja superpuesta** sobre lo que estés
  mirando (✕ o Esc la cierran y vuelves exactamente a donde estabas), con estado de la
  rutina (🟢 Activa · ⏸ Pausada · 🏁 Finalizada), selector **kg | lb** y búsqueda de
  ejercicios por nombre o **grupo muscular** con chips. En cada ejercicio se elige cómo se
  leen las reps: **fijas** (ese número), **mínimo al fallo** (llegar al menos a ese número
  y seguir hasta el fallo) o **al fallo** (tantas repeticiones como puedas).

La **cabecera naranja** muestra el título («🏋️ Inicio» en la lista; el nombre y las fechas de
la rutina en su ficha), y el menú **⋮** de arriba a la derecha lleva **«Alternar pesos
kg ↔ libras»** y **«Abrir como Markdown»** para cualquier pestaña del plugin.

**Abrir los archivos del plugin es abrir el plugin**: si abres
`gym-stone/rutinas.gym-stone.md` o un archivo de `gym-stone/datos/rutinas/`, esa pestaña pasa
a la vista del plugin, y el icono 🏋️ de la esquina superior de la nota la vuelve a mostrar
como markdown crudo. No hay frontmatter ni notas-dashboard: los datos son JSON puro en notas
`.md` legibles, y el plugin es el dueño de sus archivos.

**La pantalla no se apaga sola entre series**: mientras corre un temporizador —el ⏱ libre o la
sesión guiada en marcha (cronómetro y descanso)— el plugin mantiene la pantalla encendida con la
*Screen Wake Lock API* del sistema (Android e iOS ≥ 18.4; en escritorio no hace falta). Al
pausar o parar se suelta, y el interruptor **Ajustes → Gym Stone → Mantener la pantalla
encendida** lo apaga por completo (viene activado).

**Los pitidos del plugin son ajustables**: al terminar la cuenta atrás del ⏱ libre y al
terminar un descanso de la sesión guiada suena un pitido de tres notas sintetizado con la
Web Audio API (no hay archivos de audio) y el móvil vibra, y en **Ajustes → Gym Stone** se
gestiona con cuatro controles: **Sonido del temporizador** y **Sonido del descanso** (los
interruptores de cada aviso), **Volumen del sonido** (deslizador 0–100 %, común a los dos) y
el botón **🔊 Probar**, que suena con el volumen vigente para calibrarlo (ignora los
interruptores). Apagados los sonidos siguen los avisos visuales —«⏰ ¡Tiempo!» y «¡Listo!»—
y la vibración del móvil; «⏭ Saltar descanso» no suena nunca.

## Dónde viven los datos

Toda la vida del plugin cabe en **UNA carpeta raíz** (`gym-stone` por defecto, ajustable y
siempre en minúsculas):

| Archivo | Función |
|---|---|
| `gym-stone/rutinas.gym-stone.md` | **Índice**: una fila por rutina (fecha, id, nombre, estado) |
| `gym-stone/datos/rutinas/<id>.gym-stone.md` | Cada rutina con TODO: plan + sesiones + anotaciones |
| `gym-stone/datos/medidas.gym-stone.md` | Peso y talla (global) |
| `gym-stone/datos/ejercicios.gym-stone.md` | Grupo muscular de cada ejercicio (global) |
| `gym-stone/plantillas/<nombre>.md` | Plantillas reutilizables (sin sufijo: se editan a mano) |

Los datos llevan el **sufijo `.gym-stone.md`** (siguen siendo `.md` normales): el plugin los
identifica **por nombre**, no recorriendo el vault, y un `.md` normal que dejes ahí se sigue
abriendo como nota.

El índice se regenera solo cada vez que se guarda una rutina, así que aunque lo edites a mano
(o lo borres) se repone con lo último en disco. La carpeta raíz es un **ajuste del plugin**
(Ajustes → Gym Stone → Carpeta raíz). El peso se guarda siempre en kg y la talla en cm: la
unidad que muestras (kg | lb, cm | in) es solo de pantalla y se teclea en esa unidad. La de
peso se cambia desde **Ajustes → Gym Stone → Unidad de peso**, desde el selector **kg | lb**
del propio panel o con **«Alternar pesos kg ↔ libras»** del menú ⋮ (es lo mismo en los tres
sitios y se recuerda por vault); la de talla, desde **Unidad de talla** en Ajustes. Antes de
sobrescribir un archivo de datos se guarda su copia previa en `<archivo>.bak`; si un JSON está
roto, el motor avisa y **no** sobrescribe.

## Licencia

MIT — ver [LICENSE](LICENSE).
