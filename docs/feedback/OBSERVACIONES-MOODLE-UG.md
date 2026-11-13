# Observaciones de Moodle UG sobre Feedback

Las fechas de las actividades se sustituyeron por valores ficticios que conservan el orden y los intervalos observados.

## Incidencia posterior a la instalación 2.3.0

La captura de F2 muestra el control «Responda a las preguntas» durante el plazo. Revamp muestra la misma encuesta como Sin verificar, con cierre correcto. Una captura del panel se tomó durante «Comprobando sesión…». Esa imagen no demuestra un fallo de sesión ni el resultado final de la consulta. El código anterior exigía una jerarquía CSS concreta y `courseid` obligatorio. La reproducción con un enlace local al formulario sin ese parámetro confirma el defecto del detector. El HTML de UG sigue siendo necesario para identificar cuál de esas condiciones falló en el campus.

## Evidencia visual del 13 de noviembre de 2026

- **Disponible, F2.** En `view.php?id=<cmid>` aparece «Responda a las preguntas». El encabezado dice «Abrió» y muestra 10/03/2030 a las 00:00. El cierre visible sigue siendo 14/03/2030 a las 23:59. La captura confirma el texto y la apariencia del control. La etiqueta HTML, las clases y su destino se basan en Moodle estándar y quedan por confirmar en el DOM de UG.
- **Envío recién recibido, F1.** En `complete.php` aparece «Sus respuestas han sido guardadas. Gracias.». Confirma el envío de la sesión observada.
- **Envío previo, F1.** En otra captura de `complete.php` aparece «Usted ya ha entregado esta retroalimentación.». Confirma participación previa en esa vista. La presencia del mismo aviso en `view.php` sigue pendiente de observación en Moodle UG.
- **Calendario diario.** Las dos aperturas figuran a las 00:00 del 10/03/2030, ahora como «Hoy». La respuesta mensual de UG y los cierres de calendario siguen pendientes.

La integración consulta únicamente la vista principal y comprueba identidad, módulo y estructura antes de aceptar una señal. Los dos avisos de `complete.php` quedan como evidencia documental. Se conserva la confirmación automática previa cuando una consulta posterior es ambigua o muestra disponibilidad, y la marca manual tiene precedencia. Las capturas no se incorporan al paquete.

## Evidencia visual aportada el 12 de noviembre de 2026

Se revisaron tres capturas de Chrome y sus extractos de accesibilidad. Se conserva únicamente la transcripción técnica mínima. **F1** y **F2** son referencias ficticias.

### Estado A · Todavía no disponible

Las vistas de F1 y F2 muestran «La encuesta no está disponible». Ambas indican **Abre** el 10/03/2030 a las 00:00 y **Cierra** el 14/03/2030 a las 23:59, según la hora mostrada por el campus. El calendario de la misma serie presenta la apertura como «Mañana». En ambas vistas se ven «Continuar», «Volver al curso» y un control para descartar el aviso. En el área capturada no se ve un control para iniciar la encuesta. El extracto de accesibilidad de F2 identifica el aviso como alerta y «Continuar» como botón. Quedan por inspeccionar en el DOM las etiquetas y clases del contenedor, el destino de «Continuar», el marcado de las fechas y si existe algún control de respuesta oculto o deshabilitado.

### Estado D · Cerrada

El usuario reporta que una encuesta con fechas ya transcurridas muestra el mismo aviso, «La encuesta no está disponible». En las dos vistas adjuntas, las fechas coinciden con las del estado A. El estado cerrado queda registrado como reportado y pendiente de una captura que muestre un cierre anterior al momento de observación. El texto del aviso por sí solo es insuficiente para distinguir ambos estados.

### Calendario · Vista por día

El 10/03/2030 aparecen dos entradas de apertura, una para F1 y otra para F2. Ambos títulos terminan en «abre», muestran las 00:00 y ofrecen «Ir a la actividad». El extracto de accesibilidad vincula cada entrada con su propia vista `/mod/feedback/view.php?id=<cmid>`. Esto confirma la relación visible entre cada apertura y su encuesta. El tipo interno `open`, los campos del JSON mensual y la presencia de eventos de cierre siguen pendientes de confirmar. El ancla de un evento en el calendario y el parámetro `id` de la vista de encuesta cumplen funciones distintas.

### Evidencia pendiente

Los estados B, disponible, y C, ya respondida, quedan pendientes de las próximas capturas. Los fixtures actuales conservan su condición de simulaciones. La evidencia de esta entrada se limita a las capturas y al árbol de accesibilidad aportados.

## Registro inicial · 12 de noviembre de 2026

Se reportaron dos encuestas del campus en la ruta `/mod/feedback/view.php?id=<cmid>`. Aquí se usan las referencias ficticias **F1** y **F2**, sin asignarles un estado hasta recibir las capturas. El usuario informó que ya existen imágenes de una encuesta cerrada, otra que aún no abre y eventos de apertura. Las imágenes no estuvieron disponibles para inspección en esta sesión. Los enlaces tampoco pudieron abrirse desde el navegador de consulta y no se encontró una ventana local de Chrome o Edge abierta. Por tanto, este registro inicial contiene evidencia reportada por el usuario y referencias de Moodle 4.5, sin observaciones directas de capturas, DOM autenticado ni JSON de Moodle UG.

| Estado | Evidencia disponible | Datos pendientes de registrar |
| --- | --- | --- |
| A · Todavía no disponible | Captura reportada. | Texto exacto, fechas visibles, navegación y presencia o ausencia visible de controles. El DOM debe confirmar etiqueta, clases, ubicación y si hay controles ocultos o deshabilitados. |
| B · Disponible para responder | Evidencia anunciada para una observación posterior. | Texto exacto, etiqueta HTML, ruta y nombres de parámetros, clases, atributos de habilitación, avisos y fechas. |
| C · Ya respondida | Evidencia anunciada para una observación posterior. | Mensaje y contenedor, cambios respecto a B, posibilidad de responder otra vez y certeza de que la confirmación corresponde al envío de la cuenta. |
| D · Cerrada | Captura reportada. | Aviso, fechas, navegación y diferencias observables frente a A. Clases y estructura quedan pendientes del DOM. |

Una captura permite transcribir lo visible y constatar que un control no aparece en la zona capturada. Las clases, los atributos, el destino de un control y la presencia de elementos ocultos requieren inspección del DOM.

## Referencia técnica de Moodle 4.5

- La vista principal puede usar el mismo aviso cuando la encuesta aún no abre o ya cerró. Para distinguir ambos estados hace falta una fecha de apertura o cierre coherente. El cierre por sí solo no acredita un envío. [Vista principal de Moodle](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/feedback/view.php#L121)
- La barra de acciones documentada genera un enlace a `/mod/feedback/complete.php` con `id` y `courseid`. Puede añadir `gopage` al continuar. Son referencias para inspeccionar el enlace, sin abrirlo. La vista principal puede registrar una visualización en Moodle y la ruta del formulario puede iniciar su procesamiento. [Barra de acciones](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/feedback/classes/output/standard_action_bar.php#L78) · [Procesamiento del formulario](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/feedback/complete.php#L75)
- En la vista principal puede aparecer una confirmación de que ya se respondió. Con envíos múltiples, un enlace habilitado por sí solo demuestra disponibilidad y deja indeterminada la participación previa. [Reglas de envío de Moodle](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/feedback/classes/completion.php#L595)

## Calendario

**Moodle UG.** Hay capturas de aperturas reportadas. Queda pendiente confirmar el texto visible, la presencia de cierres y los campos que devuelve el calendario mensual.

**Moodle 4.5.** Los eventos `open` y `close` se crean por separado según las fechas configuradas. El exportador mensual puede incluir `instance` como ID del módulo cuando el evento tiene un módulo asociado. `viewurl` puede llevar al día del calendario y `action.url` es opcional. Cada evento tiene su propio ID. Para asociar apertura y cierre se debe corroborar que ambos corresponden al mismo módulo, sin usar el ID del evento como `cmid`. [Generación de eventos](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/feedback/lib.php#L719) · [Exportador](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/calendar/classes/external/event_exporter_base.php#L93)

Para el próximo registro basta una fila por evento con `modulename`, `eventtype`, `timestart`, `timesort`, `instance` y la estructura de la URL de actividad, si aparece. Sustituir fechas e IDs por valores ficticios coherentes. Si se necesita anotar el ID del evento para distinguir filas, usar valores ficticios distintos del `cmid`. Conservar únicamente nombres de parámetros y rutas, sin la respuesta mensual completa.

## Referencias del sandbox

`tests/feedback-check.js` ya contiene casos simulados de apertura futura, cierre, acceso restringido, envío confirmado, varios envíos, anonimato, respuesta en curso y calendario sin fechas. Sus estructuras se basan en Moodle 4.5 y los datos son ficticios. Se mantienen como referencias simuladas hasta disponer de muestras directas del campus. Ninguna estructura de Moodle UG se ha incorporado como fixture confirmado.

## Formato para agregar evidencia

Añadir una entrada fechada por estado, indicando el origen de cada dato. Para capturas, transcribir solo el aviso y los controles visibles. Para DOM, anotar la etiqueta, clases y atributos relevantes del aviso y del control, junto con la ruta y los nombres de parámetros. Usar el mismo ID ficticio para el módulo en la vista, el control y el calendario. Mantener las entradas anteriores y anotar las discrepancias en una nueva entrada.

Excluir cookies, tokens, credenciales, identificadores de estudiantes, preguntas, respuestas y HTML autenticado completo. Recoger los estados B y C a partir de una vista ya disponible o aportada por el usuario, sin pulsar «Responder», «Continuar» ni «Enviar».
