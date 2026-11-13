# Verificaciones de Campus UG Revamp

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
