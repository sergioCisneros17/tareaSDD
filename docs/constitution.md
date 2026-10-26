# Constitución del proyecto
1. **Stack mínimo:** Node.js + TypeScript; Playwright solo para páginas dinámicas. Toda dependencia adicional debe justificarse en el PR.
2. **Scrapers intercambiables:** cada tienda implementa `fetchProducts()` y devuelve un esquema común validado; añadir una tienda no modifica el núcleo.
3. **Fallos y límites:** un fallo no detiene otras tiendas; HTML incompatible genera una alerta y nunca precios inventados. Cada dominio configura concurrencia y pausas; los reintentos son limitados, con backoff y respeto a `Retry-After`.
4. **Tests obligatorios:** cada scraper tiene fixtures de HTML válido y alterado; normalización y errores tienen tests unitarios. CI debe pasar antes de integrar cambios.
5. **Histórico persistente:** SQLite con migraciones; cada observación válida conserva producto, tienda, variante, precio, moneda y fecha UTC. Las observaciones anteriores nunca se sobrescriben.
6. **Idioma consistente:** código, comentarios y logs técnicos en inglés; documentación y mensajes al usuario en español, sin exponer trazas internas.
