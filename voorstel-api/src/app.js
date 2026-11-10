// HTTP-handler voor de versies van de voorstelpagina.
// De server ziet alleen versleutelde blobs; schrijven en lezen vereist een token
// waarvan alleen de SHA-256-hash op de server staat.
import {createHash, timingSafeEqual} from 'node:crypto';

const PREFIX = '/api/voorstel';
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const IV_LEN = 16; // 12 bytes in base64
const CT_MAX = 12000;
const BODY_MAX = 16384;
const FAIL_WINDOW_MS = 15 * 60 * 1000;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const send = (res, status, data = null, error = null) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(status === 204 ? undefined : JSON.stringify({success: error === null, data, error}));
};

const readJson = (req) => new Promise((resolve, reject) => {
  const type = String(req.headers['content-type'] || '').split(';')[0].trim();
  if (type !== 'application/json') return reject(new HttpError(415, 'Verwacht application/json'));
  if (Number(req.headers['content-length'] || 0) > BODY_MAX) {
    req.resume();
    return reject(new HttpError(413, 'Verzoek te groot'));
  }
  let size = 0;
  let tooBig = false;
  const chunks = [];
  req.on('data', (c) => {
    if (tooBig) return;
    size += c.length;
    if (size > BODY_MAX) { tooBig = true; chunks.length = 0; reject(new HttpError(413, 'Verzoek te groot')); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    if (tooBig) return;
    try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'Ongeldige JSON')); }
  });
  req.on('error', reject);
});

const validBlob = (blob) => blob !== null && typeof blob === 'object' && !Array.isArray(blob)
  && Object.keys(blob).length === 2
  && typeof blob.iv === 'string' && blob.iv.length === IV_LEN && B64_RE.test(blob.iv)
  && typeof blob.ct === 'string' && blob.ct.length > 0 && blob.ct.length <= CT_MAX && B64_RE.test(blob.ct);

const clientIp = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'onbekend';

const createLimiter = (maxFailures, now) => {
  const fails = new Map();
  const recent = (ip) => (fails.get(ip) || []).filter((t) => now() - t < FAIL_WINDOW_MS);
  return {
    blocked: (ip) => recent(ip).length >= maxFailures,
    fail: (ip) => {
      fails.set(ip, [...recent(ip), now()]);
      if (fails.size > 10000) fails.clear();
    },
  };
};

/**
 * @param {{store: ReturnType<typeof import('./store.js').createStore> extends Promise<infer S> ? S : never,
 *   tokenHash: string, maxVersions?: number, maxFailures?: number, now?: () => number,
 *   log?: (msg: string, err?: unknown) => void}} opts
 */
export function createApp({store, tokenHash, maxVersions = 100, maxFailures = 10, now = Date.now, log = () => {}}) {
  if (!/^[0-9a-f]{64}$/.test(tokenHash || '')) throw new Error('tokenHash moet een SHA-256-hash in hex zijn');
  const expected = Buffer.from(tokenHash, 'hex');
  const limiter = createLimiter(maxFailures, now);

  const authorized = (req) => {
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return false;
    return timingSafeEqual(createHash('sha256').update(token).digest(), expected);
  };

  const routes = async (req, res, path) => {
    if (path === '/versies') {
      if (req.method !== 'GET') throw new HttpError(405, 'Methode niet toegestaan');
      return send(res, 200, store.list());
    }
    const m = path.match(/^\/versies\/([^/]+)$/);
    if (!m) throw new HttpError(404, 'Niet gevonden');
    const id = m[1].toLowerCase();
    if (!ID_RE.test(id)) throw new HttpError(400, 'Ongeldige id');

    if (req.method === 'PUT') {
      const body = await readJson(req);
      if (!body || !validBlob(body.blob)) throw new HttpError(400, 'Ongeldige versie');
      const exists = store.has(id);
      if (!exists && store.count() >= maxVersions) throw new HttpError(409, `Maximaal ${maxVersions} versies`);
      await store.put({id, blob: {iv: body.blob.iv, ct: body.blob.ct}, updated: new Date(now()).toISOString()});
      return send(res, exists ? 200 : 201, {id});
    }
    if (req.method === 'DELETE') {
      if (!(await store.remove(id))) throw new HttpError(404, 'Versie niet gevonden');
      return send(res, 204);
    }
    throw new HttpError(405, 'Methode niet toegestaan');
  };

  return async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    try {
      if (!path.startsWith(PREFIX + '/')) throw new HttpError(404, 'Niet gevonden');
      const sub = path.slice(PREFIX.length);
      if (sub === '/health') {
        if (req.method !== 'GET') throw new HttpError(405, 'Methode niet toegestaan');
        return send(res, 200, {ok: true});
      }
      const ip = clientIp(req);
      if (limiter.blocked(ip)) throw new HttpError(429, 'Te veel mislukte pogingen, probeer later opnieuw');
      if (!authorized(req)) { limiter.fail(ip); throw new HttpError(401, 'Niet aangemeld'); }
      return await routes(req, res, sub);
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, null, err.message);
      log(`Fout bij ${req.method} ${path}`, err);
      return send(res, 500, null, 'Er ging iets mis op de server');
    }
  };
}
