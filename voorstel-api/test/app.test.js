import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {createApp} from '../src/app.js';
import {createStore} from '../src/store.js';

const TOKEN = 'a'.repeat(64);
const HASH = createHash('sha256').update(TOKEN).digest('hex');
const ID = '3f2b8c1e-9a4d-4e7f-8b6a-1c2d3e4f5a6b';
const ID2 = '7d6c5b4a-3e2f-4a1b-9c8d-7e6f5a4b3c2d';
const BLOB = {iv: 'AAAAAAAAAAAAAAAA', ct: 'Zm9vYmFy'};

let dir, server, base;

const start = async (opts = {}) => {
  const store = await createStore(join(dir, 'versies.json'));
  const handler = createApp({store, tokenHash: HASH, maxVersions: 3, ...opts});
  server = createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/api/voorstel`;
};
const stop = () => new Promise((r) => (server ? server.close(r) : r()));
const call = (path, {method = 'GET', token = TOKEN, body, headers = {}} = {}) => fetch(base + path, {
  method,
  headers: {
    ...(token ? {authorization: `Bearer ${token}`} : {}),
    ...(body !== undefined ? {'content-type': 'application/json'} : {}),
    ...headers,
  },
  body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
});

beforeEach(async () => { dir = mkdtempSync(join(tmpdir(), 'voorstel-')); await start(); });
afterEach(async () => { await stop(); rmSync(dir, {recursive: true, force: true}); });

test('health_noAuth_returnsOk', async () => {
  const res = await call('/health', {token: null});
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {success: true, data: {ok: true}, error: null});
});

test('list_withoutToken_returns401', async () => {
  const res = await call('/versies', {token: null});
  assert.equal(res.status, 401);
  assert.equal((await res.json()).success, false);
});

test('list_wrongToken_returns401', async () => {
  const res = await call('/versies', {token: 'b'.repeat(64)});
  assert.equal(res.status, 401);
});

test('list_empty_returnsEmptyArray', async () => {
  const res = await call('/versies');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await res.json()).data, []);
});

test('put_newVersion_returns201AndListsIt', async () => {
  const put = await call(`/versies/${ID}`, {method: 'PUT', body: {blob: BLOB}});
  assert.equal(put.status, 201);
  const list = (await (await call('/versies')).json()).data;
  assert.equal(list.length, 1);
  assert.equal(list[0].id, ID);
  assert.deepEqual(list[0].blob, BLOB);
  assert.ok(!Number.isNaN(Date.parse(list[0].updated)));
});

test('put_existingVersion_returns200AndOverwrites', async () => {
  await call(`/versies/${ID}`, {method: 'PUT', body: {blob: BLOB}});
  const next = {iv: 'BBBBBBBBBBBBBBBB', ct: 'YmF6'};
  const put = await call(`/versies/${ID}`, {method: 'PUT', body: {blob: next}});
  assert.equal(put.status, 200);
  const list = (await (await call('/versies')).json()).data;
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].blob, next);
});

test('put_persistsToDisk_survivesRestart', async () => {
  await call(`/versies/${ID}`, {method: 'PUT', body: {blob: BLOB}});
  const onDisk = JSON.parse(readFileSync(join(dir, 'versies.json'), 'utf8'));
  assert.equal(onDisk.length, 1);
  await stop();
  await start();
  const list = (await (await call('/versies')).json()).data;
  assert.equal(list[0].id, ID);
});

test('put_invalidId_returns400', async () => {
  const res = await call('/versies/../../etc', {method: 'PUT', body: {blob: BLOB}});
  assert.ok([400, 404].includes(res.status));
  const res2 = await call('/versies/not-a-uuid', {method: 'PUT', body: {blob: BLOB}});
  assert.equal(res2.status, 400);
});

test('put_invalidBlob_returns400', async () => {
  for (const blob of [null, {}, {iv: 'short', ct: 'Zm9v'}, {iv: BLOB.iv, ct: 'not base64!'}, {iv: BLOB.iv, ct: ''}, {iv: BLOB.iv, ct: BLOB.ct, extra: 1}]) {
    const res = await call(`/versies/${ID}`, {method: 'PUT', body: {blob}});
    assert.equal(res.status, 400, JSON.stringify(blob));
  }
});

test('put_invalidJson_returns400', async () => {
  const res = await call(`/versies/${ID}`, {method: 'PUT', body: '{nope'});
  assert.equal(res.status, 400);
});

test('put_wrongContentType_returns415', async () => {
  const res = await call(`/versies/${ID}`, {method: 'PUT', body: JSON.stringify({blob: BLOB}), headers: {'content-type': 'text/plain'}});
  assert.equal(res.status, 415);
});

test('put_tooLargeBody_returns413', async () => {
  const res = await call(`/versies/${ID}`, {method: 'PUT', body: {blob: {iv: BLOB.iv, ct: 'A'.repeat(40000)}}});
  assert.equal(res.status, 413);
});

test('put_overLimit_returns409', async () => {
  const ids = [ID, ID2, '11111111-2222-4333-8444-555555555555'];
  for (const id of ids) assert.equal((await call(`/versies/${id}`, {method: 'PUT', body: {blob: BLOB}})).status, 201);
  const res = await call('/versies/99999999-2222-4333-8444-555555555555', {method: 'PUT', body: {blob: BLOB}});
  assert.equal(res.status, 409);
  assert.equal((await call(`/versies/${ID}`, {method: 'PUT', body: {blob: BLOB}})).status, 200);
});

test('put_withoutToken_returns401AndStoresNothing', async () => {
  const res = await call(`/versies/${ID}`, {method: 'PUT', body: {blob: BLOB}, token: null});
  assert.equal(res.status, 401);
  assert.deepEqual((await (await call('/versies')).json()).data, []);
});

test('delete_existing_returns204AndRemoves', async () => {
  await call(`/versies/${ID}`, {method: 'PUT', body: {blob: BLOB}});
  const res = await call(`/versies/${ID}`, {method: 'DELETE'});
  assert.equal(res.status, 204);
  assert.deepEqual((await (await call('/versies')).json()).data, []);
});

test('delete_missing_returns404', async () => {
  const res = await call(`/versies/${ID}`, {method: 'DELETE'});
  assert.equal(res.status, 404);
});

test('delete_withoutToken_returns401AndKeepsVersion', async () => {
  await call(`/versies/${ID}`, {method: 'PUT', body: {blob: BLOB}});
  const res = await call(`/versies/${ID}`, {method: 'DELETE', token: null});
  assert.equal(res.status, 401);
  assert.equal((await (await call('/versies')).json()).data.length, 1);
});

test('unknownRoute_returns404', async () => {
  assert.equal((await call('/iets')).status, 404);
});

test('wrongMethod_returns405', async () => {
  assert.equal((await call('/versies', {method: 'POST', body: {}})).status, 405);
});

test('repeatedBadTokens_areRateLimited', async () => {
  await stop();
  await start({maxFailures: 3});
  for (let k = 0; k < 3; k++) assert.equal((await call('/versies', {token: 'x'})).status, 401);
  assert.equal((await call('/versies', {token: 'x'})).status, 429);
  assert.equal((await call('/versies')).status, 429);
});
