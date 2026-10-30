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
  ejecución. En la cabecera de cada ejercicio se cambia el descanso y su **tipo de serie** del
  plan (calentamiento · trabajo · descenso · fallo; en las rutinas libres es ahí donde se
  configura, porque no hay plan), y en la serie que toca se anota la suya; las series hechas
  muestran su etiqueta.
  Cada tipo de ejercicio se registra a su manera: **peso** con reps y kilos como siempre,
  **tiempo** con un *hold* (cuenta arriba que corre con el reloj y se detiene a mano con ✔) e
  **intervalo** con ciclos semiautomáticos de trabajo → descanso (cada ciclo es una serie, y la
  transición sustituye al descanso en los ciclos impares si la definiste).
  Al pulsar un día del calendario se abre su detalle: KPIs del día, gráficos de
  volumen, tiempo de trabajo y la **🕒 línea de tiempo** de toda la sesión; los días con
  anotación muestran su 📝 siempre a la vista.
- **✏️ Nueva/Editar**: el formulario se abre en una **hoja superpuesta** sobre lo que estés
  mirando (✕ o Esc la cierran y vuelves exactamente a donde estabas), con estado de la
  rutina (🟢 Activa · ⏸ Pausada · 🏁 Finalizada), selector **kg | lb** y búsqueda de
  ejercicios por nombre o **grupo muscular** con chips. En cada ejercicio se elige su **tipo**:
  **peso** (reps y kilos objetivo, como siempre), **tiempo** (segundos del hold, sin reps,
  peso ni tipo de serie) o **intervalo** (trabajo · transición en segundos, descanso dentro
  del ciclo y los ciclos planificados en la columna «Ciclos»); en «peso» e «intervalo» se
  elige además su **tipo de serie** por defecto: **calentamiento**, **trabajo**, **descenso**
  (drop set) o **fallo** (las reps se leen al fallo, sin objetivo).

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

El temporizador libre también permite cambiar al modo **Cronómetro**: al
hacerlo, todas las cuentas atrás en marcha quedan pausadas y el cronómetro
queda detenido en cero hasta pulsar **Iniciar**. En esta vista se muestra solo el tiempo, con los parciales
en un área desplazable. **Detener** pausa el cronómetro y permite reanudarlo;
**Parcial** registra el tiempo desde el parcial anterior y el acumulado.
Al detenerlo, el segundo botón permite restablecerlo para empezar otra sesión.
Los parciales se conservan por vault en el almacenamiento local propio de
Obsidian.

Las cuentas atrás se pueden ver en modo circular —con gestos laterales y puntos
para alternar entre temporizadores— o en una lista completa con su hora de
alarma, duración, tiempo restante y controles. Al iniciar una cuenta atrás se
ocultan los ajustes; el botón **+** permite volver a abrirlos para añadir otra.
El panel conserva un tamaño estable adaptado al alto de la pantalla; la lista
tiene desplazamiento propio y el temporizador circular cambia con una
transición lateral.

Para el audio se reutiliza un `AudioContext` y se prepara al iniciar una cuenta
atrás desde el botón **Iniciar**, incluso si el sonido está desactivado en ese
momento, para que pueda activarse durante la cuenta atrás; si el sistema lo
suspende, se intenta reanudar antes de reproducir. Gym Stone usa Web Audio y no
solicita directamente un indicador de reproducción de KDE ni una sesión
multimedia. No se pudo confirmar visualmente en Plasma si su icono de audio
aparece durante los pitidos: ese indicador depende de cómo el entorno de
escritorio detecte el flujo de audio.

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
