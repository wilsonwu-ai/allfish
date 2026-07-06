// Self-contained API smoke tests. Spawns the server on a test port against the
// already-seeded SQLite DB, exercises the read + write + validation + security
// paths, then tears down. Run: `node server/test/api.test.js` (or `npm run qa`).

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, '..', 'src', 'server.js');
const PORT = 8791;
const BASE = `http://localhost:${PORT}`;

let child;

async function waitForHealth(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not become healthy');
}

test.before(async () => {
  child = spawn('node', [SERVER], { env: { ...process.env, PORT: String(PORT), LOG_LEVEL: 'error' }, stdio: 'inherit' });
  await waitForHealth();
});

test.after(() => { if (child) child.kill('SIGKILL'); });

test('health', async () => {
  const r = await (await fetch(`${BASE}/api/health`)).json();
  assert.equal(r.ok, true);
});

test('stats has seeded content', async () => {
  const r = await (await fetch(`${BASE}/api/stats`)).json();
  assert.ok(r.waterbodies >= 10, 'expected >=10 water bodies');
  assert.ok(r.species_links >= r.species, 'species links >= species');
});

test('bbox returns GeoJSON with attribution + geometry', async () => {
  const r = await (await fetch(`${BASE}/api/waterbodies?bbox=-100,40,-88,49`)).json();
  assert.equal(r.type, 'FeatureCollection');
  assert.ok(r.attribution.includes('USGS'), 'attribution cites water source');
  assert.ok(r.features.length >= 1);
  const f = r.features[0];
  assert.ok(f.geometry && f.geometry.type, 'feature has geometry');
  assert.ok(f.properties.water_source.url, 'feature has water source citation');
});

test('detail includes cited species + provenance', async () => {
  const r = await (await fetch(`${BASE}/api/waterbodies/us-ca-tahoe`)).json();
  assert.equal(r.name, 'Lake Tahoe');
  assert.ok(r.geometry.type, 'has geometry');
  assert.ok(r.water_source_url.length > 0, 'has water provenance URL');
  assert.ok(r.species.length >= 3, 'has species');
  for (const s of r.species) {
    assert.ok(s.source_url.startsWith('http'), `species ${s.common_name} has a source URL`);
    assert.ok(['high', 'medium', 'low'].includes(s.confidence), 'species has confidence');
  }
});

test('species filter narrows results', async () => {
  const r = await (await fetch(`${BASE}/api/waterbodies?species=sander-vitreus`)).json();
  assert.ok(r.features.length >= 1, 'walleye waters exist');
  assert.ok(r.features.every((f) => f.properties.name), 'features named');
});

test('review write path works and sanitizes XSS', async () => {
  const res = await fetch(`${BASE}/api/waterbodies/us-mn-minnetonka/reviews`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author: '<b>Tester</b>', rating: 4, body: '<script>alert(1)</script>Nice bluegill bite off the docks.' }),
  });
  assert.equal(res.status, 201);
  const { review } = await res.json();
  assert.ok(!review.author.includes('<'), 'tags stripped from author');
  assert.ok(!review.body.includes('<script>'), 'script stripped from body');
  // cleanup
  const { getDb, closeDb } = await import('../src/db.js');
  getDb().prepare(`DELETE FROM review WHERE id = ?`).run(review.id);
  closeDb();
});

test('validation: bad bbox -> 400', async () => {
  assert.equal((await fetch(`${BASE}/api/waterbodies?bbox=abc`)).status, 400);
  assert.equal((await fetch(`${BASE}/api/waterbodies?bbox=-999,40,-88,49`)).status, 400); // out of range
});

test('validation: bad rating -> 400', async () => {
  const res = await fetch(`${BASE}/api/waterbodies/us-mn-minnetonka/reviews`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author: 'x', rating: 99, body: 'hello there' }),
  });
  assert.equal(res.status, 400);
});

test('missing water body -> 404', async () => {
  assert.equal((await fetch(`${BASE}/api/waterbodies/nope`)).status, 404);
});

test('security headers present', async () => {
  const res = await fetch(`${BASE}/api/health`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(res.headers.get('content-security-policy').includes("script-src 'self'"), 'CSP locks scripts to self');
  assert.ok(res.headers.get('strict-transport-security'), 'HSTS present');
});
