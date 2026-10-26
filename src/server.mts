import { resolve } from 'node:path';
import { createApp } from './web/http.mts';

const demo = process.argv.includes('--demo');
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535');
const database = resolve(process.env.DB_PATH || `data/${demo ? 'demo' : 'tracker'}.sqlite`);
const app = createApp({ database, demo });
app.server.on('error', error => { console.error(JSON.stringify({ event: 'server_error', error: String(error) })); void app.close().then(() => { process.exitCode = 1; }); });
app.server.listen(port, '127.0.0.1', () => {
  console.info(`Price Tracker: http://localhost:${port} (${demo ? 'demo' : 'live'})`);
  console.info(`Database: ${database}`);
});
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  if (stopping) return; stopping = true;
  void app.close().then(() => process.exit(0));
});
