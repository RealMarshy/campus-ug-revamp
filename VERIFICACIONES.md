# Verificaciones de Campus UG Revamp 2.2.0

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
