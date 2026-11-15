# Verificaciones de Campus UG Revamp

## Recuperación de sesión y recargas · 2.5.1

En 2.5.0, la condición `!force` aplicaba la espera de `failures.session` a Actualizar, a la sincronización normal y a la periódica antes de consultar la sesión. El modo individual ya omitía esa consulta y comprobaba la identidad de la actividad. Reverificar todo evitaba esa espera y conservaba su alcance de seis meses. Chrome reprodujo un 302 sintético rechazado en la consulta a `/my/`, seguido de cero lecturas al pulsar Actualizar cuando la sesión ya era válida.

Actualizar permite una comprobación inmediata tras el primer `REDIRECT` consecutivo. Si la respuesta vuelve a ser una redirección, se admite como máximo una comprobación manual cada 30 segundos mientras dure la espera automática, que comienza en 30 minutos y se duplica por cada fallo consecutivo hasta seis horas. Los demás fallos conservan sus reglas y el modo individual conserva su comportamiento. Si la identidad se valida, se limpia el fallo y se procesan calendario y actividades según la política habitual de Actualizar. Si la identidad falla, la ejecución termina antes del calendario. Las respuestas 3xx y `opaqueredirect` siguen rechazándose con `redirect: "manual"` y credenciales limitadas al mismo origen.

El Web Lock por cuenta serializa las ejecuciones. Tras una redirección, el sello opcional `refreshSessionAt` en el registro de verificación existente permite que una segunda pulsación simultánea reutilice el resultado de la primera sin hacer peticiones ni escribir datos académicos. Las actualizaciones simultáneas con sesión sana conservan su coordinación de calendario existente. El sello es local y la versión del esquema se conserva. Diagnóstico distingue los resultados `requested`, `shared` y `waiting` en `lastRun.sessionProbe`.

### Comparación reproducible de F5

Se ejecuta con `node tests/run-browser.cjs session-baseline session` y `UG_PLAYWRIGHT_CLI` configurado. La referencia carga los scripts del tag local `v2.5.0`. Los datos, el calendario y la sesión son sintéticos. Se hicieron tres recargas por escenario y versión en Chrome 157. Los tiempos son medianas en milisegundos. Panel y primera fila se observan desde el inicio de navegación. JavaScript es el delta observado de `ScriptDuration` de Chrome durante cada recarga, que incluye el fixture y varía según cómo se reutiliza el proceso.

| Escenario | Versión | Panel | Primera fila | Sincronización | JavaScript | Renderizados | HTTP Revamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Caché vigente | 2.5.0 | 24,9 | 28,8 | 11 | 2,33 | 8 | 1 |
| Caché vigente | 2.5.1 | 23,9 | 28,0 | 11 | 2,41 | 8 | 1 |
| REDIRECT en espera | 2.5.0 | 22,1 | 26,2 | 1 | 0,25 | 8 | 0 |
| REDIRECT en espera | 2.5.1 | 21,2 | 25,8 | 1 | 2,45 | 8 | 0 |
| Después de recuperar | 2.5.0 | 21,8 | 26,1 | 11 | 0,05 | 8 | 1 |
| Después de recuperar | 2.5.1 | 21,3 | 25,5 | 10 | 2,25 | 8 | 1 |

La diferencia de la primera fila fue inferior a 1 ms en los tres escenarios de la corrida final. La primera corrida registró variaciones de hasta 6 ms y el delta de JavaScript mostró variabilidad entre recargas. Los conteos de renderizados y HTTP se conservaron. Estas mediciones locales no permiten atribuir la lentitud observada en Moodle UG a Revamp.

Tras desbloquear el fixture con una actividad nueva, Actualizar pasó de cero solicitudes en 2.5.0 a una comprobación de sesión, tres meses de calendario y una lectura de la nueva actividad en 2.5.1. Dos pestañas simultáneas compartieron una comprobación y tres lecturas de calendario. El ZIP extraído cargó en Chrome 157 y reanudó sesión, calendario y actividad después de un 302 sintético. El paquete público de ocho archivos pesa **75.125 bytes**. SHA-256 `7347FF91EA05EEE49E04D07B716EFE6CD2EDBE52C53DD70892EDF8924466A280`.

Pasaron **43 pruebas Node y 858 comprobaciones en 26 suites de Chrome**, sin fallos ni omisiones. La suite nueva aportó 22 comprobaciones y la comparación con 2.5.0 aportó cuatro. La primera corrida conjunta detectó que la coordinación abarcaba también una sesión sana. Se acotó la coordinación nueva a las actualizaciones relacionadas con `REDIRECT` y se repitió toda la batería. Las regresiones existentes verifican la compatibilidad del almacenamiento, las calificaciones, las declaraciones y el funcionamiento local de los filtros.

En Moodle UG, recarga la extensión existente y el Área personal. Si vuelve a aparecer un `REDIRECT`, vuelve al Área personal con sesión válida y pulsa Actualizar. Revisa que `lastRun.sessionProbe` indique `requested` o `shared`, que desaparezca el fallo activo de sesión y que el calendario reanude su política de consulta. `checked: 0` puede ser válido si las comprobaciones académicas siguen vigentes.

## Publicación de 2.5.0

El usuario confirmó en Moodle UG la clasificación de encuestas y cuestionarios cerrados, las tres opciones de declaración manual y las tres variantes de disponibilidad de tareas. La auditoría final volvió a ejecutar 43 pruebas Node y 832 comprobaciones en 24 suites de Chrome. Todas pasaron, sin omisiones. El ZIP final cargó como extensión Manifest V3 en Chrome 157 aislado. La prueba confirmó que el cuestionario cerrado aparece en Pendientes y Sin verificar y que declarar o retirar la decisión no añade solicitudes.

El ZIP final contiene ocho archivos públicos. Solo su README difiere del paquete de desarrollo validado. Conserva el aviso original de la licencia MIT y la ilustración pública CC0 1.0. Pesa 74.671 bytes y su SHA-256 es `B94A51488459075BA72B3DEEC32FF8C1555341091D370EABB735D88D59BC3D54`. La instalación personal conserva la versión 2.5.0, su ruta, ID, almacenamiento e ilustración privada.

## Actividades cerradas pendientes de confirmación · 2.5.0 desarrollo

En 2.4.1, el estado base de una encuesta o un cuestionario cerrado con participación desconocida era Sin verificar. Pendientes ya incluía Próximas y Atrasadas. En 2.5.0 se conserva ese estado base y se añade una condición de pertenencia a Pendientes. Los contadores y ambas vistas usan el mismo criterio después de aplicar los filtros de curso, tipo y fecha. La Lista simple deduplica por módulo e identificador de actividad.

La condición se calcula en memoria con los estados verificados. Para Feedback exige estado cerrado y que el sello de verificación coincida con el cierre vigente. Para cuestionarios exige `quiz_closed_unknown` y descarta fechas explícitas de cierre futuras, contradictorias o actualizadas después de la verificación. La actividad debe carecer de una decisión manual, finalización verificada y fallo de lectura activo. Los foros y las tareas mantienen sus reglas. No se añadieron lecturas de Moodle, temporizadores ni campos persistentes.

Con una declaración afirmativa la actividad pasa a Entregadas. La negativa mantiene Pendientes y pasa a Atrasadas cuando corresponde por vencimiento. Retirar la declaración vuelve a mostrar el estado almacenado y recupera la doble pertenencia si sigue siendo aplicable. Chrome 157 confirmó la persistencia de una declaración tras reiniciar un perfil aislado con el ZIP extraído. Seleccionar y retirar la declaración no generó solicitudes adicionales a actividades ni al calendario.

Pasaron 43 pruebas Node y 832 comprobaciones en las 24 suites conjuntas de Chrome, sin fallos ni omisiones. Cuestionarios aprobó 121 comprobaciones y Feedback 73. La copia y el ZIP de desarrollo son independientes de 2.4.1. El ZIP pesa 74.633 bytes y su SHA-256 es `40D5701B4E597503D924C1FE6E1A3F4CCF6B5AFE8D9BD3FC9453102FCD48CD7F`.

En la integración posterior se repitieron las 43 pruebas Node y las 832 comprobaciones de las 24 suites de Chrome, con cero fallos y omisiones. La restauración de los tres archivos de la extensión personal se comprobó en una réplica con hashes idénticos al respaldo 2.4.1. La integración conserva la carpeta y el registro de Chrome y usa el mismo esquema de almacenamiento. La prueba diaria puede hacerse recargando la extensión existente y el Área personal. El ZIP público reconstruido coincide byte a byte con el que se probó en Chrome y contiene los ocho archivos públicos, incluida la licencia MIT y la ilustración CC0 1.0.

Para una comprobación en Moodle UG, carga esta copia descomprimida en un perfil aparte de Chrome. Abre el Área personal con tu sesión en ese perfil y busca una encuesta cerrada sin confirmación y un cuestionario con `quiz_closed_unknown`. Con Sin declarar, ambos deben aparecer en Pendientes y Sin verificar, sin entrar en Atrasadas. Selecciona esas dos categorías en Lista simple y comprueba una sola fila por actividad. Prueba cada declaración y su retirada para comprobar que los contadores se actualizan.

## Variante Moove de tarea sin opción visible de entrega · 2.4.1 candidata

En el fixture anterior, «Todavía no se han realizado envíos» pasaba ambas comprobaciones. Al sustituir únicamente ese texto por «No se ha enviado nada en esta tarea», Chrome reprodujo el diagnóstico real: `state: "no_submission"`, `groupNotice: "missing"` y `result: "none"`. La primera expresión reconocía la frase y la segunda la omitía. La segunda condición se ejecuta antes de guardar y presentar la disponibilidad.

El nuevo fixture sintético incluye una tabla Moove con grupo, intento, estado de envío, calificación, tiempo restante y comentarios, además de navegación. La frase se reconoce en las dos comprobaciones. Un nombre de grupo dentro de su fila no se trata como aviso de bloqueo. Los controles de comentarios y navegación no son controles de entrega. Se conserva la respuesta conservadora ante avisos ambiguos, un formulario de entrega de otro módulo o una tabla ocupada. El ZIP extraído mostró la etiqueta en Chrome 157 con un solo GET por verificación.

Pasaron 42 pruebas Node y 824 comprobaciones en 24 suites de Chrome, sin fallos ni omisiones. Evidencias pasó 80 comprobaciones, incluidas la persistencia, el sello exacto y el aislamiento tras reverificar la misma actividad en otra cuenta sintética. Se sincronizaron la instalación personal, el borrador local y el ZIP 2.4.1 de 74.282 bytes. SHA-256 `B55E681CF03578E820A701EB197236C2CD3892D63EEFE822FAA2ECCE5176A7FC`. En Moodle UG queda por recargar la extensión y reverificar la fila para comprobar `lastRun.assignGroup.result: "no_submission_option"`.

## Tarea sin opción visible de entrega · 2.4.1 candidata

El estado anterior de disponibilidad omitía el campo tanto cuando faltaba un control como cuando la vista no aportaba suficiente evidencia. Revamp solo añade «Sin opción para entregar» tras leer la vista principal y confirmar la identidad del módulo, una única fila visible de ausencia de envío y la ausencia de controles o avisos que hagan ambigua esa lectura. Reutiliza el campo de disponibilidad existente. Los estados anteriores conservan su etiqueta hasta una nueva comprobación. Las entregas, las evaluaciones, el bloqueo por grupo y los errores mantienen sus etiquetas.

El fixture sintético de apertura futura conserva el vencimiento y el formato exacto del sello de verificación. Las fechas del encabezado no se usan para inferir cierre ni bloqueo. La comprobación usa el mismo GET de la tarea. El ZIP extraído en Chrome 157 confirmó la etiqueta y el indicador `lastRun.assignGroup.result: "no_submission_option"`.

Pasaron 42 pruebas Node y 815 comprobaciones en las 24 suites de Chrome, sin fallos ni omisiones. Se sincronizaron la instalación personal y el borrador con el ZIP candidato de 74.123 bytes. SHA-256 `5C46992C6389AFB371E926460051F8EA82E7E2DB3E63B7983197A95DF5588B30`. Para verificar en Moodle UG, recarga la extensión existente, recarga el Área personal y pulsa ⟳ en la fila correspondiente.

## Declaraciones manuales unificadas · 2.4.1 candidata

Antes del cambio, tareas, cuestionarios y foros usaban una marca booleana guardada en el historial por cuenta y actividad. Las encuestas ya distinguían una declaración explícita de una marca antigua. Los foros conservaban confirmaciones históricas y no se consultaban automáticamente. La clasificación y los contadores se derivaban del estado efectivo de cada fila. En tareas y cuestionarios, el doble clic retiraba la marca y podía iniciar una sincronización.

El selector reutiliza ese historial, Web Locks, el renderizado y los filtros. Las decisiones nuevas guardan `yes` o `no` en el registro manual existente. Sin declarar guarda la retirada y recupera la evidencia almacenada. Los valores de encuestas anteriores se interpretan al leerlos y una marca negativa antigua conserva su valor booleano e indicación de procedencia. No se realiza una migración destructiva.

Se muestra el selector directamente en cuestionarios con cierre reconocido y participación desconocida, encuestas con cierre confirmado y foros por confirmar. En tareas y otros cuestionarios que admiten marcado manual, ✓ declara la realización y deja disponible el selector para cambiar o retirar la decisión. El vencimiento por sí solo no se interpreta como cierre efectivo. Las finalizaciones verificadas y evaluaciones conservan su prioridad. Si existe una declaración negativa en conflicto con una finalización oficial, la fila conserva la evidencia y muestra la contradicción. Las fechas y notas provienen de la evidencia original. No se añaden solicitudes de red ni temporizadores.

La validación real anterior confirmó `quiz_closed_unknown` con cero fallos. La interfaz de participación de esta candidata aún requiere verificación en Moodle UG.

La batería conjunta aprobó 42 pruebas Node y 812 comprobaciones en 24 suites de Chrome, sin fallos ni omisiones. Se probaron las tres decisiones, su clasificación, el aislamiento por cuenta, las marcas anteriores, ambas vistas, el alcance de los filtros y la prioridad de la evidencia oficial. En Chrome se comprobó foco, nombre accesible y geometría a 320 y 360 px con Claro, Oscuro y Automático con señales de Dark Reader simuladas. La primera corrida de Recuperación reveló una expectativa anterior que excluía una entrega oficial por su marca negativa heredada. Se actualizó el fixture para exigir que conserve la entrega y se repitió la batería completa.

El ZIP extraído funcionó en Chrome aislado. Tras cerrar y reabrir el mismo perfil desechable, se conservó la declaración. Se probaron las tres decisiones sin lecturas nuevas. El ZIP candidato de ocho archivos públicos pesa **73.880 bytes**. SHA-256 `12E80265FEC57F64F5702070EC2E215F46EF8331AA2307A720E372020C26B124`.

## Cuestionario cerrado sin historial visible · 2.4.1 candidata

El reporte de Moodle UG describe una vista principal de Moove con las fechas «Abrió» y «Cerró» y un formulario GET para volver al curso. El HTML autenticado no se incorporó al proyecto. Con un fixture sintético equivalente, 2.4.0 devolvió `SELECTOR_MISSING`. Su ruta de reconocimiento requería un aviso conocido, una declaración explícita de ausencia de intentos o un inicio válido para llegar al detector de fechas. El formulario de regreso no cumplía ninguna de esas condiciones. Además, el lector de fechas admitía las etiquetas de una ventana futura.

El detector reutiliza la comprobación de identidad y del encabezado Moove. Requiere una apertura anterior al cierre, un cierre ya alcanzado y concordancia con el minuto del calendario si hay un evento de cierre confirmado. La zona horaria es Ecuador continental. La vista debe mostrar el contexto del cuestionario y el formulario de regreso al curso sin señales de intentos, de inicio o de una restricción distinta. Si las señales contradicen el cierre, se mantiene el resultado conservador anterior.

El estado `quiz_closed_unknown` permanece en **Sin verificar** con la etiqueta «Cuestionario cerrado · Participación sin confirmar». El cierre no se usa como prueba de finalización ni para archivar la actividad. Una finalización histórica y su calificación conservan prioridad. La verificación individual usa el mismo GET de la vista del cuestionario.

Pasaron 41 pruebas Node y 801 comprobaciones en 24 suites conjuntas de Chrome, sin fallos ni omisiones. La suite de cuestionarios aprobó 108 comprobaciones, incluida la regresión de `quiz-opening-ug-header-3`. El ZIP extraído cargó como Manifest V3 en Chrome 157 y confirmó la etiqueta y el diagnóstico con una lectura por verificación. El paquete candidato pesa **73.389 bytes**. SHA-256 `117A7905B22670D198737450C63003432ABFCF464BF2EF450E60DB9AAEB91D5F`. La Release estable v2.4.0 conserva su propio ZIP.

Para comprobarlo en Moodle UG, recarga la extensión existente desde `chrome://extensions`, recarga el Área personal y pulsa ⟳ en esa fila. En Diagnóstico, comprueba `version: "2.4.1"`, `lastRun.mode: "one"`, `checked: 1`, `recognizedAbsences.quiz_closed_unknown: 1` y `activityErrors: 0`. La actividad no debe tener un fallo activo. Si había una entrega confirmada, comprueba que siga en Entregadas con su nota. Comparte únicamente esos indicadores sanitizados si el resultado difiere.

## Validación real previa a la publicación de 2.4.0

El usuario confirmó en Moodle UG las etiquetas «Sin entrega · Disponible para agregar entrega» y «Sin entrega · Bloqueada por grupo». También confirmó «No iniciado · Disponible para realizar» en un cuestionario disponible y el reconocimiento de dos cuestionarios con apertura futura mediante `quiz-opening-ug-header-3`. La batería automatizada de esta revisión aprobó 41 pruebas Node y 783 comprobaciones en 24 suites de Chrome, sin fallos ni omisiones.

Al preparar la publicación, se actualizó el README incluido en el ZIP. Sus otras siete entradas coinciden con el paquete validado en Chrome. Se verificaron el manifiesto, la licencia MIT y la licencia de la ilustración pública. El ZIP de lanzamiento pesa **72.888 bytes** y su SHA-256 es `8A8BEDBCB6184099E0A65027CED9FC46132D75EEC56B33090A66501666667163`.

## Bloqueo por grupo en Moodle UG · 2.4.0

La comprobación real de la tarea B mostró «Sin entrega · Disponible para agregar entrega». En la tarea A, Moodle mostró el aviso largo de bloqueo por falta de grupo y Revamp mostró «No entregada según Moodle». El texto facilitado por el usuario coincide con `noteam_desc` del español internacional de Moodle 4.5, incluida la errata «miempro». El detector anterior exigía la coincidencia completa de un aviso corto y rechazaba el largo. También omitía el aviso corto «No perteneces a ningún grupo.». La regresión sintética falló con el detector previo y reprodujo el rechazo en la estructura del renderer oficial. Queda por confirmar qué elementos exactos devuelve el GET de Moodle UG. [Renderer de Moodle 4.5](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/assign/classes/output/renderer.php#L647-L681) · [Paquetes oficiales de idiomas](https://download.moodle.org/langpack/4.5/)

El renderer de estudiante coloca `noteam` en la fila de grupo y agrega `noteam_desc` después de la tabla, dentro de `.submissionstatustable`. El detector acepta el aviso largo documentado en ese bloque de estado, además de las variantes cortas. Se excluyen los avisos ocultos, las instrucciones de la actividad y las restricciones genéricas. Los avisos fuera del bloque reconocido siguen siendo ambiguos. La coincidencia de cuenta, vista y módulo sigue siendo requisito para guardar la disponibilidad.

Al reconocer el aviso, Revamp guarda `group_blocked` junto con `done=false` y renderiza «Sin entrega · Bloqueada por grupo». La prueba de recarga confirma que el indicador no se pierde en el historial, la normalización ni la presentación. Una respuesta válida con el control habilitado de la misma tarea conserva «Disponible para agregar entrega». La entrega confirmada y la evaluación sin envío mantienen prioridad. Se reutiliza la única lectura de la tarea y se mantienen sus categorías y vencimiento.

La reverificación individual muestra `lastRun.assignGroup` en Diagnóstico. El bloque solo contiene indicadores enumerados y booleanos. No se guarda en almacenamiento. Para la tarea A se espera `moduleMatches: true`, `eligible: true`, `state: "no_submission"`, `groupNotice: "short"` o `"description"` y `result: "group_blocked"`. Para la tarea B se espera `result: "add_submission"`. Si la etiqueta difiere, comparte solo `lastRun.assignGroup` después de pulsar ⟳ en la fila. `missing` indica ausencia de candidatos visibles en el bloque reconocido y `unrecognized` indica que había candidatos cuyo texto no coincidió. `not_checked` indica que las condiciones previas no permitieron evaluar la disponibilidad.

La batería aprobó 41 pruebas Node y 783 comprobaciones en las 24 suites conjuntas de Chrome, sin fallos ni omisiones. Evidencias pasó 65 comprobaciones y Cuestionarios pasó 90, incluida la revisión `quiz-opening-ug-header-3`. Los seis escenarios auditados siguen cubiertos. En Chrome 157, la extensión extraída del ZIP también pasó una prueba sintética de carga, etiqueta y reverificación individual con `groupNotice: "description"`.

Se sincronizaron la carpeta personal, el borrador público local y el ZIP de ocho entradas. La ruta de la instalación, su almacenamiento y el JPG privado se conservaron. El ZIP contiene el PNG público y la licencia de la ilustración. La versión sigue en 2.4.0. Pesa **72.788 bytes** y su SHA-256 es `3F9BACC6C5FE23A5A80339B3CF96E26C3BC9077B09332D31FB8502FB1B8176C3`. La verificación de ambas etiquetas con este paquete en Moodle UG queda pendiente antes de publicar.

## Auditoría final de detectores de 2.4.0

| Caso | Evidencia y detector | Resultado y cobertura |
| --- | --- | --- |
| A. Tarea grupal bloqueada | Estado de envío y aviso explícito dentro de .submissionstatustable | El detector anterior confirmaba la falta de envío y omitía la causa. Ahora informa «Bloqueada por grupo» conservando la categoría por vencimiento. Se prueba también un control contradictorio y se da prioridad al bloqueo. |
| B. Tarea disponible | Estado de envío y control habilitado en un formulario GET de la vista de tarea con el módulo y la acción de edición esperados | Antes solo indicaba que faltaba la entrega. Ahora indica que Moodle permite agregarla. Se prueban ausencia, deshabilitación, módulo incorrecto y botón dentro de instrucciones. El control se inspecciona como evidencia y nunca se ejecuta. |
| C. Foro de preguntas y respuestas | Categoría por vencimiento y confirmación manual o histórica | Publicaciones ajenas y bloqueos de discusiones no se interpretan como participación ni disponibilidad general. El foro futuro puede aparecer en Próximas y Pendientes como actividad por atender. El estado de participación es manual y se comprueba que no se consulte ninguna página de foro. |
| D. Encuesta respondida y abierta | Aviso explícito de respuesta previa en el bloque de estado propio de Feedback | Entregadas aun con cierre futuro. La suite Feedback comprueba conservación frente a una respuesta posterior que solo indica disponibilidad. |
| E. Cuestionario disponible | Formulario de primer intento del módulo esperado, habilitado, sin señales contradictorias | No iniciado y disponible. La suite de cuestionarios cubre inicio tradicional y localizado, control deshabilitado, inicio sin identidad de módulo y regresión de tarjetas Moove. |
| F. Encuesta cerrada con historial desconocido | Aviso de indisponibilidad y ventana de cierre verificada | Se muestra cerrada y la participación queda en Sin verificar. Una finalización histórica verificada se conserva. |

Las fechas tienen significado por módulo. Los cuestionarios interpretan la apertura con etiquetas span o strong en bloques académicos reconocidos y contrastan el cierre con el calendario. En tareas se usa el estado de envío y el control habilitado para evaluar disponibilidad, aunque haya vencido el plazo nominal. En foros el vencimiento ordena la fila y no confirma permisos. En encuestas el cierre no acredita participación. La cobertura de encabezados con span, strong, contenedores vacíos y fechas contradictorias corresponde a la suite de cuestionarios.

La corrección de tareas conserva el estado de envío y guarda solamente un indicador enumerado de disponibilidad en el registro existente, con cuenta y módulo verificados. Se basa en el [renderer de tareas](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/assign/classes/output/renderer.php#L591) y el [menú de entrega](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/assign/classes/output/user_submission_actionmenu.php#L99). El caso de evaluación sin envío y su nota mantienen su precedencia.

La revisión de privacidad se limitó al material de prueba y al paquete de distribución. Los fixtures nuevos son sintéticos. El ZIP tiene ocho entradas públicas y no contiene fixtures, documentos adjuntos, caché ni el JPG privado. La detección reutiliza el GET de la actividad. La política manual de foros se mantiene.

El fixture inicial de Presentación suponía que ninguna actividad próxima podía vencer en el día actual. Se fijó el reloj del escenario y se situaron sus vencimientos futuros desde el día siguiente. «Hace 1 semana» empieza a las 00:00 locales de hace siete días, inclusive, y termina a las 00:00 del día siguiente al actual, exclusive. Incluye todo el día actual. El filtro y sus límites se conservan.

### Batería final conjunta

| Entorno | Resultado |
| --- | --- |
| Node | 41 pruebas en 7 archivos, sin fallos, omisiones ni cancelaciones. |
| Chrome con Moodle simulado | 769 comprobaciones en las 24 suites, incluida la referencia de recuperación. Cero fallos y cero suites omitidas. Presentación pasó 120, Cuestionarios 90 y Evidencias 51. |
| Comprobaciones complementarias en Chrome | 2 aprobadas. Con aviso de grupo y control contradictorio en la misma tarea, una entrega confirmada mantiene prioridad y una evaluación sin envío conserva su estado y nota. |

La batería incluyó los seis escenarios de la auditoría, la revisión `quiz-opening-ug-header-3`, filtros, categorías, límites de fechas y preservación de estados. Los fixtures confirman que ambos estados de disponibilidad conservan `done=false`. Una tarea sin control mantiene su estado de envío sin inferir bloqueo. Las regresiones de persistencia confirmaron que las marcas manuales conservan prioridad y que los estados históricos se pueden seguir leyendo. Las pruebas de verificación individual observaron una sola lectura de la actividad. Las pruebas de filtros observaron cero solicitudes adicionales.

### Integridad y distribución

La extensión personal configurada en Chrome apunta a `campus-ug-revamp` con su ID existente. Comparte los archivos funcionales de 2.4.0 con el borrador público `output/preparacion-github-2.0.9.1/campus-ug-revamp`, con la variante privada de la imagen y su referencia en la copia personal. La validación dejó intacto el perfil y el almacenamiento de Chrome.

Las ocho entradas del ZIP coinciden byte a byte con los archivos públicos del borrador. El manifiesto declara 2.4.0 y todos sus recursos existen. Se incluyen el PNG público y su licencia, el README y la licencia MIT con el aviso original. El ZIP excluye el JPG privado, HTML autenticado, fixtures, caché y credenciales. Chrome 157 ya cargó este mismo paquete extraído en un perfil aislado.

`campus-ug-revamp-2.4.0.zip` pesa **72.253 bytes**. SHA-256 `5BE2ED449F597A1AE5CA00FED8C779948F85D14146C2257A196FE8F7DF7F0B53`. Solo se actualizó este registro de auditoría, que queda fuera del paquete.

La Release pública 2.3.0 conserva su archivo de 64.592 bytes con SHA-256 `5CFF961B98D77455ABBB71A68C96B4BD20FF59849ED49512B0D39BE0BAFDA3D3`, comprobado mediante una consulta de solo lectura. [Release 2.3.0](https://github.com/RealMarshy/campus-ug-revamp/releases/tag/v2.3.0)

### Comprobación pendiente en Moodle UG

1. En `chrome://extensions`, pulsa **Recargar** en la tarjeta de Campus UG Revamp 2.4.0 y vuelve a cargar la página de Moodle donde aparece el panel.
2. Selecciona el curso y el tipo **Tarea**. Si la actividad queda fuera de la vista, limpia el filtro de fecha y busca en **Pendientes**, **Próximas** o **Atrasadas**, según el vencimiento.
3. Abre el enlace de la fila y revisa **Estado de la entrega** en Moodle. En el caso A debe aparecer un aviso explícito de que no perteneces a un grupo. En el caso B debe verse el control **Agregar entrega** habilitado en esa tarea. Basta con observarlo.
4. Vuelve a Revamp y pulsa **Reverificar esta actividad** (⟳) en esa misma fila. El caso A debe mostrar «Sin entrega · Bloqueada por grupo» y el B «Sin entrega · Disponible para agregar entrega». La etiqueta puede ir seguida de la hora de la comprobación. Una entrega confirmada, una evaluación sin envío o una marca manual conservan su tratamiento.
5. Si la etiqueta difiere, abre **Diagnóstico de verificaciones** inmediatamente después. Si el resumen está oculto, muéstralo desde **Personalizar**. Comprueba `version`, `detectorRevision`, `lastRun.mode` (`one`), `checked` (1) y `activityErrors` (0). Si aparece `shared: true`, pudo reutilizarse una comprobación simultánea y `checked` puede ser 0. Si aparece un fallo activo, comparte únicamente `stage`, `module`, `code` y `details` de la entrada relevante.

Diagnóstico registra errores de verificación y carece de un campo específico para la disponibilidad de tareas. Si la lectura termina sin errores y la etiqueta sigue siendo genérica, basta con compartir el texto del aviso o del control, si este aparece habilitado y si apunta a la misma tarea (sí, no o desconocido). Omite HTML, URL completas, identificadores y datos de sesión.

## Fechas de cuestionarios en el encabezado de Moodle UG

La revisión quiz-opening-schedule-2 recibió el documento completo, pero buscó el bloque de fechas bajo los contenedores del encabezado de actividad. En los fragmentos de Moodle UG, esos contenedores están vacíos y las fechas se encuentran en header#page-header, debajo de header-extras-container. Antes de modificar el detector, los dos fixtures anonimizados reprodujeron el rechazo. Las etiquetas span.date-item-label también requerían una lectura distinta de las etiquetas strong del formato anterior.

La revisión quiz-opening-ug-header-3 admite la ruta comprobada y comprueba que el nombre del bloque concuerde con el encabezado de la página, además de la identidad de cuenta y el cmid existentes. Lee el texto hermano de cada etiqueta, valida el día de la semana y el calendario en hora de Ecuador, y conserva el cierre original. Los fixtures incluyen diciembre a enero y un intervalo de una hora. Una apertura pasada, un cierre divergente, un bloque duplicado o un encabezado de otra actividad conservan Sin verificar. Se guardaron únicamente fixtures sintéticos con identificadores ficticios.

El resultado quiz_scheduled alimenta Próximas y Pendientes sin afirmar que no hubo intentos. Se mantiene la prioridad de la entrega confirmada y su calificación, así como la marca manual. La reverificación usa el GET existente.

Pasaron 41 pruebas de Node y 762 comprobaciones en las 24 suites conjuntas de Chrome, sin fallos ni omisiones. La suite de cuestionarios pasó sus 90 comprobaciones. Chrome 157 cargó el paquete extraído en un perfil aislado. El ZIP sincronizado pesa 71.658 bytes. SHA-256 `68E08EC7363C231B95B50193CA2A9F905AD4E809B032B32D94F4B9E85495A4CE`.


## Programación futura y evidencia de intentos

La reverificación en Moodle UG confirmó el módulo y el aviso temporal, pero devolvió header=missing y attempts=absence_not_confirmed. La búsqueda anterior ya recorría todo el documento. El fallo confirma que el HTML GET no ofreció un bloque visible que cumpliera la relación exacta de selectores, pero no indica cómo está construido el encabezado en el campus. Se amplió la búsqueda a los contenedores oficiales de [encabezado](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/lib/templates/activity_header.mustache) e [información de actividad](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/course/templates/activity_info.mustache). El diagnóstico añade la ubicación del bloque respecto de region-main.

El estado quiz_scheduled representa una apertura futura verificada sin determinar la existencia de intentos previos. Requiere un único bloque válido, el módulo esperado, un aviso temporal sin restricciones incompatibles, fechas ordenadas y coincidencia del cierre con el calendario. Los intentos reconocidos y las marcas manuales siguen teniendo prioridad. En Pendientes significa que hay una actividad por atender. La fecha de cierre sigue siendo la del calendario.

El diagnóstico de la revisión quiz-opening-schedule-2 usa el mismo GET. Si el encabezado sigue ausente, se requieren las etiquetas y clases del bloque Abre/Cierra y sus ancestros hasta el contenedor de actividad, con los nombres de atributos data-for y data-region y sus valores de plantilla. Conviene indicar si aparece en la pestaña Respuesta de DevTools, en Elementos o en ambas. Se pueden sustituir fechas por ejemplos y omitir IDs de actividad, nombres, enlaces, scripts y datos de sesión.

Pasaron 41 pruebas de Node y 755 comprobaciones en las 24 suites conjuntas de Chrome. La suite de cuestionarios pasó 83 comprobaciones. Chrome 157 cargó el ZIP extraído. El ZIP pesa 71.377 bytes. SHA-256 `C0661083B9840808310F250EA2075A4EEC6902FC3823A0B82E15D936B9F44B0B`.


## Diagnóstico dirigido de apertura

La revisión quiz-opening-diagnostics-1 registra lastRun.quizOpening al reverificar individualmente un cuestionario cuya indisponibilidad reconoce el detector. El resultado contiene valores enumerados y booleanos sobre el módulo, el encabezado, la apertura, el cierre, la concordancia con el calendario, la restricción y la evidencia de intentos. Se omiten fechas, identificadores y HTML. La ruta utiliza el mismo GET y conserva la clasificación.

El caso simulado con fechas válidas y sin confirmación de ausencia de intentos devuelve quiz_unavailable, con opening=future, calendarClose=match y attempts=absence_not_confirmed. El diagnóstico previo de Moodle UG solo contiene el resultado agregado y queda pendiente obtener estos indicadores en la cuenta real.

Pasaron 41 pruebas Node y 744 comprobaciones en 24 suites conjuntas de Chrome, sin fallos ni omisiones. Chrome 157 cargó el ZIP extraído en un perfil aislado. El ZIP pesa 71.297 bytes. SHA-256 `B26239E006648413250F6146B8A5A186D63D5A205D9EEDBC88D2D7453AB7E968`.


## Apertura futura de cuestionarios en 2.4.0

Las dos capturas muestran aperturas futuras y el aviso genérico de indisponibilidad. La versión anterior exigía un aviso explícito de apertura pendiente, de ahí dos quiz_unavailable y cero quiz_not_yet_open tras 27 comprobaciones. Moodle emite el mismo aviso genérico antes de abrir y después de cerrar. [Regla de fechas de Moodle](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/quiz/accessrule/openclosedate/rule.php#L31).

Revamp usa la vista y el cmid comprobados, las fechas del encabezado académico y una señal explícita de ausencia de intentos. El cierre visible en español debe coincidir al minuto con el cierre del calendario, usando la hora de Ecuador. Se rechazan fechas ocultas, duplicadas, invertidas o fuera del encabezado y avisos contradictorios. La fecha de apertura confirmada se guarda en el estado automático existente. Al alcanzarla, la actividad se revalida en el siguiente ciclo elegible sin temporizador propio y respetando backoff y marcas manuales. Una restricción posterior conserva la finalización previa confirmada por Moodle.

Las capturas no acreditan la señal de ausencia de intentos ni la estructura del HTML de la respuesta GET. Para confirmar el comportamiento real, se necesita un fragmento sanitizado del encabezado con las dos filas de fechas, el aviso dentro de quizattempt y los indicadores de intentos, si los hay. La coincidencia del id de la fila y del cmid de la página puede reportarse como sí o no.


Pasaron 41 pruebas Node y 743 comprobaciones en las 24 suites conjuntas de Chrome, sin fallos ni omisiones. La primera ejecución mostró que el fixture de recuperación variaba el vencimiento entre consultas: la invalidación de caché consiguiente contradecía la premisa de la prueba. Se mantuvo un vencimiento fijo en ese fixture y se repitió toda la batería sin ampliar plazos. La suite de cuestionarios pasó 71 comprobaciones en la batería conjunta.

Chrome 157 cargó el ZIP extraído. El paquete sincronizado pesa 70.781 bytes. SHA-256 `54CDEF8594F583B7261F30F86C7C7EFC9D02865D7BA3851A42361ACA8D49F2D1`.


## Auditoría de sincronización y notas en 2.4.0

El diagnóstico real muestra un ciclo normal con seis meses reutilizados, 26 aciertos de caché y cero verificaciones. La captura confirma que la reverificación individual reconoció el intento. El diagnóstico posterior carece de fallos activos y no permite reconstruir la política exacta aplicada al cuestionario antes de esa acción. Un SELECTOR_MISSING antiguo podía conservar hasta seis horas de espera. El TIMEOUT histórico de cabeceras corresponde a una tarea y no explica el caso del cuestionario.

| Modo | Calendario y actividades |
| --- | --- |
| Inicio o regreso visible antes del próximo ciclo periódico | Comprueba sesión y reutiliza calendario vigente. Solo revisa actividades elegibles. |
| Actualizar | Actualiza el mes actual y los dos siguientes, con reutilización de lecturas compartidas recientes. Aplica la política de actividades. |
| Reverificar todo | Consulta el calendario completo y comprueba actividades compatibles, con cancelación. |
| Reverificar actividad | Comprueba la actividad elegida, incluso durante la espera de reintento. Puede compartir una comprobación concurrente. |
| Periódico | Funciona con la pestaña visible. En un ciclo por temporizador consulta el mes actual y los dos siguientes. Al volver visible con el ciclo vencido puede incluir históricos según su TTL. |

El TTL normal es de 10 minutos para estados pendientes y 24 horas para entregados. El calendario conserva los meses recientes 15 minutos y los históricos 24 horas. Las marcas manuales, el backoff, el archivo, los estados vigentes y la coordinación entre pestañas pueden dejar cero actividades elegibles. El cambio de metadatos y el vencimiento de la evidencia también influyen. Un incidente histórico no equivale a un fallo activo.

Se permiten hasta dos comprobaciones selectivas por ciclo automático para fallos de selector con la huella anterior al detector Moove. La revisión se guarda en el registro existente por actividad y se comparte bajo Web Locks. Se conserva la concurrencia de tres y las esperas de errores HTTP, red y sesión. La prueba del sandbox verificó una sola recuperación tras actualizar y ninguna repetición al recargar.

Un cuestionario con apertura pendiente solo entra en Próximas y Pendientes cuando la vista confirma que aún no abre, no registra intentos y tiene un vencimiento futuro. Una restricción genérica conserva Sin verificar. La captura real solo muestra la etiqueta genérica de Revamp.

En un cuestionario finalizado, la nota oficial se toma del encabezado visible del resumen general de Moodle con cuenta y cmid verificados. Se excluyen los puntos, porcentajes y notas por intento. La nota se guarda en los metadatos de verificación existentes. Las tareas conservan la evaluación sin envío en el historial. La última nota confirmada sigue visible con fecha tras el TTL o un fallo. Una respuesta válida puede sustituirla o retirarla. Foros y encuestas siguen sin nota automática. [Renderer de cuestionarios de Moodle](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/quiz/classes/output/renderer.php#L1193).

| Actividades simuladas | Solicitudes anterior y actual | Comprobaciones anterior y actual | Sincronización anterior y actual |
| ---: | --- | --- | --- |
| 50 | 26 y 26 | 25 y 25 | 155,8 y 153,8 ms |
| 200 | 101 y 101 | 100 y 100 | 527,4 y 525,8 ms |
| 1.000 | 501 y 501 | 500 y 500 | 2.570,4 y 2.578,6 ms |

El benchmark local mantuvo el calendario vigente. No incluyó fallos con la huella de migración ni midió pintura o filtrado a esas escalas. Presentación pasó 120 comprobaciones en Chrome. La suite de evidencias pasó 44 y mantuvo una única lectura por verificación.

Pasaron 40 pruebas de Node. En la ejecución conjunta de Chrome pasaron 672 comprobaciones de 23 suites. Cuestionarios agotó su espera porque el reloj simulado activó una actualización periódica y la prueba aceptaba únicamente el mensaje de finalización normal. Se corrigió el fixture con una preferencia válida de actualización desactivada y se evitó guardar marcas de verificación con el reloj adelantado. La suite corregida pasó sus 70 comprobaciones al ejecutarse individualmente, sin ampliar los tiempos de espera.

Chrome 157 cargó el ZIP extraído en un perfil temporal. El ZIP pesa 69.811 bytes y su SHA-256 es `9CC6972BCC595272176927CB822B48A61E16B6FFFB931A16629F5F1CF2C67064`.


## Tareas calificadas sin envío en 2.4.0

Una tarea sin envío registrado puede aparecer en Entregadas como «Calificada sin envío en Moodle». El detector exige la vista e identidad de la actividad, el cmid y la nota junto a su fecha en la tabla de evaluación. La estructura se contrastó con [el renderer de asignaciones de Moodle](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/assign/classes/output/renderer.php#L373). La captura de Moodle UG acredita la nota visible. Queda pendiente una reverificación en el campus con el paquete actualizado.

El historial guarda la nota como evaluationGrade en el estado automático de la tarea, con done=false y source=moodle. El TTL sigue programando revisiones sin borrar la nota y un error de red conserva la evidencia anterior. Una comprobación válida puede actualizar o retirar la evaluación. Las marcas manuales siguen determinando la clasificación mientras estén activas.

Pasaron 39 pruebas de Node. En la batería de Chrome, 23 suites pasaron 672 comprobaciones, incluidas 44 de evidencias. La suite de cuestionarios agotó el tiempo en esa ejecución y pasó sus 66 comprobaciones al repetirla por separado. El caso confirmado requiere una sola lectura GET de la tarea y no añade solicitudes a Moodle.

Chrome 157 cargó el ZIP extraído en un perfil temporal. El paquete sincronizado pesa 69.156 bytes. SHA-256 `03E4FCE55BAAC3798488ED40EAFFE40449120C112B6DF2B793B1E9A63BBCA1A1`.


## Cuestionarios con tarjetas de intentos en 2.4.0

La captura muestra un intento finalizado. El diagnóstico 2.3.0 registró cero tablas de intentos y cero tablas de resumen. La última sincronización general reutilizó la caché y no verificó actividades. La captura no muestra la ruta completa ni permite corroborar que el cuestionario de la tarjeta sea el mismo que el de la fila de Revamp.

Las plantillas públicas de Moove explican la discrepancia reproducida en el sandbox. Su lista de intentos usa .moove-attempts-list y la clase .quizreviewsummary aparece en un div. La comprobación nueva lee únicamente el campo Estado de cada tarjeta dentro de esa lista. Exige la vista principal del cuestionario, la identidad esperada y la clase de módulo con el mismo cmid. Un resultado finalizado válido prevalece sobre un intento posterior en curso. Las calificaciones se descartan como evidencia de finalización.

Referencias técnicas · [Lista de intentos de Moove](https://github.com/willianmano/moodle-theme_moove/blob/main/templates/mod_quiz/list_of_attempts.mustache) · [Resumen de intento de Moove](https://github.com/willianmano/moodle-theme_moove/blob/main/templates/mod_quiz/attempt_summary_information.mustache) · [Generación del cmid en Moodle](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/lib/pagelib.php#L1921).

La verificación individual usa la misma lectura GET que antes. Tras confirmar una entrega, el flujo existente retira el fallo activo y conserva las decisiones manuales. Para validar el caso original, abrir la actividad desde la fila de Revamp y corroborar localmente que la ruta sea mod/quiz/view.php con el mismo id que la página de la captura. Si la versión 2.4.0 sigue mostrando Sin verificar al reverificar solo esa actividad, compartir únicamente el resultado de esa comparación y la estructura sanitizada del bloque Sus intentos.

Pasaron las 39 pruebas de Node y 653 comprobaciones de las otras 23 suites de Chrome con Moodle simulado. La primera ejecución de la suite de cuestionarios agotó el tiempo al buscar el estado en la caché base del fixture. La prueba se ajustó para leer el estado efectivo con el historial aplicado y pasó sus 58 comprobaciones al repetirla. Incluye reverificación tras un SELECTOR_MISSING con una sola lectura GET, persistencia al recargar y conservación de una marca manual.

Chrome 157 cargó el ZIP extraído en un perfil temporal. ZIP de 68.388 bytes con SHA-256 `1ECB9D79B5B67B6D08F73A21E9CC8E71026675BCE9A4361689E547996568F473`.


## Desactivación de rangos rápidos en 2.4.0

Pulsar el rango activo usa el mismo tratamiento que Limpiar filtro. Los cuatro presets conservan el foco y actualizan aria-pressed, resultados y contadores. Aplicar fechas guarda un rango manual y quita el resaltado del preset anterior.

Pasaron 39 pruebas Node. En la primera ejecución de las 24 suites de Chrome con Moodle simulado pasaron 666 comprobaciones y falló la suite Universal en la recuperación de un timeout. Universal pasó sus 23 comprobaciones al repetirla por separado. Presentación pasó 120 comprobaciones, incluidos los cuatro ciclos de activación, desactivación y reactivación, persistencia tras recargar y cero solicitudes adicionales por filtrar.

Chrome 157 cargó el ZIP extraído en un perfil temporal. El ZIP pesa 67.777 bytes. SHA-256 `64F5DD4881DFEC6E8F5BE5AED36EAA9C2E13785AE881993BC8EC39BDC3C75B17`.

## Personalizar sin filtros duplicados en 2.4.0

Los controles de Fecha, Categorías y Tipos de actividad se administran desde los accesos rápidos. Personalizar conserva Vista de categorías y Restaurar configuración predeterminada, que también restablece los filtros. Se conserva el esquema de preferencias por cuenta.

Pasaron 39 pruebas Node y 673 comprobaciones en 24 suites de Chrome con Moodle simulado, sin fallos ni omisiones. Presentación pasó 104 comprobaciones, con persistencia, restauración, teclado, ausencia de solicitudes HTTP adicionales y pruebas a 320, 360 y 960 px y con zoom CSS al 200 %. Chrome 157 cargó el ZIP extraído en un perfil temporal.

El ZIP pesa 67.710 bytes. SHA-256 `E23CE25395B71DBCF75281C7931037937E99F46119EF8FF5A7F0F8C903851ABE`.

## Distribución final de los filtros en 2.4.0

En escritorio, Aplicar fechas se alinea con el calendario Hasta y Limpiar filtro queda junto a Dentro de 1 mes. En espacios estrechos, la cuadrícula reduce sus columnas. Categorías y Tipos de actividad permiten seleccionar o deseleccionar todo. Las dos vistas mantienen sus categorías por separado y la selección de tipos se comparte con Personalizar.

Pasaron 39 pruebas Node y 672 comprobaciones en 24 suites de Chrome, sin fallos ni omisiones. Presentación pasó 103 comprobaciones, entre ellas alineación, responsive, selección vacía, restauración, teclado y ausencia de solicitudes adicionales al filtrar. Chrome aislado cargó el ZIP extraído con Moodle simulado y confirmó la persistencia de una selección vacía al recargar.

El ZIP actualizado pesa 67.794 bytes. SHA-256 `2D1D46FBDEC5D7E419FB294B5381641C38B5948604E3ECBCCD88D19FC50364FA`. Las ocho entradas coinciden con sus archivos públicos. La instalación personal conserva su JPG y el paquete usa el PNG público.

## Filtro Fecha en 2.4.0

Fecha aparece a la izquierda de Categorías. Usa dos calendarios nativos y cuatro presets relativos. Los rangos manuales admiten un extremo vacío, mantienen las fechas por cuenta y rechazan rangos invertidos. Los límites se calculan una vez por render en hora local y el límite superior es la medianoche posterior al último día. Solo se comparan vencimientos existentes. Los presets se recalculan en el render ya programado por la extensión, sin otro temporizador ni peticiones de red.

Pasaron 39 pruebas Node y 758 comprobaciones en 25 ejecuciones de Chrome, correspondientes a 24 suites distintas y una repetición de Presentación. Cero fallos y cero omisiones. Presentación terminó con 96 comprobaciones, incluidas combinaciones de curso, tipo y categoría, teclado, 320, 360 y 960 px y zoom CSS al 200 %. El ZIP extraído persistió un rango manual tras recargar en Chrome aislado, sin solicitudes al aplicar el rango.

Mediana de cinco muestras de 10.000 iteraciones en Node. Microsegundos por aplicación del filtro, incluido el cálculo del preset activo. Se excluyen renderizado y red.

| Actividades | Sin Fecha | Con Fecha |
| ---: | ---: | ---: |
| 50 | 0,50 | 1,49 |
| 200 | 1,81 | 2,72 |
| 500 | 4,52 | 5,98 |
| 1.000 | 8,38 | 10,92 |

El ZIP sincronizado pesa 67.664 bytes. SHA-256 `675FE4A374BBD23846625D9FD95DFE9B1A19E8C8EC6D17C808F8F353E086C0B9`.

## Accesos rápidos en 2.4.0

Categorías y Tipos de actividad aparecen debajo de la barra superior. Solo se abre un recuadro a la vez. Sus casillas y las de Personalizar usan las mismas preferencias por cuenta. Cerrar o pulsar Escape devuelve el foco al botón. Los accesos rápidos se ocultan si la sesión se detiene.

Pasaron 37 pruebas Node y 652 comprobaciones en 24 suites de Chrome, con cero fallos y cero omisiones. Presentación verificó sincronización en ambos sentidos, ambas vistas, ancho de 320 y 360 px, zoom CSS al 200 %, teclado y cero consultas académicas al filtrar. Los temas y Dark Reader se comprobaron en el sandbox. En Chrome aislado se verificó que el ZIP conserve la selección después de recargar.

Las tres copias conservan la versión 2.4.0. El ZIP contiene ocho archivos públicos, pesa 66.014 bytes y su SHA-256 es `4ECA8C6261533372E35F3414E57A8525637882B576FF24D4A39679B9AE807D03`. La copia personal conserva el JPG y la pública usa el PNG bajo CC0.

## Organización visual en 2.4.0

La base es el commit público `83e99f57b486fd766cda9ff84598bb0554bc74fe` de 2.3.0. La revisión de diferencias limitó el código a preferencias y renderizado, con la versión correspondiente en el manifiesto. Se conserva el esquema de presentación 1. Las cuentas anteriores reciben todas las pestañas y todos los tipos al faltar los nuevos campos. La selección de Lista simple se mantiene en `categories`.

Pasaron 37 pruebas Node y 638 comprobaciones en 24 suites Chrome, incluida la comparación histórica de recuperación. La repetición focalizada de Presentación pasó 70 comprobaciones e incluyó 320 y 360 px y zoom CSS al 200 %. Las pruebas verificaron categorías independientes, deduplicación, selección por curso y tipo, contadores, recuperación del estado vacío, aislamiento por cuenta, teclado y cero solicitudes por cambiar filtros. Los temas y Dark Reader se probaron con los fixtures existentes.

El ZIP 2.4.0 pesa 65.394 bytes. SHA-256 `1160CB4E63E7970F8B168B41AD7BB5085C3A015574595DB925E1B87609060588`. Chrome aislado cargó el paquete extraído, mostró el PNG público y conservó los tipos y pestañas después de reiniciar el navegador. Se usó Moodle simulado. La validación visual en el campus queda pendiente después de recargar la instalación personal.

## Auditoría final de la candidata 2.3.0

El paquete de publicación pesa 64.592 bytes. SHA-256 `5CFF961B98D77455ABBB71A68C96B4BD20FF59849ED49512B0D39BE0BAFDA3D3`. La única entrada actualizada respecto del ZIP de la auditoría fue el README con el enlace de descarga oficial. Los scripts, el manifiesto, los estilos, la ilustración y las licencias conservaron sus bytes.

El usuario comprobó en Moodle UG la disponibilidad de una encuesta en Próximas y Pendientes con el selector oculto, la clasificación manual de encuestas cerradas, dos entregas confirmadas por Moodle, los vencimientos, los contadores y el comportamiento de los foros. La última sincronización observada por el usuario terminó sin fallos de calendario ni de actividad. Después de responder, la reverificación individual detectó la entrega. No se realizaron interacciones académicas durante la auditoría.

### Cómo se actualiza el estado tras una entrega

| Acción | Calendario | Estado de la encuesta |
| --- | --- | --- |
| Actualizar | Vuelve a consultar el mes actual y los dos siguientes cuando el backoff y la coordinación entre pestañas lo permiten. Reutiliza los meses anteriores vigentes. | Respeta el TTL, las decisiones manuales y la espera por fallos. Un resultado vigente puede conservar el estado anterior tras un envío reciente. |
| Reverificar todo | Revisa los seis meses, salvo si puede compartir una revisión equivalente de otra pestaña. | Fuerza la comprobación de las actividades elegibles, incluidas las encuestas conocidas en ese alcance. Conserva la precedencia manual. Los foros siguen siendo manuales. |
| Reverificar esta actividad | No consulta el calendario. | Comprueba la actividad seleccionada en `view.php`. Si otra pestaña ya efectuó una lectura válida para la misma solicitud, puede reutilizarla. No añade una segunda ronda automática. |
| Sincronización periódica | Refresca los meses recientes. Al recuperar visibilidad puede incorporar actividad histórica conforme a la política existente. | Reutiliza la política ordinaria. Solo se ejecuta con la pestaña visible y según el intervalo elegido. |
| Recarga con caché vigente | Reutiliza los meses vigentes. | La vigencia habitual es de 10 minutos para pendientes y 24 horas para confirmadas. Las actividades con cierre comprobado pueden aplazarse hasta la sonda de archivo de siete días. Un cambio de metadatos, una espera vencida o una lectura forzada pueden adelantar la comprobación. |

El intervalo periódico es de 10 minutos por defecto y se puede cambiar a 15, 30 o desactivar. El envío de una encuesta en Moodle no dispara una lectura en Revamp. En el ZIP extraído se reprodujo el flujo con dos encuestas ficticias. La carga inicial hizo seis consultas de calendario y dos GET de actividad. Actualizar añadió tres consultas de calendario y reutilizó ambos estados. Reverificar la encuesta recién respondida añadió un solo GET y la movió a Entregadas. La recarga preservó la declaración manual y no añadió lecturas de encuesta.

### Integridad y alcance

Se verificó el manifiesto 2.3.0, la carpeta y el ID registrados en Chrome, y la equivalencia funcional entre la instalación personal, el borrador y los archivos extraídos. La copia personal conserva su JPG y el borrador y el ZIP usan el PNG público bajo CC0. La licencia MIT coincide en las tres copias. El ZIP contiene ocho archivos públicos y pesa 64.609 bytes. SHA-256 `BEE376CA1244818A1B8C8F7E44440B402F51181D6CA1DB15A441185F034B3523`.

Chrome aislado cargó el ZIP, mostró el estado de las encuestas y la ilustración pública y conservó la declaración manual después de recargar. La prueba solo permitió el GET de la vista principal, la comprobación del área personal y el método existente de lectura de calendario. El acceso a `complete.php` y los envíos académicos quedaron fuera del flujo. No se abrió el almacenamiento académico personal. GitHub seguía en 2.2.0 y el ZIP histórico conservaba su huella.

### Resultados y veredicto

- Node aprobó 36 pruebas. Chrome aprobó 623 comprobaciones en las 23 suites predeterminadas más `recovery-baseline`, 24 en total, con cero fallos y cero omisiones en la ejecución. En la suite de recuperación, el fixture con timeouts concluyó en aproximadamente 31 segundos por los retardos programados.
- Se añadió una comprobación focalizada de entrega detectada por el ciclo periódico tras vencer el TTL. El primer intento instaló el reloj después de arrancar los temporizadores y agotó la espera. Con el reloj instalado antes de navegar, Feedback aprobó sus 70 comprobaciones. Las demás suites de la batería completa conservaron el mismo código funcional.
- La muestra de rendimiento de evidencia hizo 24 solicitudes y 17 comprobaciones en frío. Con caché vigente hizo una consulta de sesión y cero comprobaciones de actividad. La sincronización en frío tardó 65 ms en esa muestra local. No se extrapola a Moodle UG.
- Quedan sin validar en el campus las variantes de múltiples envíos, el anonimato y los cambios de permisos. Las confirmaciones observadas únicamente en `complete.php` siguen fuera del detector automático.

**APTO PARA PUBLICACIÓN.** La auditoría no identificó defectos bloqueantes. Se modificaron únicamente la prueba focalizada y este registro. La versión y el ZIP permanecen intactos.

## Visibilidad de Participación en 2.3.0

El selector se muestra cuando el cierre coincide con una verificación de indisponibilidad y la participación sigue sin confirmarse, o si existe una declaración manual que editar en esa encuesta cerrada. El vencimiento por sí solo no habilita el selector. Un control de respuesta válido después del vencimiento mantiene la disponibilidad y la actividad figura en Atrasadas y Pendientes. Ocultar el selector no altera decisiones guardadas ni realiza consultas.

## Corrección de Feedback en 2.3.0

La clasificación ya incluía en Próximas y Pendientes una encuesta reconocida como disponible. El detector descartaba controles fuera de una jerarquía CSS específica o sin `courseid`. El sandbox reproduce ese rechazo y valida un enlace localizado sin ese parámetro y un formulario con ID oculto. La corrección exige un destino de la misma instancia Moodle, la ruta esperada y el ID inequívoco de la actividad. También exige que el control esté habilitado. Solo se lee el destino declarado. El DOM real de la encuesta y el resultado final de la consulta anterior siguen pendientes.

El selector Participación guarda una decisión explícita en el historial existente de la cuenta. Las marcas positivas de la versión anterior se conservan. Las marcas negativas antiguas sin declaración explícita se interpretan como desconocidas y se conservan en disco. Una decisión explícita prevalece sobre el estado automático. Retirarla recupera la evidencia ya almacenada sin iniciar una consulta. Se usa el archivado existente cuando Moodle confirma que la encuesta cerró y el cierre coincide con el calendario.

El ZIP extraído cargó en un perfil aislado de Chrome. Se comprobó el reconocimiento de un enlace localizado, la persistencia de una declaración negativa tras recargar, dos GET de actividad para dos encuestas y el PNG público. La observación de `complete.php` sigue siendo documental.

Pasaron 36 pruebas Node y 621 comprobaciones en 23 suites de Chrome, sin fallos ni omisiones. Después de sincronizar las tres copias se repitió Feedback con 67 comprobaciones. Cuatro encuestas requirieron cuatro GET iniciales, un reintento HTTP 503 y una reverificación individual iniciada por la prueba. Cambiar o retirar declaraciones no añadió consultas de actividad. El ZIP corregido pesa 64.532 bytes y su SHA-256 es `403ED8FBB4D0D097CBB29CD6AE22F468A9AE46062E66C25A5F5BBD32F01D887A`.

## Integración local 2.3.0

Las capturas reales confirman el control «Responda a las preguntas», el aviso de indisponibilidad, dos aperturas en la vista diaria y los avisos de envío en `complete.php`. El registro distingue esos hechos de las estructuras que aún requieren inspección del campus. [Observaciones de Moodle UG](docs/feedback/OBSERVACIONES-MOODLE-UG.md).

La implementación valida los eventos de Feedback, agrupa por ID de módulo y conserva apertura y cierre por separado. Las fechas contradictorias producen Sin verificar. La apertura nunca se muestra como vencimiento. La verificación usa la vista principal con cuenta y módulo confirmados, mediante la política existente de caché, bloqueo, cancelación y recuperación. Un aviso de disponibilidad o un cierre no confirman una entrega. Las confirmaciones válidas se conservan ante observaciones posteriores ambiguas y las decisiones manuales prevalecen.

No se añadió un script pasivo a `complete.php`. La captura confirma mensajes en esa ruta, pero no aporta un vínculo DOM verificado entre aviso, cuenta y módulo. La extensión comprueba la señal equivalente en `view.php` si el servidor la ofrece. Las variantes que solo muestran confirmación en `complete.php` se pueden marcar manualmente. Las consultas a la vista principal pueden generar el registro normal de visita de Moodle. [Vista principal de Moodle](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/feedback/view.php#L56).

El ZIP cargó en un perfil temporal de Chrome con Manifest V3. Un calendario simulado con apertura y cierre para una encuesta generó una fila y un GET de actividad. También se verificó que cargara la ilustración pública.

Pasaron 35 pruebas Node y 609 comprobaciones en las 23 suites de Chrome, sin fallos ni omisiones. Después de sincronizar la instalación personal se repitió Feedback con 56 comprobaciones, incluida la prueba añadida de los instantes de apertura y cierre. El fixture integrado descubrió tres encuestas con seis eventos y realizó tres GET iniciales, un reintento por HTTP 503 y una reverificación individual solicitada por la prueba. La recarga con caché no repitió las lecturas de encuesta. El escenario de referencia sin encuestas en la sincronización hizo siete consultas. Mil clasificaciones sobre DOM ya analizado tardaron 18 ms en la muestra final. Son tiempos locales y excluyen descarga y análisis inicial del HTML.

La instalación registrada y el borrador contienen la misma lógica 2.3.0. La copia personal conserva su JPG y el paquete usa el PNG público. El ZIP pesa 63.603 bytes. SHA-256 `07F5D1EE86734A21AE93127CD6B675DA04F23659FA78446D27F3839012939AEC`. La validación usó Moodle simulado y no accedió a la cuenta académica. Queda por confirmar el DOM y el calendario mensual de UG al recargar la instalación habitual.

## Corrección de foros preparada para 2.3.0

Los foros por confirmar aparecen en Pendientes y, según la fecha guardada, en Próximas o Atrasadas. Las filas reutilizan el aviso ámbar de menos de 24 horas y el aviso rojo después del vencimiento. Las marcas manuales y las entregas históricas conservan su precedencia. Desmarcar devuelve el foro a su categoría por fecha y al contador de foros por confirmar. La combinación de filtros sigue mostrando una fila por módulo e identificador. El cambio usa la fecha ya almacenada y no consulta la participación.

Pasaron 34 pruebas Node y 260 comprobaciones en siete suites de Chrome con Moodle simulado. Se repitieron Migración, Navegador y Diagnóstico tras ajustar los selectores de prueba y la expectativa del texto de un foro desmarcado. Migración confirmó cero consultas a foros, preservación de los estados históricos y persistencia de las marcas.

## Investigación experimental de Moodle Feedback

El prototipo está en `tests/feedback-prototype.cjs`. Se carga únicamente en la suite `feedback` del sandbox. La instalación personal y el ZIP de distribución siguen en 2.2.0. La decisión de posponer la integración se basa en dos límites de Moodle. Una encuesta sin eventos de apertura o cierre puede ser invisible para el descubrimiento por calendario. Además, `view.php` no siempre expone si la cuenta respondió, en particular si se permiten varios envíos o si se trata de una respuesta anónima sin confirmación individual.

### Evidencia de Moodle

- En Moodle 4.5, la vista principal requiere acceso al curso. Muestra el enlace de respuesta cuando la encuesta está abierta y la cuenta puede responder. La barra de acciones usa `complete.php` y añade `gopage` al reanudar desde una página posterior. El sandbox inspecciona ese destino como texto. Moodle puede registrar un evento de visualización en `view.php`. La ruta `complete.php` puede marcar la actividad como vista e iniciar el procesamiento del formulario. [Vista principal](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/feedback/view.php), [barra de acciones](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/feedback/classes/output/standard_action_bar.php), [formulario](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/feedback/complete.php).
- Moodle usa el mismo aviso para «aún no abre» y «ya cerró». El prototipo solo los distingue cuando ese aviso coincide con una fecha válida del calendario. Un cierre por sí solo no confirma participación. Para confirmar un envío, la prueba exige el aviso específico en el contenedor de estado, con la cuenta y el módulo verificados. Los informes agregados y los mensajes personalizados de la actividad no constituyen confirmación. [Vista principal](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/feedback/view.php), [plantilla de notificaciones](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/lib/templates/notification_base.mustache).
- Moodle crea eventos `open` y `close` por separado cuando se configuran sus fechas. El prototipo lee la respuesta mensual existente y comprueba módulo, origen, ruta, identificador y fechas. Trata la apertura como contexto y usa el cierre explícito como vencimiento. Ignora fechas contradictorias. La visibilidad de los eventos y la aparición de una acción en la línea de tiempo dependen de condiciones distintas. Hay que comprobar qué campos y eventos llegan al calendario mensual del campus. [Generación de eventos y acción de calendario](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/feedback/lib.php#L719).
- Cuando se permiten varios envíos, el control para responder indica disponibilidad y deja la participación previa indeterminada. La opción de anonimato y los enlaces a estadísticas tampoco prueban un envío individual. Una marca manual tiene precedencia en la clasificación simulada y no cambia la evidencia automática. [Reglas de envío](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/feedback/classes/completion.php#L602), [consulta de participación](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/feedback/classes/structure.php#L226).

### Reproducción y límites

Ejecuta `npm test` y, con `UG_PLAYWRIGHT_CLI` configurado, `node tests/run-browser.cjs feedback`. El sandbox usa cuentas ficticias y analiza el HTML una vez por inspección. Reutiliza la comprobación de identidad de Revamp, rechaza redirecciones y solo permite consultar la vista principal. Los POST observados corresponden al método de lectura mensual del calendario que ya usa 2.2.0. Las marcas manuales se prueban como entrada de clasificación. El prototipo no tiene persistencia ni acceso a datos académicos.

Las señales del HTML en inglés se basan en Moodle 4.5. Falta confirmar el HTML renderizado por el tema de Moodle UG, los avisos localizados y la presencia de los eventos. Para validar, basta una muestra sanitizada con el identificador de módulo reemplazado consistentemente, las clases del contenedor y del aviso, el texto genérico del aviso, la ruta y los nombres de parámetros del enlace, y el tipo de evento con fechas ficticias consistentes. Excluye preguntas, respuestas, nombres, HTML completo, sesiones y tokens. La encuesta sin fechas del sandbox se inspecciona usando un ID ya conocido. No representa descubrimiento automático.

En el exportador oficial, `viewurl` lleva al día del calendario, `action.url` es opcional y `instance` representa el ID del módulo cuando hay un módulo asociado al evento. El prototipo comprueba estas variantes y nunca toma un ID de `viewurl`. La confirmación en el campus debe incluir qué campos vienen efectivamente en la respuesta mensual. [Exportador de eventos](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/calendar/classes/external/event_exporter_base.php).

### Resultados del sandbox

| Caso | Resultado |
| --- | --- |
| Abierta y con control habilitado | Disponible. Próximas con un cierre futuro confirmado. |
| Aún no abierta, acceso restringido o cerrada | Sin verificar con una explicación acorde a la evidencia. |
| Confirmación explícita de envío | Entregadas. |
| Admite varios envíos | Disponible si aparece el control. La participación anterior queda sin confirmar. |
| Anónima sin confirmación individual | Sin verificar. Una marca manual puede clasificarla como Entregada. |
| Respuesta en curso | Disponible para continuar. La respuesta sigue sin confirmación de envío. |
| Disponible sin fechas y con ID conocido | Pendientes. El calendario del fixture no la descubre. |
| HTML desconocido, señales contradictorias o módulo equivocado | Sin verificar. |
| Sesión caducada o identidad distinta | La lectura se rechaza antes de clasificar el estado. |
| Bloqueada que pasa a disponible | La nueva inspección la clasifica en Próximas si el cierre sigue siendo futuro. |

Pasaron 34 pruebas Node. Las 22 suites existentes aprobaron 552 comprobaciones de Chrome. La primera ejecución de la nueva suite falló porque el entorno de Playwright que ejecutaba el fixture no exponía el constructor `URL`. La suite corregida aprobó 47 comprobaciones con 22 escenarios y dos inspecciones de seguimiento.

En ese fixture, 2.2.0 hizo siete consultas y completó su sincronización en 44 ms. El prototipo reutilizó esa respuesta del calendario y añadió 24 GET simulados, uno por inspección. Hubo cero consultas a formularios, cero escrituras académicas y cero consultas nuevas al calendario. Mil clasificaciones sobre un DOM ya analizado tardaron 23 ms en una muestra. Este tiempo excluye descarga y análisis inicial del HTML, y no estima la latencia del campus. Las solicitudes de la instalación personal se mantienen en el nivel de 2.2.0 porque el prototipo solo se ejecuta en el sandbox.

## Advertencia de recuperación

En Moodle UG, el usuario confirmó que los errores transitorios se recuperaron sin mostrar avisos rojos ni dejar fallos activos. La validación real del cuestionario bloqueado reportado en otra cuenta sigue pendiente.

La validación final previa a publicar aprobó 31 pruebas Node y 552 comprobaciones en las 23 suites de Chrome, sin fallos ni suites omitidas. El ZIP definitivo también cargó en un perfil aislado de Chrome como extensión Manifest V3.

El registro existente de fallos guarda `recoveryFailed` únicamente cuando falla la segunda consulta automática. La marca se conserva durante el backoff y durante verificaciones posteriores fallidas, hasta que una consulta exitosa elimine el fallo activo. Las entradas anteriores sin esa marca quedan accesibles en Diagnóstico. El contador histórico de intentos por código no permite deducir si se ejecutó un reintento automático.

Diagnóstico distingue los fallos activos de la ejecución, los reintentos aplazados y las recuperaciones que fallaron. Con el resumen oculto, los fallos sin marca ofrecen un acceso neutral a Diagnóstico. La sesión y la identidad mantienen avisos específicos. La política de red y el almacenamiento académico conservan su comportamiento.

Pasaron 31 pruebas Node y 548 comprobaciones en las 23 suites de Chrome. Una repetición de Apariencia pasó 30 comprobaciones, incluidas cuatro nuevas para el aviso en Claro, Oscuro, Automático y Dark Reader simulado. El ZIP extraído cargó como Manifest V3 en un perfil temporal y confirmó el fallo doble, su persistencia tras recargar durante el backoff y la retirada del aviso después de verificar con éxito. Las pruebas usaron Moodle simulado.

## Visibilidad del estado

La posición predeterminada es Oculto cuando falta una selección válida. Se respetan los tres valores guardados y se conserva la última posición visible al volver a mostrar el estado. La prueba de presentación comprueba el inicio oculto, la persistencia por cuenta, la lista de actividades y cero solicitudes al cambiar la preferencia. La prueba de cabecera comprueba la cancelación con el resumen oculto.

Este ajuste aprobó 30 pruebas Node y 541 comprobaciones en 23 suites de Chrome con Moodle simulado, sin fallos ni suites omitidas. El ZIP extraído cargó como extensión Manifest V3 en un perfil temporal de Chrome. Se verificó el inicio oculto, la activación por teclado y la persistencia de Abajo y Oculto después de recargar.

Ocultar y Mostrar estado aparecen exclusivamente en Personalizar. El botón y Ubicación del estado guardan la misma posición por cuenta. Si se oculta desde Abajo, Mostrar restaura esa posición incluso después de recargar. Las instalaciones con la preferencia anterior Oculto vuelven a Arriba si no hay una ubicación previa guardada. El acceso directo al diagnóstico también restaura la visibilidad y actualiza el selector. La cancelación sigue accesible durante la reverificación y devuelve el foco a Personalizar cuando desaparece.

## Evidencia de cuestionarios, títulos y calificaciones

La disponibilidad se guarda como un indicador separado. Próximas y Atrasadas requieren un primer intento confirmado por un formulario POST del mismo cuestionario, habilitado y visible, sin indicios de intentos previos ni restricciones visibles. Un aviso inequívoco de restricción conserva el cuestionario en Sin verificar. La caché anterior con solo ausencia de intentos sigue siendo conservadora hasta la siguiente comprobación habitual o individual. La detección solo lee el HTML y conserva los TTL.

El reconocimiento anterior trataba el aviso de acceso como una señal de diagnóstico y podía terminar en SELECTOR_MISSING cuando Moodle omitía el control de inicio. Ahora el aviso inequívoco dentro de la vista principal del cuestionario se reconoce en la misma respuesta. No iniciado y Todavía no disponible quedan en Sin verificar, con una descripción propia y sin fallo activo. Los enlaces a intentos anteriores o las tablas sin estado reconocible impiden afirmar que no hubo intentos. Un estado finalizado explícito prevalece. Los cuestionarios restringidos mantienen el plazo de reverificación y quedan fuera del archivado de cierres confirmados. [Vista de cuestionarios](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/quiz/classes/output/renderer.php) · [Regla de acceso por fecha](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/quiz/accessrule/openclosedate/rule.php)

El calendario podía devolver el título ya codificado y la plantilla lo escapaba otra vez, haciendo visible la entidad. Revamp proyecta el título como texto plano al reunir las actividades. Solo decodifica tokens de entidad delimitados, una vez, en un elemento separado. La plantilla escapa ese texto antes de insertarlo y la URL se construye con el identificador validado. Se reutiliza la conversión mientras el título siga presente. El historial conserva su representación anterior y se puede leer sin migración.

La calificación se toma de una única fila Grade o Calificación de la tabla de retroalimentación en la vista principal de una tarea con entrega confirmada e identidad comprobada. Solo se muestran formatos numéricos inequívocos, con su escala si Moodle la incluye. La nota vigente se guarda en el registro de verificación de la cuenta y la actividad, sin añadirla al historial ni al diagnóstico. Se oculta al vencer el TTL de entregadas, al fallar la consulta o al desaparecer de una respuesta válida. Las marcas manuales por sí solas no proporcionan una nota. Las escalas textuales, rúbricas, avisos de acceso desconocidos y variantes sin evidencia suficiente conservan su tratamiento conservador. [Tabla de retroalimentación de Moodle](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/assign/classes/output/renderer.php)

### Comparación local

| Versión | HTTP inicial | Verificaciones | Primera carga | Primer contenido | Sincronización | Script del navegador | HTTP al recargar con caché |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2.1.0 | 24 | 17 | 167 ms | 67 ms | 57 ms | 6,56 ms | 1 |
| 2.2.0 | 24 | 17 | 155 ms | 61 ms | 51 ms | 5,61 ms | 1 |

Ambas versiones realizaron cero verificaciones al recargar con caché. La medición de script incluye el trabajo JavaScript de la página de prueba. Son muestras individuales con datos ficticios y no estiman los tiempos de Moodle UG.

La batería completa aprobó 29 pruebas Node y 528 comprobaciones de Chrome, sin fallos ni suites omitidas. Después de ampliar la exclusión de notas invisibles, se repitieron las 27 comprobaciones de evidencia y comparación. El ZIP final se extrajo y cargó en Chrome aislado. La prueba confirmó el título decodificado, la nota de la tarea, el cuestionario restringido y su paso a Entregadas tras una reverificación individual. También comprobó el PNG público. El HTML exacto del caso informado en Moodle UG sigue pendiente de validación.

## 2.1.0 — Recuperación automática de errores transitorios en todas las sincronizaciones aplicables

Antes, solo Reverificar todo agregaba fallos a `retryQueue`. La primera carga, la sincronización habitual, Actualizar y el ciclo periódico ahora usan esa misma cola. Se agrega una actividad únicamente después de un fallo elegible en la primera ronda. La recuperación es secuencial y vuelve a consultar cada actividad como máximo una vez. Reverificar individual mantiene una sola consulta.

Se recuperan TIMEOUT, NETWORK, HTTP 502, 503, 504 y HTTP 429 con un Retry-After válido de hasta dos segundos. Un Retry-After válido que excede el plazo inmediato conserva su espera. Los errores de identidad, sesión, redirección, interpretación y validación quedan fuera de la cola. Los fallos persistentes conservan su backoff y el último estado válido. Si el reintento tiene éxito, el fallo activo se elimina y la incidencia inicial permanece en el historial. El diagnóstico de la ejecución muestra ambas rondas.

La recuperación dispone de 75 segundos por ejecución, hasta seis actividades y hasta 25 segundos por solicitud. En el ciclo periódico se aplican dos actividades y 25 segundos totales. El temporizador conserva su frecuencia. La cola comprueba la visibilidad, la prioridad manual y la cancelación antes de despachar otro reintento. Las peticiones y la persistencia siguen bajo el bloqueo por cuenta. Las marcas manuales, los foros manuales y los esquemas de almacenamiento se conservan.

### Resultados de 2.1.0

- Node aprobó 29 pruebas. Chrome aprobó 501 comprobaciones en las 21 suites. La primera corrida tuvo dos suites de prueba fallidas. Se corrigieron la espera del escenario de sesión detenida y el fixture que debía devolver un estado válido después del timeout. Se repitieron universal, periodic y diagnostic con 109 comprobaciones aprobadas. El resultado consolidado tiene cero suites fallidas u omitidas.
- En Chrome 157 aislado, el ZIP extraído descubrió 46 actividades, comprobó 42 y recuperó el único timeout de primera carga. Se registraron 50 solicitudes totales y cero fallos persistentes. También se verificaron Actualizar, Créditos y Dark Reader 4.9.135.
- Tras cerrar y reabrir un perfil temporal con el ZIP extraído, se conservaron el ID, la marca manual y la preferencia de 15 minutos. El inicio reutilizó los seis meses y realizó cero comprobaciones HTML.

### Comparación con 2.0.9.1

| Escenario | Versión | HTTP | Consultas iniciales | Reintentos | Recuperadas | Fallos persistentes | Primera ronda | Recuperación | Total | Primer contenido |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 46 actividades, un timeout | 2.0.9.1 | 49 | 42 | 0 | 0 | 1 | 15.026 ms | 0 ms | 15.026 ms | 59 ms |
| 46 actividades, un timeout | 2.1.0 | 50 | 42 | 1 | 1 | 0 | 15.026 ms | 4 ms | 15.030 ms | 61 ms |
| 46 actividades, sin fallos | 2.0.9.1 | 49 | 42 | 0 | 0 | 0 | 70 ms | 0 ms | 71 ms | 25 ms |
| 46 actividades, sin fallos | 2.1.0 | 49 | 42 | 0 | 0 | 0 | 63 ms | 0 ms | 64 ms | 24 ms |

Son mediciones individuales con datos ficticios y respuestas locales. El primer contenido se mide al disponer de actividades. Las diferencias de tiempo no estiman el rendimiento de Moodle UG.

## Entorno de pruebas

## Entorno local

Las pruebas usan datos ficticios. El ejecutor inicia Moodle simulado en `127.0.0.1:8765`, abre un perfil temporal por suite y bloquea las solicitudes ajenas a las rutas de prueba. Chrome se requiere para las comprobaciones de navegador. Las pruebas de Node usan la biblioteca estándar.

Desde la raíz del proyecto, configura la ruta absoluta del archivo de entrada de Playwright CLI. Se verificó con la entrada `playwright-core/lib/tools/cli-client/cli.js` de la instalación local. Deja libre el puerto 8765.

```powershell
npm test
$env:UG_PLAYWRIGHT_CLI = 'C:\ruta\a\cli.js'
npm run test:browser
npm run benchmark:recovery
npm run benchmark
```

La suite de referencia de recuperación se ejecuta con `npm run benchmark:recovery`. Las referencias históricas estrictamente necesarias para las comparaciones se encuentran en `tests/references/`. Las capturas y otras salidas se generan en `output/`.

La comprobación de integridad del manifiesto y las suites de Créditos usan el PNG original incluido en el árbol del proyecto. El entorno simulado sirve el mismo archivo declarado por el manifiesto.

## Qué cubren las pruebas

- Identidad y sesión, preservación del historial, marcas manuales, preferencias y aislamiento entre cuentas.
- Carga inicial, descubrimiento de nuevas actividades, reutilización de caché, reintentos y recuperación.
- Actualización periódica y coordinación entre pestañas, Actualizar y Reverificar todo.
- Interpretación de tareas y cuestionarios, errores HTTP, timeouts, redirecciones y rutas académicas permitidas.
- Apariencia manual y automática, cambios de paleta, contraste y Créditos. El cambio visual se comprueba sin solicitudes académicas ni reconstrucción de la lista.

## Resultados históricos de 2.0.9.1

| Comprobación | Resultado |
|---|---|
| Sintaxis | 31 archivos JavaScript comprobados, incluidas las referencias históricas. |
| Node | 29 aprobadas, 0 fallidas y 0 omitidas. |
| Chrome con Moodle simulado | 479 aprobadas, 0 fallidas y 0 suites omitidas. Incluye 18 comprobaciones de cabecera y 24 de Créditos, además de las comparaciones históricas. |
| Medición de políticas | Completada con conjuntos ficticios de 20, 60, 100, 500 y 1.000 actividades. |
| ZIP definitivo | Chrome 157 cargó la copia extraída como Manifest V3, mostró una actividad ficticia y ejecutó Actualizar. Los recursos del manifiesto coincidieron con los del borrador. |
| Dark Reader oficial 4.9.135 | El ZIP extraído pasó las pruebas de Dinámico, Filtro, Filtro+ y cambio de paleta. La cabecera conservó su geometría durante la cancelación con Dinámico y Filtro cargó el PNG público. |

En el ZIP extraído y la carpeta personal se comprobaron el texto exacto de Créditos y la apertura de los tres destinos configurados en pestañas nuevas, con respuestas de prueba y sin acceso a la ventana de origen. Escape y × cerraron el diálogo. En 360 × 640 el modal conservó la proporción de la imagen de 480 × 683 sin desbordamiento horizontal. Abrir y cerrar Créditos generó cero solicitudes académicas.

La suite de cabecera comparó las posiciones antes, durante y después de reverificar a 960 px. También comprobó anchos de 320 y 360 px y zoom CSS al 200 %. Cancelar se oculta de la navegación por teclado cuando queda inactivo y devuelve el foco al control de estado si estaba enfocado. La cancelación abortó las tres consultas de calendario retenidas por el fixture.

El usuario confirmó el ajuste de cabecera en su instalación personal en Moodle UG. Las pruebas automatizadas del borrador público y del ZIP se realizaron con Moodle simulado en perfiles aislados.
