# Campus UG Revamp 2.5.0 — The Daniel Update

Extensión comunitaria e independiente para Chrome que reúne las actividades del Área personal de Moodle de la Universidad de Guayaquil. Usa Manifest V3. Este proyecto no es oficial ni está afiliado a la Universidad de Guayaquil o a Moodle.

**Descarga oficial** · [ZIP de Campus UG Revamp 2.5.0](https://github.com/RealMarshy/campus-ug-revamp/releases/download/v2.5.0/campus-ug-revamp-2.5.0.zip).

Los accesos rápidos **Categorías** y **Tipos de actividad** permiten elegir qué pestañas se muestran y filtrar por Tareas, Cuestionarios, Foros o Encuestas. Puedes seleccionar o deseleccionar todas las opciones y cerrar el menú desde el mismo botón o con **Escape**. En **Personalizar** puedes cambiar de vista y restaurar los valores predeterminados. Los tipos se combinan con el curso en ambas vistas. **Lista simple (Antiguo)** reúne las categorías seleccionadas sin duplicar actividades y recuerda su selección por separado.

**Fecha** filtra por vencimiento con un intervalo manual o con semanas y meses relativos a hoy. Los días inicial y final se incluyen completos. Las actividades sin vencimiento solo aparecen cuando Fecha está desactivado. Pulsa de nuevo el rango rápido activo para quitar el filtro Fecha y conservar los demás filtros. Puedes sustituir un rango rápido por uno manual con Aplicar fechas.

Revamp distingue las tareas que permiten agregar una entrega, las bloqueadas por falta de grupo y las que no ofrecen un control visible para entregar. Una evaluación explícita puede mostrarse como **Calificada sin envío en Moodle**. En cuestionarios, reconoce las tarjetas de intentos de Moove y muestra una apertura futura verificada en **Próximas** y **Pendientes**.

Una encuesta o un cuestionario con cierre confirmado y participación desconocida aparece en **Pendientes** y **Sin verificar**. La incertidumbre por sí sola no lo convierte en una actividad atrasada. Si combinas esas dos categorías en la Lista simple, cada actividad aparece una sola vez.

Usa **Participación** en foros y encuestas elegibles, o **Realización** en cuestionarios cerrados sin historial. En tareas y otros cuestionarios, **✓** sigue disponible para declarar que completaste la actividad cuando Moodle no ha confirmado su realización. El selector permite cambiar o retirar la declaración después. **Sin declarar** recupera el último estado conocido sin consultar Moodle. Una finalización o evaluación verificada conserva prioridad.

El resumen y el diagnóstico aparecen ocultos si la cuenta todavía no tiene una ubicación guardada. En **Personalizar → Ubicación del estado**, selecciona Arriba, Abajo u Oculto. **Mostrar estado** recupera la última ubicación visible. La selección se guarda por cuenta y **Cancelar verificación** sigue disponible durante una reverificación.

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

**Actualizar** vuelve a consultar el mes actual y los dos siguientes. Aprovecha los datos vigentes y verifica las actividades según su política de revisión. **Reverificar todo** amplía la consulta a seis meses y ofrece una segunda pasada para ciertos errores transitorios. El panel muestra un resumen de las consultas y los fallos.

En **Personalizar** puedes configurar la actualización automática cada 10, 15 o 30 minutos, o desactivarla. Allí también se ajustan la apariencia, el tamaño y la presentación de las categorías. **Diagnóstico de verificaciones** muestra la versión, el alcance de la última ejecución y los motivos de los fallos.

La advertencia roja de actividades indica que un reintento automático terminó con un fallo. Los fallos iniciales o aplazados siguen disponibles en Diagnóstico. Si la sesión caduca o la identidad no puede confirmarse, aparece un aviso específico.

## Límites

Moodle es la fuente oficial de las fechas, estados y calificaciones. El descubrimiento depende de los eventos que el calendario entregue. La actualización periódica depende de que la pestaña esté visible y Chrome pueda ejecutar el temporizador. Revamp consulta estados. Los envíos, los intentos de cuestionario y las publicaciones de foro se realizan desde Moodle.

## Desarrollo y créditos

Las pruebas usan Moodle simulado. Consulta [VERIFICACIONES.md](VERIFICACIONES.md) para ejecutarlas y [CHANGELOG.md](CHANGELOG.md) para conocer la evolución del proyecto.

Derivado de [Panel de Tareas UG](https://github.com/danieIabel/campus-ug), creado por Daniel Abel y Jonathan Peñafiel. Kleber Arteaga (RealMarshy) dirigió y optimizó Revamp con asistencia de ChatGPT y Codex. El aviso de copyright de la licencia MIT se conserva en `LICENSE`.

El código conserva la [licencia MIT y el aviso original](LICENSE). La ilustración original de Créditos se ofrece por separado bajo [CC0 1.0](assets/LICENCIA-ILUSTRACION.md).
