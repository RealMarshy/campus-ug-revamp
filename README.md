# Campus UG Revamp 2.3.0

Extensión comunitaria e independiente para Chrome que reúne las actividades del Área personal de Moodle de la Universidad de Guayaquil. Usa Manifest V3. Este proyecto no es oficial ni está afiliado a la Universidad de Guayaquil o a Moodle.

**Descarga oficial** · [Campus UG Revamp 2.3.0](https://github.com/RealMarshy/campus-ug-revamp/releases/tag/v2.3.0).

**2.3.0.** Incorpora encuestas de Feedback que aparecen en el calendario con eventos válidos. La apertura y el cierre se conservan por separado. En encuestas con cierre verificado, puedes usar la confirmación manual cuando Moodle no confirme la participación.

En cada encuesta, **Participación** permite declarar que la completaste, que no la completaste o retirar la declaración. Una encuesta cerrada que declaras no completada queda en Atrasadas y Pendientes. Al retirar la declaración se recupera la evidencia disponible de Moodle.

El resumen y el diagnóstico aparecen ocultos si la cuenta todavía no tiene una ubicación guardada. En **Personalizar → Ubicación del estado**, selecciona Arriba, Abajo u Oculto. **Mostrar estado** recupera la última ubicación visible. La selección se guarda por cuenta y **Cancelar verificación** sigue disponible durante una reverificación.

## Qué ofrece

- Descubre actividades a partir de los eventos del calendario. Reutiliza consultas vigentes y comprueba los estados de tareas y cuestionarios cuando corresponde.
- Conserva un historial local, las marcas manuales y las preferencias por cuenta. Gestiona los foros de forma manual.
- Recupera fallos transitorios de tareas y cuestionarios en la primera carga y las sincronizaciones habituales. Los fallos persistentes conservan el último estado conocido y su espera antes de una nueva verificación.
- Distingue cuestionarios sin intentos, no disponibles y sin estado reconocible dentro de Sin verificar. Muestra calificaciones numéricas explícitas en tareas entregadas cuando Moodle las proporciona.
- Permite filtrar por curso, personalizar la presentación y escoger entre Claro, Oscuro y Automático. El tema automático toma colores de Moodle y se adapta a Dark Reader.

## Instalación en Chrome

1. Descarga el ZIP de la versión que quieras instalar y extráelo en una carpeta permanente.
2. Abre `chrome://extensions`, activa **Modo de desarrollador** y selecciona **Cargar descomprimida**.
3. Elige la carpeta que contiene `manifest.json`. Mantén activa una sola copia del panel.
4. Abre el Área personal de Moodle UG con tu sesión iniciada y espera la sincronización inicial.
5. Si necesitas una revisión exhaustiva, usa **Reverificar todo**. Marca manualmente los foros en los que ya participaste.

Para actualizar una instalación existente, coloca los archivos nuevos en la misma carpeta que Chrome tiene cargada y pulsa **Recargar** en su tarjeta. Después recarga el Área personal. Así se conservan el ID de la extensión y sus datos locales.

## Uso del panel

| Vista | Qué muestra |
|---|---|
| Próximas | Actividades pendientes con fecha de entrega futura. |
| Atrasadas | Actividades pendientes cuyo plazo ya pasó. |
| Entregadas | Actividades con entrega reconocida por Moodle o marcada manualmente. |
| Pendientes | Actividades con entrega pendiente y foros por confirmar manualmente. |
| Sin verificar | Actividades cuyo estado sigue sin confirmarse. |

**Actualizar** vuelve a consultar el mes actual y los dos siguientes. Aprovecha los datos vigentes y verifica las actividades según su política de revisión. **Reverificar todo** amplía la consulta a seis meses y ofrece una segunda pasada para ciertos errores transitorios. El panel muestra un resumen de las consultas y los fallos.

En **Personalizar** puedes configurar la actualización automática cada 10, 15 o 30 minutos, o desactivarla. Allí también se ajustan la apariencia, el tamaño y la presentación de las categorías. **Diagnóstico de verificaciones** muestra la versión, el alcance de la última ejecución y los motivos de los fallos.

La advertencia roja de actividades indica que un reintento automático terminó con un fallo. Los fallos iniciales o aplazados siguen disponibles en Diagnóstico. Si la sesión caduca o la identidad no puede confirmarse, aparece un aviso específico.

## Límites

Moodle es la fuente oficial de las fechas, estados y calificaciones. El descubrimiento depende de los eventos que el calendario entregue. La actualización periódica depende de que la pestaña esté visible y Chrome pueda ejecutar el temporizador. Revamp consulta estados. Los envíos, los intentos de cuestionario y las publicaciones de foro se realizan desde Moodle.

## Desarrollo y créditos

Las pruebas usan Moodle simulado. Consulta [VERIFICACIONES.md](VERIFICACIONES.md) para ejecutarlas y [CHANGELOG.md](CHANGELOG.md) para conocer la evolución del proyecto.

Derivado de [Panel de Tareas UG](https://github.com/danieIabel/campus-ug), creado por Daniel Abel y Jonathan Peñafiel. Kleber Arteaga (RealMarshy) dirigió y optimizó Revamp con asistencia de ChatGPT y Codex. El aviso de copyright de la licencia MIT se conserva en `LICENSE`.

El código conserva la [licencia MIT y el aviso original](LICENSE). La ilustración original de Créditos se ofrece por separado bajo [CC0 1.0](assets/LICENCIA-ILUSTRACION.md).
