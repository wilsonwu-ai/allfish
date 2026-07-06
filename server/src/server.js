import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import {
  listWaterbodiesInBbox, getWaterbody, searchWaterbodies,
  listSpecies, addReview, stats, rowToFeature,
} from './repo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = join(__dirname, '..', '..', 'client', 'dist');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const TILE_HOST = 'https://tiles.openfreemap.org';

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'info' },
  // SECURITY (F1): do NOT trust client-supplied X-Forwarded-For by default —
  // trusting it lets an attacker spoof req.ip and reset the rate-limit bucket
  // on every request. Enable only behind a known proxy: set TRUST_PROXY to the
  // hop count (e.g. "1") or the proxy CIDR.
  trustProxy: process.env.TRUST_PROXY || false,
  bodyLimit: 32 * 1024, // 32KB — reviews are small; blunts oversized-payload abuse
});

await app.register(cors, { origin: true });
await app.register(rateLimit, {
  global: true,
  max: Number(process.env.RATE_MAX || 300),
  timeWindow: '1 minute',
});

// --- Security headers (manual, no extra dep). CSP is tuned so MapLibre GL
// (web workers via blob:) and the keyless OpenFreeMap tile host both work. ---
app.addHook('onSend', async (req, reply, payload) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  reply.header('Permissions-Policy', 'geolocation=(self)');
  // HSTS (F7): honored by browsers only over HTTPS; harmless over plain HTTP.
  reply.header('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  reply.header(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "worker-src 'self' blob:",
      "child-src 'self' blob:",
      `img-src 'self' data: blob: ${TILE_HOST}`,
      `connect-src 'self' ${TILE_HOST}`,
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "font-src 'self' data:",
    ].join('; ')
  );
  return payload;
});

// -------------------------- Validation schemas ---------------------------
const bboxRe = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;

const waterbodiesQuery = {
  type: 'object',
  properties: {
    bbox: { type: 'string', pattern: bboxRe.source, maxLength: 100 }, // F6: length cap (fits 4 full-precision coords)
    type: { type: 'string', enum: ['lake', 'pond', 'river', 'stream', 'reservoir'] },
    country: { type: 'string', enum: ['US', 'CA'] },
    salinity: { type: 'string', enum: ['fresh', 'salt', 'mixed'] },
    hasFish: { type: 'string', enum: ['1'] },
    species: { type: 'string', maxLength: 80 },
    limit: { type: 'integer', minimum: 1, maximum: 1000 }, // F2: lower cap
  },
};

const reviewBody = {
  type: 'object',
  required: ['author', 'rating', 'body'],
  additionalProperties: false,
  properties: {
    author: { type: 'string', minLength: 1, maxLength: 60 },
    rating: { type: 'integer', minimum: 1, maximum: 5 },
    target_species: { type: 'string', maxLength: 80 },
    body: { type: 'string', minLength: 3, maxLength: 2000 },
  },
};

// Defense-in-depth: strip HTML tags + control chars server-side (React also
// escapes on render, so this is belt-and-suspenders against stored XSS).
const clean = (s) =>
  String(s)
    .replace(/<[^>]*>/g, '')
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// ------------------------------- Routes ---------------------------------
app.get('/api/health', async () => ({ ok: true, ts: new Date().toISOString() }));
app.get('/api/stats', async () => stats());
app.get('/api/species', async () => ({ species: listSpecies() }));

app.get('/api/waterbodies', { schema: { querystring: waterbodiesQuery } }, async (req, reply) => {
  const { bbox, type, country, species, salinity, hasFish, limit } = req.query;
  // Default to the full US+Canada extent when no viewport is supplied.
  let box = { minLng: -170, minLat: 18, maxLng: -52, maxLat: 72 };
  if (bbox) {
    const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(Number);
    // F6: validate finiteness, ordering, AND geographic range.
    const inLng = (v) => v >= -180 && v <= 180;
    const inLat = (v) => v >= -90 && v <= 90;
    if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite) ||
        minLng > maxLng || minLat > maxLat ||
        !inLng(minLng) || !inLng(maxLng) || !inLat(minLat) || !inLat(maxLat)) {
      return reply.code(400).send({ error: 'invalid bbox' });
    }
    box = { minLng, minLat, maxLng, maxLat };
  }
  const rows = listWaterbodiesInBbox({ ...box, type, country, species, salinity, hasFish: hasFish === '1', limit });
  return {
    type: 'FeatureCollection',
    attribution: 'Water: USGS NHD (US) / NRCan NHN (CA) · Geometry © OpenStreetMap contributors (ODbL) · Species: state/provincial fish & wildlife agencies',
    features: rows.map(rowToFeature),
  };
});

app.get('/api/waterbodies/search', {
  schema: { querystring: { type: 'object', required: ['q'], properties: { q: { type: 'string', minLength: 1, maxLength: 80 } } } },
}, async (req) => ({ results: searchWaterbodies(clean(req.query.q)) }));

app.get('/api/waterbodies/:id', {
  schema: { params: { type: 'object', properties: { id: { type: 'string', maxLength: 80 } } } },
}, async (req, reply) => {
  const wb = getWaterbody(req.params.id);
  if (!wb) return reply.code(404).send({ error: 'not_found' });
  return {
    ...wb,
    geometry: JSON.parse(wb.geometry_json),
    geometry_json: undefined,
  };
});

// Stricter limiter on writes: 10 reviews / 5 min / IP.
app.post('/api/waterbodies/:id/reviews', {
  config: { rateLimit: { max: Number(process.env.REVIEW_RATE_MAX || 10), timeWindow: '5 minutes' } },
  schema: {
    params: { type: 'object', properties: { id: { type: 'string', maxLength: 80 } } },
    body: reviewBody,
  },
}, async (req, reply) => {
  const payload = {
    author: clean(req.body.author),
    rating: req.body.rating,
    target_species: req.body.target_species ? clean(req.body.target_species) : null,
    body: clean(req.body.body),
  };
  if (!payload.author || payload.body.length < 3) return reply.code(400).send({ error: 'empty after sanitization' });
  const result = addReview(req.params.id, payload);
  if (result?.error === 'not_found') return reply.code(404).send({ error: 'not_found' });
  return reply.code(201).send({ review: result });
});

// ---------------------- Static client (prod build) ----------------------
if (existsSync(CLIENT_DIST)) {
  // Default (wildcard) serving reads from disk per request, so hashed asset
  // filenames that change between builds are always served. The SPA fallback
  // returns index.html for any non-API, non-file GET.
  await app.register(fastifyStatic, { root: CLIENT_DIST });
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url && req.raw.url.startsWith('/api/')) return reply.code(404).send({ error: 'not_found' });
    return reply.sendFile('index.html');
  });
} else {
  app.get('/', async () => ({ ok: true, note: 'client not built yet — run `npm run build:client`. API is live under /api.' }));
}

app.listen({ port: PORT, host: HOST })
  .then(() => app.log.info(`AllFish API + app on http://localhost:${PORT}`))
  .catch((err) => { app.log.error(err); process.exit(1); });
