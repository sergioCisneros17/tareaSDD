import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { TrackerService } from '../app/service.mts';
import { AppError, json } from '../domain/normalization.mts';

const messages: Record<string, string> = {
  invalid_url: 'Introduce una URL HTTPS válida, sin credenciales ni puertos especiales.',
  unsupported_store: 'Solo se admiten URLs regionales de Nike y Adidas.',
  invalid_product: 'La URL debe identificar una página de producto de Nike o Adidas.',
  missing_selection: 'Indica un color y una talla de calzado entre 10 y 40 cm.',
  invalid_input: 'Revisa los datos enviados.', not_found: 'No se encontró el seguimiento.',
  invalid_json: 'El formulario contiene datos no válidos.', body_too_large: 'La solicitud es demasiado grande.',
  forbidden: 'La solicitud debe proceder de esta aplicación.', invalid_scenario: 'El escenario solo está disponible en demostración.',
  demo_only: 'Esta acción solo está disponible en demostración.', internal_error: 'No se pudo completar la operación. Inténtalo de nuevo.',
};
async function body(request: IncomingMessage) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new AppError('invalid_json');
  let data = ''; let bytes = 0;
  for await (const chunk of request) {
    bytes += Buffer.byteLength(chunk); if (bytes > 16384) throw new AppError('body_too_large', 413);
    data += chunk;
  }
  try { return JSON.parse(data || '{}'); } catch { throw new AppError('invalid_json'); }
}
function send(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(json(data));
}

export function createApp(options: { database: string; demo?: boolean; background?: boolean }) {
  const service = new TrackerService(options);
  const kick = () => { void service.drain().catch(error => console.error(JSON.stringify({ event: 'scheduler_error', error: String(error) }))); };
  const server = createServer(async (request, response) => {
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      if (!request.headers.host || !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(request.headers.host)) throw new AppError('forbidden', 403);
      const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
      if (request.method === 'POST' && request.headers.origin && request.headers.origin !== url.origin) throw new AppError('forbidden', 403);
      const staticFiles: Record<string, [string, string]> = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
      if (request.method === 'GET' && staticFiles[url.pathname]) {
        const [file, type] = staticFiles[url.pathname];
        response.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-cache' });
        response.end(await readFile(new URL(`../../public/${file}`, import.meta.url))); return;
      }
      if (request.method === 'GET' && url.pathname === '/api/state') {
        const exchange = JSON.parse(String(service.store.db.prepare("SELECT value FROM settings WHERE key='usd_rate'").get()!.value));
        send(response, 200, { demo: service.demo, tracking: service.list(), offers: service.offers(), exchange, timezone: 'America/La_Paz' }); return;
      }
      if (request.method === 'POST' && url.pathname === '/api/tracking') {
        const result = service.register(await body(request));
        send(response, result.duplicate ? 200 : 201, result); kick(); return;
      }
      if (request.method === 'POST' && url.pathname === '/api/demo/seed') {
        await body(request); const results = service.seedDemo(); send(response, 200, results); kick(); return;
      }
      const match = url.pathname.match(/^\/api\/tracking\/(\d+)\/(history|refresh|scenario)$/);
      if (match) {
        const id = Number(match[1]);
        if (match[2] === 'history' && request.method === 'GET') { send(response, 200, { history: service.history(id), minimum: service.minimum(id) }); return; }
        if (match[2] === 'refresh' && request.method === 'POST') { await body(request); service.refresh(id); send(response, 202, { message: 'Consulta solicitada.' }); kick(); return; }
        if (match[2] === 'scenario' && request.method === 'POST') {
          const data = await body(request); service.setDemoScenario(id, data.scenario); service.refresh(id); send(response, 202, { message: 'Escenario aplicado.' }); kick(); return;
        }
      }
      send(response, 404, { message: 'No se encontró la página solicitada.' });
    } catch (error) {
      const code = error instanceof AppError ? error.code : 'internal_error';
      if (!(error instanceof AppError)) console.error(JSON.stringify({ event: 'request_error', error: String(error) }));
      if (!response.headersSent) send(response, error instanceof AppError ? error.status : 500, { code, message: messages[code] ?? messages.internal_error });
      else response.end();
    }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  const timer = options.background === false ? null : setInterval(kick, 1000);
  timer?.unref();
  if (options.background !== false) kick();
  return { server, service, async close() {
    if (timer) clearInterval(timer);
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await service.close();
  } };
}
