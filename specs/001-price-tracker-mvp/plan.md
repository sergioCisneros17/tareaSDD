# SDD — Price Tracker & Comparator: MVP

## 1. Alcance, referencias y estado

Este plan desarrolla la constitución y la especificación de la primera funcionalidad. Define módulos, contratos, persistencia y verificación; no contiene código de implementación.

El MVP es una página web personal, sin cuentas, para registrar URLs de Nike y Adidas con un color y una talla exactos, consultar precios y stock, conservar su histórico y comparar ofertas en BOB. No se incorpora una CLI de producto.

Las decisiones técnicas de este documento son propuestas de implementación. Las decisiones de producto que la especificación deja abiertas siguen marcadas como [NECESITA ACLARACIÓN]; este plan no las considera aprobadas ni declara completo el MVP mientras condicionen sus criterios de aceptación.

## 2. Estructura de módulos y responsabilidades

La estructura inicial será una aplicación modular con un servicio de fondo y un dashboard servido por la misma aplicación. El servicio seguirá consultando mientras esté ejecutándose, aunque el usuario cierre la página. No se requieren microservicios.

| Módulo | Responsabilidad y límites | RF cubiertos |
| --- | --- | --- |
| Dominio y contratos comunes | Definir identidad de producto y variante, estados de consulta, evidencia, observación válida y errores tipificados. No conocer selectores ni presentación. | RF-1, RF-2, RF-4, RF-5 |
| Registro de seguimientos | Validar tienda, mercado y selección; detectar duplicados; iniciar la primera consulta y conservar el estado pendiente de verificación. | RF-1, RF-3 |
| Motor de scraping | Ejecutar adaptadores, controlar tiempos, cancelación, límites por dominio y aislamiento de fallos. No interpretar precios ni escribir históricos. | RF-2, RF-3, RF-4 |
| Adaptadores de tiendas | Resolver identidad y extraer evidencia de Nike o Adidas para la variante exacta. Encapsular selectores y peculiaridades regionales. | RF-1, RF-2, RF-4 |
| Normalización y validación | Interpretar importes, moneda, color, talla y stock; rechazar datos ambiguos; producir el esquema común validado. | RF-2, RF-5, RF-7 |
| Política monetaria y de tallas | Aplicar únicamente equivalencias y conversiones acordadas, conservando su procedencia. Sin reglas acordadas, declarar los datos no comparables. | RF-1, RF-2, RF-5, RF-6, RF-7 |
| Planificador y ejecutor de trabajos | Gestionar consultas iniciales, diarias y manuales, exclusión por seguimiento, aplazamientos y recuperación tras interrupciones. | RF-3, RF-4 |
| Persistencia | Mantener entidades, intentos, trabajos y observaciones inmutables, con transacciones y migraciones. | RF-1, RF-3, RF-4, RF-5 |
| Consultas de comparación | Obtener última observación válida, último intento, elegibilidad, mínimo histórico y orden de ofertas. No volver a consultar tiendas al abrir la tabla. | RF-5, RF-6 |
| Servicio de aplicación y HTTP | Exponer registro, listado, actualización manual, estado e histórico; convertir errores internos a respuestas del producto. | RF-1 a RF-7 |
| Dashboard y presentación | Formulario, seguimientos, ofertas e histórico; mensajes en español, BOB, cm y fechas con zona explícita. No contener lógica de scraping. | RF-1, RF-3, RF-4, RF-5, RF-6, RF-7 |
| Diagnóstico | Registrar eventos técnicos en inglés y alertas visibles ante incompatibilidad de páginas; omitir trazas en respuestas al usuario. | RF-4, RF-7 |

El registro de adaptadores se configura fuera del motor. Incorporar una tienda requiere su adaptador, configuración y fixtures; no requiere cambiar el algoritmo del motor, la normalización común ni el dashboard. Las ampliaciones del esquema común requieren revisión explícita de compatibilidad.

### Flujo principal

1. El usuario entrega URL, color y talla. Se valida el dominio y la región admitida sin asumir un mercado a partir de BOB.
2. Se crea un seguimiento pendiente de verificación y un trabajo inicial de forma atómica. Un bloqueo inicial conserva ese estado sin inventar identidad confirmada ni observaciones.
3. El ejecutor obtiene permiso del dominio y llama al adaptador correspondiente con plazo y señal de cancelación.
4. El adaptador obtiene la página y produce evidencia de identidad, precio y stock de la variante. La normalización valida el resultado fuera de los selectores de la tienda.
5. Una transacción registra el resultado del intento y, cuando procede, añade una observación. Los errores nunca actualizan precios anteriores.
6. La tabla consulta datos persistidos y separa ofertas elegibles de seguimientos pendientes, fallidos, agotados o no comparables.

La identidad definitiva puede resolverse después del registro. Si esa resolución descubre un duplicado, se vincula al seguimiento existente y se conservan los intentos; no se sobrescriben ni eliminan observaciones históricas. La distinción entre registro pendiente y registro inválido es una propuesta que requiere armonizar RF-1 con el caso del primer intento bloqueado.

**Cobertura:** RF-1 a RF-7.

## 3. Modelo de datos relacional

Se usará SQLite con claves foráneas, restricciones de unicidad y migraciones versionadas. Los importes se representarán con enteros en unidades monetarias menores, junto con moneda y escala; las tasas, si se aprueban, usarán decimales exactos. No se emplearán números binarios de coma flotante para dinero.

| Entidad | Datos principales y relaciones | Restricciones / RF |
| --- | --- | --- |
| Store | Identificador, nombre, clave del adaptador. Una tienda tiene varios mercados configurados. | Tienda única; RF-1, RF-2 |
| StoreMarket | Tienda, país o región, dominios y rutas admitidos, moneda esperada y configuración de consulta. | No inferir moneda solo por dominio; RF-1, RF-2, RF-4 |
| Product | Mercado, identificador externo verificado, nombre y URL canónica. Pertenece a una tienda mediante su mercado. | Unicidad por mercado e identificador externo; RF-1, RF-2 |
| Variant | Producto, identificador externo cuando exista, color verificado, talla publicada, valor en cm y procedencia de equivalencia cuando esté verificada. | Una combinación exacta por producto; no mezclar variantes; RF-1, RF-2 |
| Tracking | URL entregada, mercado, color y talla solicitados, variante verificada opcional, fecha de registro y estado de resolución. | Unicidad de seguimiento por variante resuelta; deduplicación provisional por URL normalizada y selección; RF-1, RF-3 |
| ScanJob | Seguimiento, origen inicial/diario/manual, instante programado, próximo instante permitido, estado y reserva temporal de ejecución. | Máximo un trabajo pendiente o en curso por seguimiento; RF-3, RF-4 |
| ScanAttempt | Trabajo, inicio y fin UTC, resultado, código técnico, estado HTTP si existe y resumen de evidencia o fallo. | Cada intento conserva su identidad; sin precios ficticios; RF-2, RF-4 |
| PriceObservation | Intento único, variante, producto/tienda/mercado observados, URL, nombre, color y talla observados, precio actual, precio original opcional, moneda, escala, stock, fecha UTC y versión del adaptador. | Solo inserción; importe actual positivo; original ausente o superior al actual; RF-2, RF-5 |
| MonetaryValuation | Observación, importe actual y original en BOB cuando corresponda, regla aplicada y referencia opcional de conversión. | Separada del importe publicado; valoraciones inmutables; RF-5, RF-6, RF-7 |
| ConversionReference | Si se autoriza conversión: monedas, tasa exacta, fuente, instante de referencia y regla de redondeo. | No crear tasas supuestas; RF-5, RF-6 |
| DomainSchedule | Dominio, siguiente acceso permitido, aplazamiento comunicado y parámetros de concurrencia y reintentos. | Compartido por los trabajos del mismo dominio; RF-3, RF-4 |

Las relaciones principales son tienda → mercado → producto → variante → observaciones. Un seguimiento genera trabajos; cada trabajo registra intentos y cada intento produce como máximo una observación de su variante. La instantánea de identidad en la observación evita que un cambio de nombre o URL reescriba el pasado.

Los campos de precio original, valoración BOB y equivalencia en cm pueden estar ausentes; la ausencia nunca se representa como cero. Los estados de stock distinguen disponible, agotado, desconocido y variante ausente. El motivo de fallo del intento se mantiene separado del stock.

### Índices, integridad y migraciones

- Índices por variante y fecha de observación; seguimiento y fecha de intento; estado y fecha de trabajo; mercado e identidad externa.
- Registro inicial y creación del trabajo en una transacción; finalización del intento e inserción de su observación en otra transacción.
- Restricción única por intento en observaciones para evitar duplicados por reanudación de una escritura. Dos consultas distintas con el mismo precio sí generan dos observaciones.
- Las reservas de trabajos caducan; la actualización transaccional evita dos ejecutores para un seguimiento. Un proceso que pierda la reserva no puede confirmar resultados tardíos.
- Las migraciones no eliminan ni reescriben observaciones existentes. Se verifica su aplicación sobre una base con históricos antes de integrar cambios.
- No hay purga automática ni borrado en cascada de históricos. La retención sigue pendiente de definición.

**Cobertura:** RF-1, RF-3, RF-4, RF-5, RF-6.

### Ejemplo ilustrativo de datos, sin código

Los importes siguientes son ficticios; no afirman que un mercado real de estas tiendas publique precios en BOB.

| Entidad | Ejemplo |
| --- | --- |
| Tienda y mercado | Nike; mercado de prueba con moneda BOB |
| Producto | Identificador de prueba P-001; zapatilla de ejemplo |
| Variante y seguimiento | Negro; 27 cm verificados; registro el 25/10/2026 a las 12:00 UTC |
| Primera observación | 25/10/2026, 12:01 UTC; actual 650,00 BOB; original 800,00 BOB; disponible |
| Segunda observación | 26/10/2026, 12:01 UTC; actual 620,00 BOB; original 800,00 BOB; disponible |
| Representación monetaria | 620,00 BOB se conserva como 62000 unidades menores, moneda BOB y escala 2 |
| Comparación | Actual 620,00 BOB; mínimo histórico 620,00 BOB del 26/10/2026 |
| Intento posterior bloqueado | Se conserva la segunda observación; el último intento indica bloqueo y la variante sale de las mejores ofertas |

En una moneda extranjera, la observación conserva el importe publicado. Sin conversión acordada no existe valoración BOB ni posición en la clasificación. El histórico no se etiqueta falsamente como BOB.

**Cobertura:** RF-2, RF-4, RF-5, RF-6, RF-7.

## 4. Contrato base del scraper

Todos los adaptadores implementarán el mismo contrato. Se describe en lenguaje natural, sin firmas ni cuerpos de código.

| Método obligatorio | Entrada | Salida y obligaciones | RF |
| --- | --- | --- | --- |
| describe | Sin datos de un producto | Identidad de tienda, mercados y dominios admitidos y versión del adaptador. No selecciona automáticamente un mercado desconocido. | RF-1, RF-4 |
| resolveProduct | URL, mercado, color y talla solicitados, contexto de ejecución | Identidad canónica de producto y variante, o resultado explícito de verificación pendiente, producto inválido, variante ausente o fallo tipificado. No deduce identidad por similitud de nombres. | RF-1, RF-2, RF-4 |
| fetchProducts | Colección de solicitudes de variantes y contexto de ejecución | Un resultado por solicitud, asociado a su identidad, con el esquema común validado o un error tipificado. Para el MVP cada llamada operativa consulta un único seguimiento. No comparte el fallo de una variante con las demás. | RF-2, RF-4 |

El contexto proporciona acceso de red sujeto al motor, hora de referencia, plazo y cancelación. Los adaptadores no crean conexiones fuera de ese acceso ni implementan sus propios bucles de reintentos. La obtención y extracción de HTML podrán ser operaciones internas del adaptador; no se duplicarán como algoritmos particulares del motor.

El resultado común identifica tienda, mercado, producto, variante, URL efectiva, instante de observación, precio y moneda publicados, precio original opcional, stock y evidencia de correspondencia con la variante. Se valida antes de salir del adaptador mediante el módulo común de normalización, que puede utilizarse sin red en los tests. No contiene textos de interfaz ni escrituras de base de datos.

Un importe, moneda o talla desconocidos se declaran ausentes y con motivo. Un resultado parcial nunca se presenta como oferta confirmada. Los errores distinguen timeout, fallo de red, bloqueo/captcha, límite de consultas, producto no encontrado, variante ausente, página incompatible y datos inválidos.

Una respuesta HTTP 404/410 no prueba por sí sola que el producto esté descatalogado: se conserva como evidencia de no encontrado. Un captcha con respuesta HTTP 200 sigue siendo un bloqueo. Ningún método cambia automáticamente a otra variante o mercado.

La estrategia del adaptador prioriza evidencia explícita de la variante en datos estructurados o contenido visible. Una talla seleccionable o un botón genérico no bastan para confirmar stock; ante evidencia contradictoria se declara desconocido. El criterio final para preventa, pedidos pendientes y recogida exclusiva queda sujeto a aclaración.

**Cobertura:** RF-1, RF-2, RF-4; respeta el contrato `fetchProducts()` y la separación exigida por la constitución.

## 5. Decisiones técnicas y alternativas

| Decisión propuesta | Justificación | Alternativa descartada para el MVP | RF |
| --- | --- | --- | --- |
| Node.js + TypeScript | Respeta la constitución y permite contratos compartidos entre motor, servicio y dashboard. | Python: alternativa razonable, incompatible con el stack ya aprobado sin modificar la constitución. | RF-1 a RF-7 |
| HTTP con fetch y análisis HTML mediante Cheerio para contenido estático | Evita iniciar un navegador cuando la evidencia suficiente ya está en la respuesta. Cheerio se justifica por el análisis DOM; no se usarán expresiones regulares como parser HTML. | Solo peticiones HTTP: insuficiente cuando el contenido necesario depende de JavaScript. | RF-2, RF-4 |
| Playwright únicamente cuando la página sea dinámica | Permite obtener la variante y evidencia renderizadas; su uso queda declarado en la estrategia del adaptador. | Playwright para todas las páginas: coste de memoria y ejecución innecesario. No se usa como evasión tras un bloqueo. | RF-2, RF-4 |
| SQLite local con migraciones y acceso transaccional | Suficiente para una colección personal; conserva históricos y trabajos sin un servicio de base adicional. | JSON local: integridad y consultas históricas insuficientes. PostgreSQL: operación adicional sin necesidad actual. | RF-1, RF-3, RF-4, RF-5, RF-6 |
| Planificador persistente y ejecutor acotado dentro del servicio | Permite horarios por registro, consultas manuales, exclusión y aplazamientos con estado recuperable. | Cron sin estado: no resuelve por sí solo deduplicación ni reintentos. Redis y workers distribuidos: complejidad no justificada para este MVP. | RF-3, RF-4 |
| Servicio HTTP de Node.js y dashboard con HTML, CSS y JavaScript mínimos | Formulario, tablas e histórico no requieren un framework de interfaz. El servicio limita cuerpo de peticiones, valida entradas y devuelve errores consistentes. | SPA con framework y servicios separados: dependencias y despliegue adicionales. CLI: no corresponde a la interfaz elegida. | RF-1, RF-3, RF-5, RF-6, RF-7 |
| Pruebas unitarias e integración con el ejecutor de pruebas de Node.js; Playwright para pruebas de interfaz | Reutiliza herramientas del stack y permite verificar capas separadamente. | Frameworks de tests adicionales: no aportan una necesidad demostrada inicialmente. | RF-1 a RF-7 |
| Códigos técnicos en inglés y catálogo de mensajes en español | Evita filtrar trazas y permite mensajes consistentes sin acoplar adaptadores a la interfaz. | Mensajes directos del scraper: mezclan idioma, diagnóstico y presentación. | RF-4, RF-7 |

Cada dependencia adicional deberá justificarse en el PR. La versión de Node.js y el mecanismo de acceso SQLite se fijarán antes de implementar, verificando soporte de transacciones y migraciones; no se añade un ORM inicialmente. No se incluye un proveedor de divisas hasta resolver esa decisión de producto.

### Plazos, reintentos y recuperación

Como valores técnicos iniciales propuestos, cada petición HTTP tendrá un plazo de 15 segundos y cada intento de seguimiento un máximo total de 60 segundos, incluido cualquier renderizado dinámico. La cancelación cerrará los recursos del intento. El trabajo no permanecerá indefinidamente en curso.

Se propone una consulta activa por dominio, pausa mínima de 5 segundos entre accesos y hasta dos reintentos adicionales ante fallos transitorios de red o respuestas 5xx. El backoff tendrá bases de 5 y 15 segundos con variación aleatoria acotada; el planificador persistirá las esperas sin bloquear otros dominios. Estos valores están pendientes de ratificación junto con los límites de la especificación.

Un captcha o bloqueo no se reintenta dentro del mismo trabajo: el siguiente intento será diario o manual. Una página incompatible o datos inválidos tampoco se reintentan automáticamente. Un límite 429 aplaza el dominio; `Retry-After`, tanto fecha como segundos, fija un mínimo obligatorio que ninguna actualización manual puede saltarse. Sin ese encabezado se propone un aplazamiento de 15 minutos. Tras agotar reintentos, el seguimiento queda fallido y conserva la última observación.

Un intento con timeout queda registrado como fallo de red por tiempo excedido; no produce una observación nueva. Al reiniciar, una reserva caducada pasa a estado interrumpido y se recupera mediante un trabajo pendiente. La escritura final exige que la reserva siga vigente.

La programación diaria se calcula desde la fecha de registro en intervalos de 24 horas. La actualización manual no cambia ese anclaje. Se propone agrupar consultas diarias vencidas durante una interrupción en una única consulta de recuperación por seguimiento, sin simular observaciones pasadas. Una coincidencia entre consulta diaria y manual genera un solo trabajo; el siguiente vencimiento diario conserva su anclaje original.

**Cobertura:** RF-3, RF-4, RF-5. La tolerancia de retraso y la política de recuperación requieren validación de producto.

## 6. Comparación, presentación y datos ambiguos

La proyección de ofertas combina última observación válida y último intento terminado. Solo clasifica variantes con stock confirmado, precio positivo valorado en BOB y sin un fallo posterior. Una actualización pendiente o en curso no borra el último dato; el dashboard muestra ambos estados y la fecha del dato conservado.

El orden es precio BOB ascendente, observación más reciente y, después, tienda y nombre del producto. Si todos esos campos coinciden, se usa el identificador estable del seguimiento únicamente para mantener un resultado reproducible.

El mínimo histórico pertenece a la misma variante. Se muestra con su fecha y no se recalcula usando monedas mezcladas. La política de conversión histórica y la inclusión de observaciones sin stock están pendientes: hasta acordarlas no se declara verificada esa parte de RF-5.

La interfaz tendrá formulario de registro, lista de todos los seguimientos con su estado, tabla de ofertas elegibles y acceso al histórico. Los fallos de HTML generarán una alerta visible en el seguimiento y un evento técnico; no se requieren canales externos. Se propone presentar fechas en America/La_Paz con identificación de zona, conservando UTC en los datos.

Los históricos muestran moneda publicada y, si existe, valoración en BOB diferenciadas. El precio original se etiqueta con su moneda; no se coloca un importe extranjero bajo una etiqueta BOB. Esta interpretación requiere corregir la ambigüedad de RF-7 antes de cerrar aceptación.

El stock desconocido, la ausencia del precio original, los importes no comparables y la inexistencia de observaciones se presentan explícitamente; ninguno se sustituye por cero. Una observación demasiado antigua sigue las reglas actuales de RF-6; no se inventa un umbral de caducidad sin acuerdo.

**Cobertura:** RF-2, RF-4, RF-5, RF-6, RF-7.

## 7. Estrategia de tests sin llamadas reales a tiendas

Las pruebas automáticas no accederán a Nike, Adidas ni proveedores de cambio. El acceso a red se sustituirá por transportes simulados; en pruebas de navegador se servirán fixtures locales y se interceptarán las solicitudes, rechazando cualquier destino externo no previsto. Toda hora, espera y tasa de cambio usada en tests será controlada.

### Fixtures y pruebas de contrato por tienda

Cada adaptador tendrá fixtures de HTML válido y alterado, con y sin descuento, distintos precios por variante, variante agotada o ausente, stock contradictorio, moneda ambigua, página de bloqueo con HTTP 200 y cambios de selectores. Las páginas dinámicas tendrán documentos y respuestas locales que reproduzcan su actualización sin contactar servicios reales.

Cada fixture documentará origen o construcción, mercado representado, variante objetivo y resultado esperado revisado. Se conservarán únicamente datos necesarios para la prueba, sin cookies ni credenciales. Los resultados esperados no se generarán con el mismo parser sometido a prueba.

La suite común de contrato verificará que cualquier adaptador expone sus capacidades, resuelve identidad y entrega un resultado por solicitud, respeta cancelación y devuelve el esquema validado o un error tipificado. También comprobará que no escribe en persistencia ni elude el transporte controlado.

**Cobertura:** RF-1, RF-2, RF-4 y principios constitucionales 2, 3 y 4.

### Matriz de pruebas y aceptación

| Nivel y escenario | Evidencia esperada | RF |
| --- | --- | --- |
| Unitaria: URLs, mercados e identidad | Rechazo de dominios no admitidos, deduplicación de URLs equivalentes y distinción entre variantes y mercados. | RF-1 |
| Unitaria: normalización | Importes positivos exactos, separadores y monedas explícitos, original coherente, cm verificables; ausencia o ambigüedad nunca se convierten en cero ni equivalencia supuesta. | RF-2, RF-7 |
| Unitaria: errores y disponibilidad | Diferenciación de bloqueo, timeout, límites, HTML incompatible y variante ausente; stock genérico no confirma stock exacto. | RF-2, RF-4 |
| Unitaria: calendario con reloj simulado | Consulta inicial, intervalos anclados de 24 horas, manual sin desplazar calendario y coincidencias sin duplicación. | RF-1, RF-3 |
| Unitaria: política por dominio | Plazos finitos, backoff, máximo de reintentos y respeto de Retry-After en fecha o segundos; un dominio bloqueado no frena otro. | RF-3, RF-4 |
| Integración: SQLite temporal real | Transacciones, claves foráneas, unicidad, observaciones iguales en intentos distintos e idempotencia de una confirmación repetida. | RF-1, RF-4, RF-5 |
| Integración: recuperación y exclusión | Dos reclamaciones del mismo trabajo producen un solo ejecutor; tras interrupción no se aceptan resultados de reservas vencidas. | RF-3, RF-4, RF-5 |
| Integración: migraciones e histórico | Migrar una base poblada y reabrirla conserva importes, monedas, variantes y fechas; un fallo no altera observaciones. | RF-4, RF-5 |
| Integración: mínimo y clasificación | No se mezclan variantes ni monedas; orden por precio y desempates; exclusión de agotados, desconocidos, fallidos y no comparables. | RF-5, RF-6 |
| Interfaz con fixtures locales | Registrar, ver estado, actualizar manualmente, consultar histórico, tabla vacía y recuperación después de un fallo. | RF-1, RF-3, RF-4, RF-5, RF-6 |
| Interfaz: presentación | Mensajes españoles sin trazas; importes con moneda correcta, talla en cm y fechas con zona explícita. | RF-7 |

Antes de integrar cambios, CI ejecutará las pruebas unitarias, de contratos, integración, interfaz y comprobación de tipos. Un fallo impide integrar. No habrá tests automáticos que dependan de la disponibilidad real de las tiendas.

Los criterios afectados por dudas abiertas tendrán casos de aceptación pendientes identificados, no resultados simulados declarados como aceptación real. Los fixtures prueban interpretación y tolerancia ante escenarios conocidos; no demuestran por sí solos compatibilidad con el HTML actual de una tienda. La validación final del mercado acordado deberá distinguirse de la suite offline y no puede considerarse cumplida únicamente con mocks.

**Cobertura:** RF-1 a RF-7 y principio constitucional 4.

## 8. Decisiones pendientes y límites de aceptación

| Estado | Decisión pendiente | Impacto |
| --- | --- | --- |
| [NECESITA ACLARACIÓN] | Mercado regional admitido y necesidad de entrega a Bolivia. | Configuración de tiendas, verificación de producto y significado de stock; RF-1, RF-2. |
| [NECESITA ACLARACIÓN] | Fuente, tasa, fecha, redondeo y política histórica de conversión a BOB. | Valoraciones y mínimos; RF-5, RF-6, RF-7. |
| [NECESITA ACLARACIÓN] | Categorías incluidas y significado de talla en cm y equivalencias verificables. | Registro y variante exacta; RF-1, RF-2, RF-7. |
| [NECESITA ACLARACIÓN] | Ratificación de plazos, límites por dominio, recuperación y retraso admisible. | Valores técnicos propuestos y pruebas de calendario; RF-3, RF-4. |
| [NECESITA ACLARACIÓN] | Diferenciar registro pendiente por bloqueo de URL inválida. | Estado provisional y deduplicación; RF-1, RF-4. |
| [NECESITA ACLARACIÓN] | Tratamiento permanente o temporal de productos no encontrados y criterio de descatalogado. | Continuidad del seguimiento y presentación; RF-2, RF-3, RF-4. |
| [NECESITA ACLARACIÓN] | Observaciones con precio válido pero stock desconocido; inclusión de precios sin stock en el mínimo. | Qué se inserta y qué cuenta como mínimo; RF-2, RF-5. |
| [NECESITA ACLARACIÓN] | Antigüedad máxima de una oferta y modalidades como preventa o recogida exclusiva. | Elegibilidad y evidencia de stock; RF-2, RF-6. |
| [NECESITA ACLARACIÓN] | Precios de miembros, promociones condicionadas y significado aceptado de precio original. | Precio comparable y descuento verificable; RF-2, RF-6. |
| [NECESITA ACLARACIÓN] | Presentación de monedas originales frente a BOB en RF-7. | Consistencia entre histórico y etiquetas; RF-5, RF-7. |
| [NECESITA ACLARACIÓN] | Retención del histórico. Hasta resolverla no habrá eliminación automática. | Persistencia; RF-5. |

## 9. Trazabilidad y condición de cierre

| Requisito | Partes principales del diseño | Verificación |
| --- | --- | --- |
| RF-1 | Registro, identidad, contrato y unicidad en el modelo. | Unitarias de URLs y duplicados, contrato, integración y formulario. |
| RF-2 | Adaptadores, normalización, evidencia y observaciones. | Fixtures por variante, errores de interpretación y estados de stock. |
| RF-3 | Trabajos persistidos, calendario, exclusión y dashboard. | Reloj simulado, concurrencia, recuperación y actualización manual. |
| RF-4 | Motor, plazos, política por dominio, intentos y diagnóstico. | Timeouts, captchas, límites, backoff e independencia de tiendas. |
| RF-5 | SQLite, migraciones, observaciones inmutables y consultas históricas. | Transacciones, reinicio, mínimos e integridad ante fallos. |
| RF-6 | Proyección de ofertas y dashboard. | Elegibilidad, orden, desempates, mínimo y tabla vacía. |
| RF-7 | Catálogo de mensajes, formateo y procedencia monetaria y de tallas. | Interfaz en español, etiquetas correctas y ausencia de trazas. |

El diseño mantiene el stack aprobado, el contrato común `fetchProducts()`, la configuración por dominio con backoff y `Retry-After`, las pruebas offline obligatorias con CI, SQLite con migraciones e histórico inmutable y la política de idiomas. Las dudas pendientes deben resolverse en la especificación y reflejarse en el plan y los criterios de aceptación antes de declarar completo el MVP.
