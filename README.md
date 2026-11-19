# Campus UG Revamp 2.6.0 (desarrollo)

Extensión comunitaria e independiente para Chrome que reúne las actividades del Área personal de Moodle de la Universidad de Guayaquil. Usa Manifest V3. Este proyecto no es oficial ni está afiliado a la Universidad de Guayaquil o a Moodle.

**Versión estable** · [Descarga de Campus UG Revamp 2.5.1](https://github.com/RealMarshy/campus-ug-revamp/releases/tag/v2.5.1).

Los accesos rápidos **Categorías** y **Tipos de actividad** permiten elegir qué pestañas se muestran y filtrar por Tareas, Cuestionarios, Foros o Encuestas. Puedes seleccionar o deseleccionar todas las opciones y cerrar el menú desde el mismo botón o con **Escape**. En **Personalizar** puedes cambiar de vista y restaurar los valores predeterminados. Los tipos se combinan con el curso en ambas vistas. **Lista simple (Antiguo)** reúne las categorías seleccionadas sin duplicar actividades y recuerda su selección por separado.

**Fecha** filtra por vencimiento con un intervalo manual o con semanas y meses relativos a hoy. Los días inicial y final se incluyen completos. Las actividades sin vencimiento solo aparecen cuando Fecha está desactivado. Pulsa de nuevo el rango rápido activo para quitar el filtro Fecha y conservar los demás filtros. Puedes sustituir un rango rápido por uno manual con Aplicar fechas.

Revamp distingue las tareas que permiten agregar una entrega, las bloqueadas por falta de grupo y las que tienen confirmada la ausencia de una opción para entregar. En tareas entregadas, también informa si Moodle ofrece un control válido para editar la entrega o confirma una restricción. Si el permiso de edición es incierto, solo muestra la entrega confirmada. Una evaluación explícita puede mostrarse como **Calificada sin envío en Moodle**. En cuestionarios, reconoce las tarjetas de intentos de Moove y muestra una apertura futura verificada en **Próximas** y **Pendientes**.

Una encuesta o un cuestionario con cierre confirmado y participación desconocida aparece en **Pendientes** y **Sin verificar**. La incertidumbre por sí sola no lo convierte en una actividad atrasada. Si combinas esas dos categorías en la Lista simple, cada actividad aparece una sola vez.

Usa **Participación** en foros y encuestas elegibles, o **Realización** en cuestionarios cerrados sin historial. En tareas y otros cuestionarios, **✓** sigue disponible para declarar que completaste la actividad cuando Moodle no ha confirmado su realización. El selector permite cambiar o retirar la declaración después. **Sin declarar** recupera el último estado conocido sin consultar Moodle. Una finalización o evaluación verificada conserva prioridad.

Cada fila distingue lo que Moodle confirmó, lo que declaraste y la disponibilidad conocida. Por ejemplo, una tarea sin envío puede decir **No entregada según Moodle · Necesitas pertenecer a un grupo**. Si la vista principal de una tarea entregada está completa y no ofrece edición, indica **No aparece la opción para editar**. La fecha **Verificado el** aparece junto al estado de la actividad cuando el resumen está Arriba o Abajo. Con el resumen Oculto, puedes consultar las fechas guardadas en **Personalizar → Modo desarrollador → Ver diagnóstico → Fechas de comprobación**.

El resumen y el diagnóstico aparecen ocultos si la cuenta todavía no tiene una ubicación guardada. En **Personalizar → Modo desarrollador → Ubicación del estado**, selecciona Arriba, Abajo u Oculto. **Mostrar estado** recupera la última ubicación visible. La selección se guarda por cuenta y **Cancelar verificación** sigue disponible durante una reverificación.

## Qué ofrece

- Descubre actividades a partir de los eventos del calendario. Reutiliza consultas vigentes y comprueba los estados de tareas y cuestionarios cuando corresponde.
- Conserva un historial local, las marcas manuales y las preferencias por cuenta. Gestiona los foros de forma manual.
- Recupera fallos transitorios de tareas y cuestionarios en la primera carga y las sincronizaciones habituales. Los fallos persistentes conservan el último estado conocido y su espera antes de una nueva verificación.
- Distingue cuestionarios disponibles, programados, restringidos y finalizados según la evidencia de Moodle. Muestra calificaciones numéricas explícitas de tareas y cuestionarios cuando puede verificarlas.
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
| Pendientes | Actividades por realizar, foros por confirmar y encuestas o cuestionarios cerrados con participación sin confirmar. |
| Sin verificar | Actividades cuyo estado sigue sin confirmarse. |

**Actualizar** vuelve a consultar el mes actual y los dos siguientes. Además de comprobar las actividades nuevas o con datos vencidos, puede adelantar hasta tres lecturas de actividades cercanas al vencimiento para detectar entregas y calificaciones. El resumen indica cuántas actividades se comprobaron y cuántas conservaron el resultado guardado. Para comprobar de inmediato una actividad concreta, usa su botón de reverificación. **Reverificar todo** amplía la consulta a seis meses. [Política y plan de 2.6.0](docs/PLAN-2.6.0.md)

Si el panel indica que no pudo comprobar tu sesión, vuelve al Área personal y pulsa **Actualizar**. Si el aviso indica que la sesión está en espera, deja pasar 30 segundos desde la última comprobación manual antes de intentarlo de nuevo.

En **Personalizar → Modo desarrollador** puedes configurar la actualización automática cada 10, 15 o 30 minutos, o desactivarla. Personalizar muestra directamente la apariencia, el tamaño del panel, el tamaño de letra y la vista de categorías. **Diagnóstico de verificaciones** muestra la versión, el alcance de la última ejecución y los motivos de los fallos.

**Consultar error** aparece si un fallo sigue activo después de agotar su recuperación, si no hay recuperación automática aplicable o si necesitas intervenir, como cuando caduca la sesión. Las comprobaciones pendientes se pueden consultar en **Personalizar → Modo desarrollador → Ver diagnóstico**. Allí puedes copiar el informe técnico sanitizado.

## Límites

Moodle es la fuente oficial de las fechas, estados y calificaciones. El descubrimiento depende de los eventos que el calendario entregue. La actualización periódica depende de que la pestaña esté visible y Chrome pueda ejecutar el temporizador. Revamp consulta estados. Los envíos, los intentos de cuestionario y las publicaciones de foro se realizan desde Moodle.

## Desarrollo y créditos

Las pruebas usan Moodle simulado. Consulta [VERIFICACIONES.md](VERIFICACIONES.md) para ejecutarlas y [CHANGELOG.md](CHANGELOG.md) para conocer la evolución del proyecto.

Derivado de [Panel de Tareas UG](https://github.com/danieIabel/campus-ug), creado por Daniel Abel y Jonathan Peñafiel. Kleber Arteaga (RealMarshy) dirigió y optimizó Revamp con asistencia de ChatGPT y Codex. El aviso de copyright de la licencia MIT se conserva en `LICENSE`.

El código conserva la [licencia MIT y el aviso original](LICENSE). La ilustración original de Créditos se ofrece por separado bajo [CC0 1.0](assets/LICENCIA-ILUSTRACION.md).
