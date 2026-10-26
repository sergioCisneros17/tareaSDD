# Tareas — Price Tracker & Comparator: MVP

Desglose documental basado en la especificación y el SDD. Ninguna tarea está ejecutada por la creación de este documento.

Orden estricto: ejecutar T001 a T085 secuencialmente. Cada tarea depende de la inmediatamente anterior y, de forma transitiva, de todas las anteriores; T001 no tiene dependencias. Las pruebas mencionadas en «Hecho cuando» forman parte del tiempo de la tarea y se limitan a su comportamiento.

Las estimaciones son de trabajo activo, excluyen esperas por respuestas y nunca superan 45 minutos. Las decisiones [NECESITA ACLARACIÓN] requieren una respuesta explícita del responsable de producto; agotar el tiempo no las resuelve. Si una tarea supera su estimación, debe dividirse antes de continuar, conservando dependencias y RF.

La interfaz elegida es web, sin CLI. Las pruebas automáticas usan fixtures y red simulada. La comprobación final de tiendas reales se distingue de los tests offline y no sustituye sus resultados.

## Decisiones previas que bloquean sus dependencias

- [ ] **T001 — Confirmar mercados y entrega a Bolivia.** 30 min · RF-1, RF-2.
  Hecho cuando: el responsable de producto ha confirmado los mercados admitidos de Nike y Adidas y si la entrega a Bolivia condiciona la oferta; la decisión está reflejada en especificación y plan.

- [ ] **T002 — Confirmar categorías y significado de cm.** 30 min · RF-1, RF-2, RF-7.
  Hecho cuando: están acordadas las categorías, la medida representada por cm y las equivalencias admitidas, con un ejemplo válido y otro rechazado en la especificación.

- [ ] **T003 — Acordar conversión e histórico monetario.** 45 min · RF-5, RF-6, RF-7.
  Hecho cuando: se ha decidido si habrá conversión; si la hay, constan fuente, tipo de cambio, referencia temporal, redondeo y tratamiento del mínimo histórico, con ejemplos aceptados y sin decisiones monetarias pendientes.

- [ ] **T004 — Acordar límites y recuperación de consultas.** 45 min · RF-3, RF-4.
  Hecho cuando: los valores propuestos del SDD se han ratificado o sustituido, incluyendo timeout por petición e intento, pausas, concurrencia, reintentos, aplazamientos, recuperación y retraso diario admisible.

- [ ] **T005 — Acordar registro provisional e identidad.** 30 min · RF-1, RF-4.
  Hecho cuando: RF-1 distingue URL inválida de verificación bloqueada y define qué conservar al detectar un duplicado después del registro, sin perder históricos.

- [ ] **T006 — Acordar tratamiento de descatalogados.** 30 min · RF-2, RF-3, RF-4.
  Hecho cuando: la especificación distingue agotado, variante ausente y producto no encontrado, y determina continuidad de consultas y comportamiento ante reaparición.

- [ ] **T007 — Acordar observaciones parciales y stock elegible.** 45 min · RF-2, RF-5, RF-6.
  Hecho cuando: constan las reglas para precio válido con stock desconocido, mínimos con o sin stock, preventa, pedidos pendientes, recogida exclusiva y antigüedad máxima de ofertas, incluida la decisión explícita de no imponerla si corresponde.

- [ ] **T008 — Acordar precios condicionados y presentación monetaria.** 30 min · RF-2, RF-5, RF-6, RF-7.
  Hecho cuando: están definidos precio original aceptable, promociones admitidas y precios para miembros; RF-7 distingue importes publicados y BOB sin etiquetas contradictorias.

- [ ] **T009 — Confirmar retención y zona de presentación.** 30 min · RF-5, RF-7.
  Hecho cuando: retención y zona horaria tienen decisión explícita; si se decide no borrar históricos, queda documentado sin introducir una tarea de purga.

- [ ] **T010 — Sincronizar reglas y ejemplos de aceptación.** 45 min · RF-1, RF-2, RF-3, RF-4, RF-5, RF-6, RF-7.
  Hecho cuando: cada decisión T001–T009 tiene correspondencia en especificación y plan; no quedan contradicciones ni dudas bloqueantes y las tareas siguientes se han ajustado a las decisiones sin añadir alcance implícito.

## Preparación mínima y modelos de datos

- [ ] **T011 — Fijar herramientas y dependencias mínimas.** 30 min · RF-1, RF-2, RF-3, RF-4, RF-5, RF-6, RF-7 — soporte transversal.
  Hecho cuando: están fijados Node.js, TypeScript y acceso SQLite compatibles, y cada dependencia prevista tiene justificación conforme a la constitución; no se incorpora un ORM ni framework adicional sin necesidad documentada.

- [ ] **T012 — Preparar comprobación de tipos y ejecución de tests offline.** 30 min · RF-1, RF-2, RF-3, RF-4, RF-5, RF-6, RF-7 — soporte transversal.
  Hecho cuando: una comprobación de tipos y una prueba mínima se ejecutan localmente, y un intento de acceso externo desde el entorno de tests falla de forma controlada.

- [ ] **T013 — Preparar conexión SQLite y registro de migraciones.** 45 min · RF-5.
  Hecho cuando: una base temporal aplica una migración una sola vez, activa claves foráneas y conserva su estado tras cerrarla y reabrirla.

- [ ] **T014 — Modelar tiendas y mercados.** 30 min · RF-1, RF-2, RF-4.
  Hecho cuando: una migración permite registrar las dos tiendas y sus mercados acordados, y rechaza mercados duplicados para la misma identidad.

- [ ] **T015 — Modelar productos y variantes.** 45 min · RF-1, RF-2.
  Hecho cuando: claves foráneas y unicidad distinguen mercados, colores y tallas; las pruebas rechazan una variante duplicada y permiten dos variantes distintas del mismo producto.

- [ ] **T016 — Modelar seguimientos e identidad provisional.** 45 min · RF-1, RF-3.
  Hecho cuando: el modelo representa selección solicitada, fecha de registro y resolución pendiente o confirmada según T005; la unicidad impide dos seguimientos de la misma variante confirmada.

- [ ] **T017 — Modelar trabajos e intentos.** 45 min · RF-3, RF-4.
  Hecho cuando: se conservan origen, vencimiento, estados, reserva temporal e inicio/fin UTC, y una restricción impide dos trabajos activos para el mismo seguimiento.

- [ ] **T018 — Modelar observaciones inmutables.** 45 min · RF-2, RF-5.
  Hecho cuando: una observación conserva identidad instantánea, importe, moneda, escala, stock y fecha; rechaza precios inválidos y una segunda observación del mismo intento, pero admite precios iguales de intentos distintos.

- [ ] **T019 — Modelar valoraciones y procedencia monetaria.** 45 min · RF-5, RF-6, RF-7.
  Hecho cuando: el modelo distingue precio publicado y valoración BOB y representa exactamente la política T003; si no se autoriza conversión, no incorpora referencias de cambio ficticias.

- [ ] **T020 — Modelar estado de acceso por dominio.** 30 min · RF-3, RF-4.
  Hecho cuando: se persisten el siguiente acceso permitido y los aplazamientos, y dos mercados que comparten dominio no pueden mantener límites independientes incompatibles.

- [ ] **T021 — Verificar integridad y migraciones del modelo completo.** 45 min · RF-1, RF-3, RF-4, RF-5.
  Hecho cuando: una base poblada se migra y reabre sin perder observaciones; un rollback no deja relaciones huérfanas y no existe borrado en cascada de históricos.

## Interfaz base del scraper y normalización

- [ ] **T022 — Definir resultados, errores y evidencia comunes.** 30 min · RF-1, RF-2, RF-4.
  Hecho cuando: los contratos distinguen éxito, resultado parcial, captcha, límite, timeout, fallo de red, página incompatible, producto no encontrado y variante ausente, sin representar desconocidos como cero.

- [x] **T023 — Definir el contrato base del adaptador.** 30 min · RF-1, RF-2, RF-4.
  Hecho cuando: describe, resolveProduct y fetchProducts comparten contexto de red, plazo y cancelación, y un adaptador de prueba satisface el contrato sin dependencias de dashboard o persistencia.
  Evidencia: contrato en `src/scraping/base-scraper.mts`, adaptador ficticio y fixtures HTML locales; `node --test tests/scraping/base-scraper.test.mjs`: 7 pruebas aprobadas, 0 fallos. Comprobación estricta de tipos aprobada, incluyendo rechazo de adaptadores incompletos y llamadas sin selección o contexto.
  Alcance autorizado: T023 ejecutada aisladamente por solicitud expresa del usuario. Las predecesoras permanecen pendientes; los tipos mínimos de soporte no completan T022 ni implementan validación de datos. No se inicia T024.
  Reproducir tipos: `tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --lib ES2022,DOM src/scraping/base-scraper.mts tests/helpers/fixture-scraper.mts tests/scraping/base-scraper.types.mts`.

- [ ] **T024 — Preparar transporte simulado y reloj controlado.** 45 min · RF-2, RF-3, RF-4.
  Hecho cuando: los tests pueden reproducir respuestas, demoras, errores y cancelación sin red real ni esperas de tiempo real.

- [ ] **T025 — Crear la suite reutilizable de contrato.** 45 min · RF-1, RF-2, RF-4.
  Hecho cuando: la suite detecta resultados sin identidad, omisiones por solicitud, incumplimiento de cancelación y accesos fuera del transporte; no depende de selectores de Nike o Adidas.

- [ ] **T026 — Normalizar importes y moneda publicada.** 45 min · RF-2, RF-7.
  Hecho cuando: pruebas unitarias verifican precisión exacta, separadores acordados, monedas explícitas y rechazo de cero, negativos, textos ambiguos o moneda ausente.

- [ ] **T027 — Validar precio original y condiciones comerciales.** 30 min · RF-2, RF-6.
  Hecho cuando: los ejemplos de T008 distinguen original válido, ausente o incoherente y precios condicionados no admitidos, sin descuentos inventados.

- [ ] **T028 — Normalizar identidad y talla exacta.** 45 min · RF-1, RF-2, RF-7.
  Hecho cuando: los ejemplos de T002 conservan medida publicada y procedencia de cm y rechazan equivalencias no verificables sin sustituir color o talla.

- [ ] **T029 — Clasificar evidencia de stock y resultados parciales.** 45 min · RF-2, RF-5, RF-6.
  Hecho cuando: las pruebas aplican T006–T007; un botón genérico o una talla seleccionable no confirma stock y la evidencia contradictoria queda desconocida.

- [ ] **T030 — Validar el resultado normalizado completo.** 30 min · RF-2, RF-4, RF-5.
  Hecho cuando: una prueba acepta una observación completa y rechaza datos de otra variante, identidad incompatible y parciales no admitidos por T007.

## Transporte y control del motor de scraping

- [ ] **T031 — Implementar obtención HTTP cancelable.** 45 min · RF-2, RF-4.
  Hecho cuando: respuestas y errores simulados conservan URL efectiva y estado HTTP, y timeout o cancelación liberan el recurso sin resultado tardío aceptado.

- [ ] **T032 — Implementar obtención dinámica controlada.** 45 min · RF-2, RF-4.
  Hecho cuando: Playwright obtiene una variante en una página dinámica local, cierra sus recursos al cancelar y todas sus solicitudes pasan por los controles de dominio y red previstos.

- [ ] **T033 — Controlar el plazo total del intento.** 30 min · RF-3, RF-4.
  Hecho cuando: HTTP, renderizado y extracción no mantienen el intento activo más allá del plazo acordado, y el timeout se devuelve como fallo tipificado.

- [ ] **T034 — Aplicar concurrencia y pausas por dominio.** 45 min · RF-3, RF-4.
  Hecho cuando: con reloj simulado se respetan T004 y la pausa entre accesos; un dominio esperando no impide ejecutar otro permitido.

- [ ] **T035 — Aplicar backoff y límite de reintentos.** 45 min · RF-4.
  Hecho cuando: fallos transitorios usan las esperas y máximo acordados; captcha, HTML incompatible y datos inválidos no generan reintentos automáticos del mismo trabajo.

- [ ] **T036 — Aplicar Retry-After y aplazamientos persistidos.** 45 min · RF-3, RF-4.
  Hecho cuando: pruebas cubren segundos, fecha y encabezado ausente, y una consulta manual no elude el aplazamiento incluso tras reabrir la base.

## Scraper de marca A: Nike

- [ ] **T037 — Preparar fixtures Nike de éxito y variantes.** 45 min · RF-1, RF-2.
  Hecho cuando: hay HTML local con y sin descuento, colores/tallas con precios distintos y resultados esperados revisados, con mercado y variante documentados y sin credenciales.

- [ ] **T038 — Preparar fixtures Nike de fallos y falsos positivos.** 45 min · RF-2, RF-4.
  Hecho cuando: existen casos de HTML alterado, captcha con HTTP 200, no encontrado, variante ausente, stock contradictorio y moneda ambigua, cada uno con expectativa independiente del parser.

- [ ] **T039 — Resolver identidad y selección en Nike.** 45 min · RF-1, RF-2.
  Hecho cuando: describe y resolveProduct superan los casos locales de mercado, URLs equivalentes y variante exacta sin sustituir una selección ausente.

- [ ] **T040 — Extraer precios Nike y normalizarlos.** 45 min · RF-2.
  Hecho cuando: fetchProducts devuelve los precios de la combinación solicitada en fixtures con y sin descuento y rechaza el precio de otra variante.

- [ ] **T041 — Extraer disponibilidad y clasificar fallos Nike.** 45 min · RF-2, RF-4.
  Hecho cuando: los fixtures de stock y fallo producen estados comunes correctos y ningún HTML incompatible o bloqueo genera una oferta válida.

- [ ] **T042 — Verificar Nike con el contrato y su modo de obtención.** 45 min · RF-1, RF-2, RF-4.
  Hecho cuando: pasa la suite común y, si su mercado necesita JavaScript, un fixture dinámico local verifica la selección; el adaptador utiliza el modo HTTP cuando es suficiente y nunca cambia a navegador para evadir bloqueos.

## Scraper de marca B: Adidas

- [ ] **T043 — Preparar fixtures Adidas de éxito y variantes.** 45 min · RF-1, RF-2.
  Hecho cuando: hay HTML local con y sin descuento y precios diferentes por variante, con mercado, selección y expectativas revisadas sin derivarlas del parser.

- [ ] **T044 — Preparar fixtures Adidas de fallos y falsos positivos.** 45 min · RF-2, RF-4.
  Hecho cuando: existen los mismos tipos de fallo de T038 con ejemplos propios de Adidas, sin cookies ni llamadas externas.

- [ ] **T045 — Resolver identidad y selección en Adidas.** 45 min · RF-1, RF-2.
  Hecho cuando: describe y resolveProduct distinguen mercado, URLs equivalentes y variante exacta, y una variante inexistente no se sustituye.

- [ ] **T046 — Extraer precios Adidas y normalizarlos.** 45 min · RF-2.
  Hecho cuando: fetchProducts verifica precios actual y original de la combinación exacta con el normalizador común y no toma precios de otras variantes.

- [ ] **T047 — Extraer disponibilidad y clasificar fallos Adidas.** 45 min · RF-2, RF-4.
  Hecho cuando: agotados, desconocidos, ausentes, bloqueos y páginas alteradas tienen resultados comunes y no producen ofertas falsas.

- [ ] **T048 — Verificar Adidas y el registro extensible de adaptadores.** 45 min · RF-1, RF-2, RF-4.
  Hecho cuando: Adidas pasa la suite común y su modo HTTP o dinámico se verifica localmente; ambas marcas se seleccionan por configuración sin condicionales particulares en el algoritmo del motor.

## Registro, ejecución persistente y actualización diaria

- [ ] **T049 — Registrar un seguimiento y su consulta inicial atómicamente.** 45 min · RF-1, RF-3.
  Hecho cuando: una entrada válida crea seguimiento y trabajo juntos; falta de datos o fallo transaccional no deja un registro incompleto fuera de los estados permitidos por T005.

- [ ] **T050 — Resolver duplicados provisionales y confirmados.** 45 min · RF-1, RF-5.
  Hecho cuando: URLs equivalentes y una resolución tardía devuelven el seguimiento existente sin duplicar variante ni perder intentos u observaciones; otra variante sigue siendo independiente.

- [ ] **T051 — Reclamar trabajos con reserva temporal.** 45 min · RF-3, RF-4.
  Hecho cuando: dos reclamaciones concurrentes del mismo seguimiento producen un único ejecutor y ninguna escritura de una reserva vencida es admitida.

- [ ] **T052 — Ejecutar un trabajo mediante el adaptador registrado.** 45 min · RF-2, RF-3, RF-4.
  Hecho cuando: un trabajo simulado consulta la variante y registra el inicio y resultado del intento respetando plazo y permisos de dominio; una tienda fallida no impide ejecutar otra.

- [ ] **T053 — Confirmar intentos y observaciones en una transacción.** 45 min · RF-2, RF-4, RF-5.
  Hecho cuando: éxito válido añade una observación; fallo conserva el histórico; repetir la confirmación del mismo intento no duplica datos y dos intentos iguales conservan dos observaciones.

- [ ] **T054 — Programar vencimientos diarios anclados al registro.** 45 min · RF-3.
  Hecho cuando: el reloj simulado demuestra consultas a intervalos de 24 horas desde el registro, conforme al margen de T004, sin acumular trabajos activos duplicados.

- [ ] **T055 — Solicitar actualización manual sin cambiar el calendario.** 30 min · RF-3, RF-4.
  Hecho cuando: una solicitud crea o reutiliza el trabajo pendiente, respeta aplazamientos y deja intacto el siguiente vencimiento diario anclado.

- [ ] **T056 — Recuperar consultas después de una interrupción.** 45 min · RF-3, RF-4, RF-5.
  Hecho cuando: una prueba de reinicio aplica la política T004 a trabajos vencidos y reservas caducadas sin inventar observaciones pasadas ni aceptar resultados de ejecutores antiguos.

- [ ] **T057 — Consultar separadamente último intento y último dato válido.** 30 min · RF-4, RF-5.
  Hecho cuando: éxito seguido de fallo conserva precio, stock y fecha anteriores mientras expone el fallo posterior; un bloqueo inicial devuelve ausencia de observaciones.

- [ ] **T058 — Emitir diagnóstico técnico y alerta de HTML incompatible.** 30 min · RF-4, RF-7.
  Hecho cuando: los eventos técnicos están en inglés, el estado permite mostrar una alerta al usuario y ninguna respuesta pública contiene trazas internas.

## Valoración monetaria y motor de comparación

- [ ] **T059 — Resolver la referencia monetaria acordada.** 45 min · RF-5, RF-6.
  Hecho cuando: si T003 requiere proveedor, su cliente obtiene referencias verificables con transporte simulado y detecta respuestas inválidas o ausentes; si no requiere proveedor, el caso BOB directo pasa sin dependencias de divisas.

- [ ] **T060 — Calcular y conservar valoraciones BOB exactas.** 45 min · RF-5, RF-6, RF-7.
  Hecho cuando: los ejemplos de T003 verifican redondeo, procedencia y valoración de precio actual y original; sin referencia válida, el precio extranjero permanece no comparable y la observación original no cambia.

- [ ] **T061 — Consultar el histórico por variante.** 30 min · RF-5.
  Hecho cuando: se devuelven precios, monedas, stock y fechas de esa variante en orden temporal sin mezclar mercados ni observaciones de otras tallas.

- [ ] **T062 — Calcular mínimo histórico y fecha.** 45 min · RF-5, RF-6.
  Hecho cuando: los casos de T003 y T007 verifican moneda comparable e inclusión de stock acordada; sin datos elegibles el resultado es ausente, nunca cero.

- [ ] **T063 — Determinar elegibilidad de ofertas.** 45 min · RF-4, RF-6.
  Hecho cuando: solo pasan los casos admitidos de stock, vigencia, precio BOB y estado de consulta; un fallo posterior excluye la variante sin borrar su último precio.

- [ ] **T064 — Ordenar y proyectar la tabla comparativa.** 30 min · RF-6.
  Hecho cuando: una prueba verifica precio ascendente y todos los desempates del SDD; cada fila incluye variante, precios, mínimo, fecha y enlace, y cero elegibles produce una colección vacía.

## Servicio HTTP e interfaz web

- [ ] **T065 — Preparar el servicio HTTP y servir la página local.** 30 min · RF-1, RF-7 — soporte de interfaz.
  Hecho cuando: la página carga desde la aplicación, las entradas tienen un tamaño máximo y los fallos HTTP se traducen a respuestas controladas sin trazas.

- [ ] **T066 — Exponer el registro y actualización manual.** 45 min · RF-1, RF-3, RF-4.
  Hecho cuando: pruebas HTTP locales verifican entrada válida, inválida, duplicada y actualización ya pendiente, usando los servicios existentes sin duplicar su lógica.

- [ ] **T067 — Exponer seguimientos, ofertas e histórico.** 45 min · RF-4, RF-5, RF-6.
  Hecho cuando: pruebas HTTP verifican las proyecciones ya implementadas y el caso de seguimiento inexistente, y estas lecturas no lanzan consultas a las tiendas.

- [ ] **T068 — Centralizar textos y formatos visibles.** 30 min · RF-7.
  Hecho cuando: los mensajes están en español y los tests verifican BOB, monedas originales diferenciadas, cm y fechas con la zona acordada en T009.

- [ ] **T069 — Construir el formulario de registro.** 45 min · RF-1, RF-7.
  Hecho cuando: desde la página se envían URL, color y talla, se identifican campos inválidos y se distingue registro creado, pendiente y duplicado conforme a T005.

- [ ] **T070 — Construir la lista de seguimientos y estados.** 45 min · RF-2, RF-4, RF-7.
  Hecho cuando: se ven disponibles, agotados, ausentes, bloqueados y no comparables, diferenciando fecha del último intento y fecha del último dato válido.

- [ ] **T071 — Incorporar la acción de actualización manual.** 30 min · RF-3, RF-4, RF-7.
  Hecho cuando: la acción muestra pendiente o en curso y comunica aplazamientos; pulsaciones repetidas no crean consultas simultáneas.

- [ ] **T072 — Construir la tabla de ofertas.** 45 min · RF-6, RF-7.
  Hecho cuando: la tabla presenta el orden y todos los campos de RF-6, y un estado vacío explica la ausencia de ofertas conservando acceso a los seguimientos.

- [ ] **T073 — Construir la vista del histórico.** 45 min · RF-5, RF-7.
  Hecho cuando: el usuario abre el histórico de una variante, ve precios y fechas con sus monedas y distingue mínimo ausente de un valor real.

- [ ] **T074 — Actualizar estados sin depender de la página abierta.** 30 min · RF-3, RF-4, RF-5.
  Hecho cuando: al cerrar y reabrir la página reaparecen datos persistidos; con el servicio activo y la página cerrada, un avance controlado de reloj ejecuta una consulta diaria.

## Pruebas de aceptación, CI y cierre

- [ ] **T075 — Preparar el entorno de navegador completamente local.** 30 min · RF-1, RF-2, RF-3, RF-4, RF-5, RF-6, RF-7 — soporte de aceptación.
  Hecho cuando: Playwright usa aplicación, base y fixtures locales y rechaza toda salida a Nike, Adidas o proveedores externos, incluyendo solicitudes de recursos secundarios.

- [ ] **T076 — Verificar el recorrido de registro de ambas marcas.** 45 min · RF-1, RF-2, RF-7.
  Hecho cuando: una prueba de interfaz registra Nike y Adidas, selecciona variantes exactas y comprueba precios con y sin descuento, duplicados y mensajes españoles.

- [ ] **T077 — Verificar actualización, bloqueo y recuperación visibles.** 45 min · RF-3, RF-4.
  Hecho cuando: una prueba local comprueba consulta manual, espera por límite, timeout y bloqueo con dato anterior conservado, seguida de una consulta válida que recupera el estado.

- [ ] **T078 — Verificar histórico, ofertas y reapertura.** 45 min · RF-5, RF-6, RF-7.
  Hecho cuando: una prueba local confirma mínimo y fecha, orden y exclusiones, tabla vacía y persistencia tras reapertura, con etiquetas monetarias correctas.

- [ ] **T079 — Incorporar tipos y pruebas unitarias a CI.** 30 min · RF-1, RF-2, RF-3, RF-4, RF-5, RF-6, RF-7 — verificación transversal.
  Hecho cuando: CI ejecuta comprobación de tipos y pruebas unitarias, incluidos normalización y errores, y un fallo deja el control obligatorio sin aprobar.

- [ ] **T080 — Incorporar contratos, integración e interfaz a CI.** 45 min · RF-1, RF-2, RF-3, RF-4, RF-5, RF-6, RF-7 — verificación transversal.
  Hecho cuando: CI ejecuta las suites de ambas tiendas, SQLite y navegador con fixtures locales; los controles obligatorios impiden integrar ante fallos y las pruebas no realizan llamadas externas.

- [ ] **T081 — Comprobar extensibilidad con un adaptador de prueba.** 30 min · RF-1, RF-2, RF-4.
  Hecho cuando: un adaptador ficticio supera la suite común y se registra sin modificar el algoritmo del motor ni el dashboard; no se añade una tercera tienda al alcance del MVP.

- [ ] **T082 — Contrastar Nike con el mercado acordado.** 45 min · RF-1, RF-2, RF-4.
  Hecho cuando: una comprobación manual acotada compara identidad, variante, moneda, precio y stock con una página real, registrando fecha y evidencia; si hay bloqueo o discrepancia, la tarea permanece pendiente y no se evade el bloqueo.

- [ ] **T083 — Contrastar Adidas con el mercado acordado.** 45 min · RF-1, RF-2, RF-4.
  Hecho cuando: se obtiene la misma evidencia manual que en T082 para Adidas; un resultado bloqueado o incompatible no se declara validado ni convierte la suite offline en dependiente de la tienda real.

- [ ] **T084 — Auditar correspondencia entre criterios y evidencia.** 45 min · RF-1, RF-2, RF-3, RF-4, RF-5, RF-6, RF-7.
  Hecho cuando: cada criterio de aceptación de la especificación tiene prueba o evidencia identificada, pasan los controles de CI y no quedan escenarios omitidos ni requisitos pendientes declarados cumplidos.

- [ ] **T085 — Verificar finalización y conformidad constitucional.** 30 min · RF-1, RF-2, RF-3, RF-4, RF-5, RF-6, RF-7.
  Hecho cuando: los criterios de finalización se cumplen, no quedan decisiones bloqueantes, se conserva la evidencia de T084 y una revisión confirma los seis principios de la constitución, sin dar por ejecutadas tareas pendientes.

Las correcciones que aparezcan durante la ejecución o la validación se registrarán como nuevas tareas de hasta 45 minutos antes de continuar con sus dependientes. La espera externa y los fallos de una tienda no se ocultan modificando las estimaciones ni marcando un criterio como satisfecho.
