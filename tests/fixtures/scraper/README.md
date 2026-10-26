# Fixtures del contrato base

HTML sintético construido para T023; no procede de Nike ni Adidas. Representa una tienda y un mercado ficticios con BOB y una talla explícita de 27 cm; no establece mercados ni conversiones del MVP.

`product.html` representa la variante negra de 27 cm, disponible, con precio actual 620,00 BOB y original 800,00 BOB. `changed.html` carece de información verificable y debe producir un fallo sin precio.

El adaptador de prueba reconoce exclusivamente el marcador controlado de estos fixtures. No es un parser HTML de producción ni un scraper de marca. Los resultados esperados de los tests se escriben independientemente de su lectura.
