// Startpunt: leest de configuratie uit de omgeving en start de HTTP-server.
import {createServer} from 'node:http';
import {join} from 'node:path';
import {createApp} from './app.js';
import {createStore} from './store.js';

const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || '/data';
const TOKEN_HASH = String(process.env.VOORSTEL_TOKEN_HASH || '').trim().toLowerCase();

if (!/^[0-9a-f]{64}$/.test(TOKEN_HASH)) {
  console.error('VOORSTEL_TOKEN_HASH ontbreekt of is geen SHA-256-hash in hex.');
  process.exit(1);
}

const store = await createStore(join(DATA_DIR, 'versies.json'));
const log = (msg, err) => console.error(new Date().toISOString(), msg, err instanceof Error ? err.stack : err ?? '');
const server = createServer(createApp({store, tokenHash: TOKEN_HASH, log}));
server.requestTimeout = 10000;
server.headersTimeout = 10000;
server.listen(PORT, () => console.log(`voorstel-api luistert op poort ${PORT}`));

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
