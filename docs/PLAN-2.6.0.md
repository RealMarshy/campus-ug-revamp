# Desarrollo de Campus UG Revamp 2.6.0

## Base y alcance

La rama `desarrollo-2.6.0` parte del tag público `v2.5.1` en `a0d40452128515abeb946d2a88cd78e4a4f6e8eb`. Ambos árboles pueden probarse en perfiles temporales con el mismo calendario y las mismas respuestas sintéticas. La instalación habitual de Chrome sigue en la versión estable.

## Diagnóstico de 2.5.1

| Acción | Calendario | Actividades |
| --- | --- | --- |
| Inicio o F5 | Presenta primero los datos locales y verifica la cuenta con un GET. Reutiliza los tres meses anteriores por 24 h y el mes actual y los dos siguientes por 15 min. | Consulta al faltar evidencia oficial, cambiar los metadatos o vencer el TTL de 10 min para pendientes y 24 h para completadas. |
| Actualizar | Fuerza los tres meses recientes. Otra pestaña puede reutilizar los meses que terminaron después de su clic. | Aplica la misma vigencia que F5. Un cambio de entrega o de nota por sí solo puede dejar el evento de calendario idéntico. |
| Reverificar todo | Solicita los seis meses después de confirmar la cuenta. | Incluye las actividades conocidas de esos meses, incluso con un cierre archivado o una marca manual. Mantiene el tratamiento manual de foros. |
| Reverificación individual | Utiliza la URL guardada y comprueba la cuenta de la respuesta de la actividad. | Fuerza una lectura de la actividad seleccionada y comparte una lectura concurrente mediante su marca de verificación. |
| Periódica | Consulta los tres meses recientes. Al recuperar visibilidad también considera el historial según su vigencia. | Respeta las marcas manuales, el TTL y el backoff. Cede ante operaciones manuales y deja de iniciar trabajo si se oculta la pestaña. |

La evidencia de cierre posterior a una fecha de cierre confirmada permite archivar la comprobación hasta siete días. Un cambio en esa fecha o en los metadatos reactiva la comprobación. El cruce de una apertura de cuestionario verificada también invalida la caché. El vencimiento por sí solo no demuestra participación. El calendario conserva los eventos conocidos y sus identificadores activos por mes. La ausencia en una respuesta posterior excluye el evento de la selección automática, pero la actividad sigue en el historial local. Los filtros, el límite de filas y los meses consultados afectan a lo que se ve o se descubre.

Las consultas se serializan por cuenta entre pestañas con Web Locks. Dentro de una sincronización hay hasta tres lecturas concurrentes y se comparten las solicitudes idénticas en curso. El backoff ordinario comienza en dos minutos para fallos de transporte y en treinta para los demás, con límite de seis horas. La recuperación aplica solo a errores elegibles. Respeta Retry-After y ejecuta en serie hasta seis reintentos en 75 s o dos en 25 s para el modo periódico. Un fallo conserva la evidencia académica anterior.

## Primer incremento

Solo el botón **Actualizar** puede adelantar verificaciones. Primero se respeta la decisión ordinaria de la actividad. Entre las actividades que esta decisión reutilizaría, se eligen hasta tres lecturas adicionales por cuenta y por lote. Se espera al menos un minuto desde el último lote y desde la última lectura válida de una actividad. Una nota ya visible se vuelve a comprobar a partir de los cinco minutos. Estos límites son decisiones de diseño para este incremento.

Se consideran vencimientos a catorce días o menos del momento de la consulta, en ambas direcciones. Se distribuyen los tres lugares entre actividades pendientes susceptibles de entrega, tareas o cuestionarios completados sin nota y tareas o cuestionarios con nota. Si un grupo está vacío, los otros aprovechan los lugares. Dentro de cada grupo se atiende primero la comprobación más antigua, luego el vencimiento más cercano y finalmente la clave del módulo. Una comprobación académica nueva, vencida o invalidada sigue su curso ordinario fuera del cupo. Una actividad archivada solo puede recibir una lectura adelantada si está completada y admite una nota.

Un clic posterior al final de un lote vuelve a comprobar el calendario. Si el clic de otra pestaña ya estaba en espera y la primera terminó una actualización válida, la segunda comprueba la identidad de su documento y consume el resultado persistido de la misma cuenta bajo el Web Lock. Una actualización parcial conserva la política de reutilización por mes y backoff. La cuota y los sellos de verificación se leen bajo el mismo bloqueo. Diagnóstico distingue lecturas adelantadas, candidatas aplazadas y resultados reutilizados. La prueba comparativa carga los scripts de referencia directamente del tag.

## Comprobación en Moodle UG

Con una instalación de prueba independiente, anotar en Diagnóstico las lecturas de F5. Tras entregar una tarea cercana al vencimiento o recibir una nota, esperar el intervalo aplicable, pulsar Actualizar y contrastar el resultado con la vista oficial y los contadores. Repetir el clic y probar con dos pestañas. Si hay más candidatas que lugares, comparar la reverificación individual de la actividad concreta. Registrar únicamente contadores y tiempos, sin contenido de Moodle. Los tiempos de Chrome en loopback incluyen procesamiento local y planificación del navegador. La latencia y la carga del servidor UG requieren mediciones reales.

## Etapas posteriores

2. **Choice.** Investigar el descubrimiento en el calendario, apertura y cierre, evidencia propia en `#yourselection`, disponibilidad, declaración manual y aislamiento por cuenta con fixtures sintéticos.
3. **Foros.** Evaluar una opción desactivada por defecto. Una publicación debe poder atribuirse a la cuenta actual. Los contadores del foro y mensajes de terceros son insuficientes.
4. **Tutorial.** Preparar la bienvenida al estabilizar los flujos.
5. **Auditoría y publicación.** Ejecutar la validación integral y revisar la seguridad antes de solicitar autorización de lanzamiento.

Una actividad que nunca aparece en los meses consultados requiere otra fuente para descubrirse. Explorar páginas de cursos costaría al menos una lectura por curso, exigiría ampliar la lista interna de rutas autorizadas y verificar cuenta, curso y enlaces en cada respuesta. Esa opción queda para evaluación posterior.
