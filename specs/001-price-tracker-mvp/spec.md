# Especificación: seguimiento y comparación de precios — MVP

## Contexto y objetivo

Una persona desea seguir productos de Nike y Adidas para encontrar el menor precio actual de una combinación exacta de color y talla que tenga stock. El seguimiento comienza con una URL y conserva las observaciones obtenidas para comparar el precio actual con el mínimo histórico registrado.

La experiencia será una página web de uso personal, sin cuentas, con un formulario de registro y una tabla comparativa. Los precios comparables se expresarán en bolivianos (BOB) y las tallas en centímetros (cm). Se tomará el precio publicado del producto, sin sumar envío ni aplicar cupones personales.

El precio actual representa la última observación válida; su fecha permite evaluar su antigüedad. Un fallo posterior no confirma que ese precio ni ese stock sigan vigentes.

## Usuarios

- Persona que registra productos, selecciona un color y una talla en cm, solicita actualizaciones y consulta ofertas e históricos de su colección personal.
- No existen perfiles, cuentas ni colecciones privadas por usuario en el MVP.

## Historias de usuario

- Como comprador, quiero registrar una URL con un color y una talla para seguir únicamente la variante que puedo comprar.
- Como comprador, quiero consultar precio actual, precio original y stock para reconocer una oferta válida para mi variante.
- Como comprador, quiero actualizaciones diarias y manuales para evitar revisar cada tienda por separado.
- Como comprador, quiero ordenar los productos disponibles por precio actual en BOB y consultar su mínimo histórico para valorar cada oferta.
- Como comprador, quiero identificar consultas fallidas y la antigüedad de los datos para no confundir información conservada con una disponibilidad confirmada.

## Requisitos funcionales y criterios de aceptación

Los criterios usan notación EARS en español: CUANDO expresa un evento, MIENTRAS un estado y SI una condición excepcional; el comportamiento exigido se introduce con «el sistema deberá».

### RF-1. Registrar productos y variantes

- CUANDO el usuario registre una URL de producto de Nike o Adidas con un color y una talla en cm, el sistema deberá crear un seguimiento de esa combinación exacta e iniciar su primera consulta.
- SI la URL no pertenece a una tienda admitida, no identifica un producto o falta el color o la talla, el sistema deberá indicar el motivo y no crear un seguimiento incompleto.
- CUANDO se registre de nuevo el mismo producto, tienda, mercado, color y talla, el sistema deberá señalar el seguimiento existente sin duplicarlo ni borrar su histórico.
- CUANDO se registre otra variante del mismo producto, el sistema deberá tratarla como un seguimiento independiente.

### RF-2. Obtener precio y disponibilidad

- CUANDO una consulta obtenga información válida, el sistema deberá registrar el producto, tienda, mercado, URL, color, talla, precio actual, moneda publicada, fecha y hora de observación, y stock de la variante seleccionada.
- CUANDO la tienda publique un precio original válido superior al precio actual para esa misma variante, el sistema deberá conservarlo y mostrar ambos precios.
- SI no existe un precio original válido, el sistema deberá mostrarlo como no disponible sin inventar un descuento.
- SI el precio o el stock no puede atribuirse a la combinación exacta seleccionada, el sistema deberá marcar el dato como desconocido e impedir que se presente como una oferta confirmada.
- SI la variante seleccionada deja de existir, el sistema deberá informar que no está disponible sin sustituirla por otro color o talla.

### RF-3. Actualizar el seguimiento

- MIENTRAS un seguimiento permanezca registrado, el sistema deberá programar una consulta cada 24 horas a partir de su registro.
- CUANDO el usuario solicite una actualización manual de un seguimiento, el sistema deberá iniciar su consulta respetando las pausas aplicables e indicar si está pendiente o en curso.
- CUANDO se realice una actualización manual, el sistema deberá mantener la programación diaria existente.
- SI ya existe una consulta pendiente o en curso para el mismo seguimiento, el sistema deberá informar de ese estado sin iniciar otra consulta simultánea.

### RF-4. Manejar fallos, bloqueos y límites

- SI una consulta encuentra un captcha o bloqueo, el sistema deberá informar del problema, conservar el último resultado válido con su fecha y volver a intentar en la siguiente consulta diaria o manual.
- SI una consulta falla por conexión, información incompleta o cambios en la página, el sistema deberá identificar el fallo y conservar las observaciones válidas anteriores sin crear precios ficticios.
- SI una tienda comunica un límite de consultas o un tiempo de espera, el sistema deberá respetarlo, limitar los reintentos e informar de que la consulta queda aplazada.
- CUANDO falle un seguimiento, el sistema deberá permitir que continúen los demás seguimientos.
- MIENTRAS el último intento haya fallado, el sistema deberá diferenciar su estado y fecha del estado y fecha de la última observación válida.

### RF-5. Conservar y consultar el histórico

- CUANDO se complete una observación válida, el sistema deberá añadirla al histórico sin sobrescribir observaciones anteriores, incluso si el precio no cambió.
- CUANDO el usuario consulte el histórico de un seguimiento, el sistema deberá mostrar sus precios, monedas, disponibilidad y fechas registradas.
- CUANDO se muestre el mínimo histórico, el sistema deberá calcularlo sobre los precios válidos y comparables registrados para la misma variante e indicar la fecha de ese mínimo.
- SI no existen observaciones válidas comparables, el sistema deberá mostrar que el mínimo histórico no está disponible.
- CUANDO el usuario vuelva a abrir la página después de cerrar la sesión de uso, el sistema deberá conservar los seguimientos y su histórico.

### RF-6. Comparar ofertas

- CUANDO el usuario consulte la tabla comparativa, el sistema deberá ordenar de menor a mayor precio actual en BOB las variantes cuya última consulta válida confirme stock y cuyo último intento no haya fallado.
- CUANDO se muestre una oferta, el sistema deberá incluir producto, tienda, color, talla en cm, precio actual en BOB, precio original cuando exista, mínimo histórico comparable, fecha de observación y enlace al producto.
- SI una variante no tiene stock, su stock es desconocido, su consulta ha fallado o su precio no puede expresarse de forma válida en BOB, el sistema deberá excluirla de la clasificación de ofertas y mantener visible su estado en la lista de seguimientos.
- SI varias ofertas tienen el mismo precio actual, el sistema deberá mostrar primero la observación más reciente y, si persiste el empate, ordenar por tienda y nombre del producto.
- SI no existen ofertas elegibles, el sistema deberá mostrar una tabla vacía con una explicación, conservando el acceso a los seguimientos y sus estados.

### RF-7. Presentar información comprensible

- CUANDO el sistema muestre formularios, resultados o errores al usuario, el sistema deberá usar español y evitar exponer trazas internas.
- CUANDO se muestren importes, tallas y fechas, el sistema deberá identificar explícitamente BOB, cm y la zona horaria de las fechas presentadas.
- SI la tienda no permite determinar una talla en cm o un precio comparable en BOB, el sistema deberá comunicar la limitación sin suponer equivalencias o conversiones.

## Requisitos no funcionales

- Integridad: ninguna consulta fallida deberá sobrescribir una observación válida ni modificar el mínimo histórico con datos inválidos.
- Tolerancia a fallos: los cambios en las páginas deberán producir un estado visible cuando impidan obtener datos fiables; no deberán generar ofertas falsas ni detener otras tiendas.
- Respeto de límites: las consultas simultáneas, pausas y reintentos deberán tener límites por tienda. Los valores concretos quedan pendientes de definición.
- Trazabilidad temporal: las observaciones deberán conservar su instante en UTC; la presentación deberá identificar la zona horaria utilizada.
- Extensibilidad: incorporar otras tiendas en el futuro deberá conservar el significado de variante, observación y oferta, y no alterar los históricos existentes.
- Verificación: cada tienda deberá contar con pruebas de páginas válidas y alteradas; también deberán verificarse normalización de datos, errores y criterios de aceptación antes de integrar cambios.
- Idioma: documentación y mensajes al usuario en español; identificadores, comentarios y registros técnicos en inglés, según la constitución.

## Casos límite

- Producto eliminado, URL redirigida o variante agotada: comunicar su estado y conservar el histórico, sin reemplazar el producto silenciosamente.
- Precio diferente por talla o color: aceptar únicamente el precio atribuible a la combinación seleccionada.
- Ausencia o ambigüedad del precio original: mostrar únicamente el precio actual verificable.
- Stock condicionado por ubicación, sesión o información contradictoria: marcarlo como desconocido hasta poder determinarlo para el mercado elegido.
- Primer intento bloqueado: mostrar el seguimiento sin precio ni mínimo histórico; indicar que aún no hay observaciones válidas.
- Fallo después de una consulta válida: conservar los datos anteriores con su fecha, señalar el fallo y excluirlos de las mejores ofertas hasta una nueva consulta válida.
- Moneda extranjera, talla sin equivalencia en cm o mercado incompatible: conservar la información verificable e impedir comparaciones basadas en supuestos.
- Precio cero, negativo, ilegible o moneda ausente: tratar el precio como inválido y no incorporarlo al histórico de precios válidos.
- Disponibilidad distinta al abrir la tienda: la tabla representa lo observado en su fecha y no garantiza stock ni precio al comprar.

## Fuera de alcance

- Tiendas distintas de Nike y Adidas en esta primera funcionalidad.
- Cuentas, autenticación y gestión de múltiples usuarios.
- Compra automática, reservas, pagos y garantías de disponibilidad.
- Resolución automática de captchas o evasión de bloqueos.
- Seguimiento automático de todos los colores o tallas de un producto.
- Equivalencias automáticas entre productos de marcas distintas.
- Gastos de envío, cupones personales y cálculo del coste final de compra.
- Alertas externas por correo, mensajería o notificaciones móviles.
- Precios anteriores al inicio del seguimiento y clasificación por ofertas históricas ya vencidas.

## Criterios de finalización

- Se pueden registrar productos de ambas tiendas con una variante exacta y obtener precio y stock verificables para el mercado acordado.
- Funcionan la consulta inicial, las consultas cada 24 horas y la actualización manual sin duplicar consultas simultáneas.
- La tabla clasifica únicamente ofertas elegibles por precio actual en BOB y muestra su mínimo histórico y fecha de observación.
- El histórico persiste entre sesiones de uso y conserva las observaciones previas ante fallos.
- Se verifican los escenarios de cambios en páginas, bloqueo, límites de consultas, falta de stock y variantes ambiguas sin producir datos ficticios.
- Los criterios de aceptación están verificados y las pruebas exigidas por la constitución pasan antes de integrar cambios.
- Las dudas que condicionan precios en BOB, tallas en cm, alcance de productos y límites de consulta están resueltas y reflejadas en los requisitos antes de declarar completo el MVP.

## Dudas abiertas

- [NECESITA ACLARACIÓN] ¿Qué mercado o país de Nike y Adidas se admitirá? La preferencia por BOB y cm no determina qué tiendas regionales se consultarán ni si deben ofrecer entrega a Bolivia.
- [NECESITA ACLARACIÓN] Si el precio publicado no está en BOB, ¿qué fuente y tipo de cambio se usarán, cuándo se actualizarán y cómo se conservará la referencia de conversión? ¿El mínimo histórico usará el tipo de cambio de cada observación o una conversión común al consultar?
- [NECESITA ACLARACIÓN] ¿El MVP incluye solo calzado o también ropa y accesorios? Para artículos sin talla en cm, ¿qué medidas y equivalencias verificables se admitirán?
- [NECESITA ACLARACIÓN] ¿Qué límites de consultas simultáneas, pausas y reintentos se fijarán para cada tienda, y qué margen de retraso se admite respecto al intervalo de 24 horas?
- [NECESITA ACLARACIÓN] ¿Durante cuánto tiempo se conserva el histórico? Hasta que se defina, esta especificación no autoriza su eliminación automática.
