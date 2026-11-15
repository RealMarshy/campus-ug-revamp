# Historial de cambios

Este historial resume las versiones de Revamp, derivado de [Panel de Tareas UG](https://github.com/danieIabel/campus-ug).

## 2.5.1 (desarrollo)

- Actualizar puede volver a comprobar la sesión tras una redirección bloqueada. Las actualizaciones manuales simultáneas se coordinan entre pestañas. La actualización automática conserva su espera.

## 2.5.0 — The Daniel Update

- Las encuestas y los cuestionarios con cierre confirmado y participación desconocida aparecen en Pendientes y Sin verificar. La lista combinada muestra una sola fila por actividad.
- Integra las declaraciones manuales unificadas de la candidata 2.4.1 y conserva el historial, las calificaciones y la prioridad de la evidencia de Moodle.
- Reconoce el cierre de cuestionarios Moove sin historial visible y distingue las tareas bloqueadas por grupo, las disponibles y las que carecen de un control visible de entrega.

## 2.4.1 (candidata)

- Unifica las declaraciones manuales de tareas, cuestionarios, encuestas y foros. Conserva las marcas anteriores y da prioridad a la finalización y evaluación verificadas.
- Reconoce cuestionarios cerrados de Moodle UG cuya vista principal solo ofrece volver al curso. Si Moodle no muestra un historial de intentos, quedan en **Sin verificar** con la etiqueta «Cuestionario cerrado · Participación sin confirmar». Se conservan las finalizaciones verificadas y las marcas manuales.

## 2.4.0 — The Daniel Update

- Añade un filtro visual por vencimiento con dos calendarios y cuatro rangos relativos, combinable con las categorías, tipos y cursos.

- Añade accesos rápidos a Categorías y Tipos de actividad en el panel principal, sincronizados con Personalizar.

- Permite elegir las pestañas rápidas visibles y filtrar por tipo de actividad en ambas vistas.
- Renombra Filtros personalizados a Lista simple (Antiguo) y organiza los controles en dos recuadros.
- Permite desactivar un rango rápido al volver a pulsarlo, con los demás filtros conservados.
- Reconoce intentos finalizados en las tarjetas de Moove, primeros intentos disponibles y aperturas futuras verificadas en el encabezado de Moodle UG. Una apertura programada queda en Próximas y Pendientes sin inferir la participación.
- Distingue tareas disponibles para agregar una entrega y tareas bloqueadas por falta de grupo. Conserva la calificación explícita de tareas evaluadas sin envío registrado y muestra la nota final del cuestionario cuando se puede verificar.

## 2.3.0

- Descubre encuestas a partir de eventos de apertura y cierre. Comprueba su estado en la vista principal y conserva las confirmaciones y marcas manuales.
- Clasifica los foros por confirmar según su vencimiento y los conserva también en Pendientes.

## 2.2.0

- La advertencia de actividades cuenta las recuperaciones automáticas que fallaron y permanece hasta que esas actividades se comprueben con éxito. Los fallos iniciales y aplazados se muestran en Diagnóstico.

- Ocultar y Mostrar estado quedan dentro de Personalizar y comparten la preferencia guardada con Ubicación del estado. Cancelar verificación sigue accesible en el panel.
- El resumen y el diagnóstico empiezan ocultos en las cuentas sin una ubicación guardada. Se conservan las elecciones previas de Arriba, Abajo u Oculto.

- Un primer intento disponible y verificado aparece en Próximas o Atrasadas según el vencimiento. La ausencia de intentos por sí sola sigue en Sin verificar.

- Sin verificar distingue los cuestionarios sin intentos, no disponibles y sin estado reconocible. Un intento finalizado sigue apareciendo en Entregadas.
- Los títulos del calendario se presentan como texto plano con una sola pasada de decodificación de entidades.
- Las tareas entregadas muestran la última calificación numérica explícita que Moodle devolvió dentro del plazo de vigencia. La información sale de la consulta habitual de la tarea.

## 2.1.0 — Recuperación automática de errores transitorios en todas las sincronizaciones aplicables

- La primera carga, las sincronizaciones habituales y Actualizar reutilizan la segunda ronda selectiva de Reverificar todo.
- La recuperación periódica se limita a dos actividades y 25 segundos. Cede ante una acción manual y deja de despachar reintentos cuando se oculta la pestaña.
- El resumen distingue los fallos iniciales, reintentos, recuperaciones y fallos persistentes. La reverificación individual sigue realizando una sola consulta.

## 2.0.9.1

- Automático toma los colores de Moodle y Dark Reader para el panel, sus controles, Personalizar y Créditos. Los cambios visuales se aplican sin reconstruir las filas.
- El paquete de distribución incorpora una ilustración original en Créditos y conserva el comportamiento del diálogo.
- Créditos reconoce a Daniel Abel, Jonathan Peñafiel y Kleber Arteaga e incluye enlaces a sus perfiles de GitHub.
- Cancelar verificación se muestra en la barra de estado. La cabecera conserva su posición al iniciar, cancelar o terminar la revisión.

## 2.0.9

- Se incorporaron los temas Automático, Claro y Oscuro y la compatibilidad con Dark Reader.

## 2.0.8

- Se añadió la actualización periódica configurable y su coordinación entre pestañas de la misma cuenta.

## 2.0.7

- Actualizar consulta de nuevo el mes actual y los dos siguientes para detectar publicaciones recientes. El resumen indica meses consultados, reutilizados y actividades descubiertas.

## 2.0.6

- Se ampliaron las preferencias de presentación y los filtros. Los cambios visuales se guardan por cuenta.

## 2.0.5

- Reverificar todo pasó a recuperar fallos transitorios elegibles mediante una segunda pasada acotada, incluidos los timeouts.

## 2.0.4

- Se afinó la vigencia de las verificaciones, se incorporó el archivado operativo reversible y se amplió el entorno de Moodle simulado.

## 2.0.3

- Se añadió un historial persistente compatible con los datos anteriores. Los foros pasaron a control manual.
- Se amplió el reconocimiento del primer intento de cuestionario en español.

## 2.0.2

- Se ampliaron las estructuras de Moodle reconocidas y se distinguieron las fases de espera HTTP y los errores de vista.

## 2.0.1

- Se incorporaron diagnósticos de verificaciones, clasificación de fallos y tiempos de espera para los reintentos.

## 2.0.0

- Primera optimización de Revamp con caché, verificaciones acotadas y coordinación de la sincronización.
