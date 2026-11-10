#!/usr/bin/env node
// Ontsleutelt en versleutelt de inhoud van beerse.html.
// Formaat: PBKDF2-SHA256 (iteraties uit de pagina) + AES-256-GCM, compatibel met WebCrypto in de browser.
//
// Gebruik (vanuit de root van de repo, wachtwoord via de omgeving):
//   BEERSE_PW=... node tools/beerse-crypt.mjs decrypt   # schrijft .beerse-src/
//   ...bewerk .beerse-src/payload.{html,css,js,data.json}...
//   BEERSE_PW=... node tools/beerse-crypt.mjs encrypt   # versleutelt terug in beerse.html
//
// Optioneel: --page <pad naar html> en --dir <map>. De standaardmap .beerse-src/ staat in .gitignore:
// commit de onversleutelde inhoud nooit, de repo is publiek.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pbkdf2Sync, randomBytes, createDecipheriv, createCipheriv } from 'node:crypto';

const BLOB_RE = /const BLOB = (\{.*?\});/s;
const PARTS = ['css', 'html', 'js'];
const TAG_LEN = 16;

const fail = (msg) => { console.error(`Fout: ${msg}`); process.exit(1); };

const parseArgs = (argv) => {
  const [mode, ...rest] = argv;
  const opts = { mode, page: 'beerse.html', dir: '.beerse-src' };
  for (let k = 0; k < rest.length; k += 2) {
    const key = rest[k].replace(/^--/, '');
    if (!['page', 'dir'].includes(key) || rest[k + 1] === undefined) fail(`onbekende optie ${rest[k]}`);
    opts[key] = rest[k + 1];
  }
  return opts;
};

const readBlob = (page) => {
  const match = page.match(BLOB_RE);
  if (!match) fail('BLOB niet gevonden in de pagina');
  return JSON.parse(match[1]);
};

const deriveKey = (pw, salt, iter) => pbkdf2Sync(pw, salt, iter, 32, 'sha256');

const decryptBlob = (pw, blob) => {
  const ct = Buffer.from(blob.ct, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(pw, Buffer.from(blob.salt, 'base64'), blob.iter), Buffer.from(blob.iv, 'base64'));
  decipher.setAuthTag(ct.subarray(ct.length - TAG_LEN));
  try {
    return JSON.parse(Buffer.concat([decipher.update(ct.subarray(0, ct.length - TAG_LEN)), decipher.final()]).toString('utf8'));
  } catch {
    return fail('wachtwoord klopt niet');
  }
};

const encryptPayload = (pw, payload, iter) => {
  const salt = randomBytes(16), iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(pw, salt, iter), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return { salt: salt.toString('base64'), iv: iv.toString('base64'), iter, ct: ct.toString('base64') };
};

const writeDir = (dir, payload) => {
  mkdirSync(dir, { recursive: true });
  PARTS.forEach((k) => writeFileSync(join(dir, `payload.${k}`), payload[k] ?? ''));
  const rest = Object.fromEntries(Object.entries(payload).filter(([k]) => !PARTS.includes(k)));
  writeFileSync(join(dir, 'payload.data.json'), JSON.stringify(rest, null, 2));
};

const readDir = (dir) => {
  const files = ['payload.data.json', ...PARTS.map((k) => `payload.${k}`)];
  files.forEach((f) => { if (!existsSync(join(dir, f))) fail(`${join(dir, f)} ontbreekt; eerst decrypt draaien`); });
  const rest = JSON.parse(readFileSync(join(dir, 'payload.data.json'), 'utf8'));
  return { ...rest, ...Object.fromEntries(PARTS.map((k) => [k, readFileSync(join(dir, `payload.${k}`), 'utf8')])) };
};

const { mode, page: pagePath, dir } = parseArgs(process.argv.slice(2));
if (!['decrypt', 'encrypt'].includes(mode)) fail('gebruik: decrypt|encrypt [--page beerse.html] [--dir .beerse-src]');
const pw = process.env.BEERSE_PW;
if (!pw) fail('zet het wachtwoord in BEERSE_PW');

const page = readFileSync(pagePath, 'utf8');
const blob = readBlob(page);

if (mode === 'decrypt') {
  const payload = decryptBlob(pw, blob);
  writeDir(dir, payload);
  console.log(`Ontsleuteld naar ${dir} (${Object.keys(payload).join(', ')})`);
} else {
  const payload = readDir(dir);
  const next = encryptPayload(pw, payload, blob.iter);
  const check = decryptBlob(pw, next);
  if (JSON.stringify(check) !== JSON.stringify(payload)) fail('controle na versleutelen mislukt; pagina niet aangepast');
  writeFileSync(pagePath, page.replace(BLOB_RE, () => `const BLOB = ${JSON.stringify(next)};`));
  console.log(`Versleuteld in ${pagePath} en gecontroleerd`);
}
