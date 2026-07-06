// Fetch real water-body geometry from OpenStreetMap (Overpass API) for each
// seed water body, and cache it to data/geometry-cache.json. Each cache entry
// also records the OSM element permalink, which becomes a per-feature
// water-existence citation (in addition to the USGS NHD / NRCan NHN dataset
// citation in seed.json). Falls back to a generated shape if OSM is
// unreachable or returns nothing, so `seed.js` always has geometry to load.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = join(__dirname, '..', 'data', 'seed.json');
const CACHE_PATH = join(__dirname, '..', 'data', 'geometry-cache.json');
const OVERPASS = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';

const R = 6371; // km
const toRad = (d) => (d * Math.PI) / 180;
function haversine(a, b) {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function lineLength(coords) {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += haversine(coords[i - 1], coords[i]);
  return d;
}
function bboxArea(coords) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [x, y] of coords) {
    minx = Math.min(minx, x); miny = Math.min(miny, y);
    maxx = Math.max(maxx, x); maxy = Math.max(maxy, y);
  }
  return (maxx - minx) * (maxy - miny);
}

// Douglas–Peucker simplification (planar, good enough at these scales).
function simplify(coords, tol) {
  if (coords.length <= 3) return coords;
  const sqTol = tol * tol;
  const sqDist = (p, a, b) => {
    let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p[0] - x; dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  const keep = new Array(coords.length).fill(false);
  keep[0] = keep[coords.length - 1] = true;
  const stack = [[0, coords.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxD = 0, idx = -1;
    for (let i = first + 1; i < last; i++) {
      const d = sqDist(coords[i], coords[first], coords[last]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > sqTol && idx !== -1) {
      keep[idx] = true;
      stack.push([first, idx], [idx, last]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}

function bboxAround(centroid, km) {
  const [lng, lat] = centroid;
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos(toRad(lat)) || 1);
  // Overpass bbox order: south,west,north,east
  return [lat - dLat, lng - dLng, lat + dLat, lng + dLng];
}

// Overpass mirrors reject requests without a User-Agent (406/504). Send one,
// and fail over to a second mirror if the primary errors.
const OVERPASS_MIRRORS = [OVERPASS, 'https://overpass.kumi.systems/api/interpreter'];
const UA = 'AllFish/0.1 (waterbody discovery app; +https://github.com/allfish)';

async function overpass(query) {
  let lastErr;
  for (const url of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA, Accept: 'application/json' },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`Overpass ${res.status} @ ${url}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function nameMatches(tags, name) {
  if (!tags || !tags.name) return false;
  const a = tags.name.toLowerCase();
  const b = name.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
  return a === b || a.includes(b) || b.includes(a);
}

// Collect way-geometries (arrays of [lng,lat]) from an Overpass response,
// including ways nested as relation members.
function collectWays(elements) {
  const ways = [];
  for (const el of elements) {
    if (el.type === 'way' && Array.isArray(el.geometry)) {
      ways.push({ tags: el.tags || {}, coords: el.geometry.map((g) => [g.lon, g.lat]), osm: { type: 'way', id: el.id } });
    } else if (el.type === 'relation' && Array.isArray(el.members)) {
      for (const m of el.members) {
        if (m.type === 'way' && Array.isArray(m.geometry)) {
          ways.push({ tags: el.tags || {}, coords: m.geometry.map((g) => [g.lon, g.lat]), osm: { type: 'relation', id: el.id } });
        }
      }
    }
  }
  return ways;
}

function osmUrl(osm) {
  return osm ? `https://www.openstreetmap.org/${osm.type}/${osm.id}` : null;
}

async function fetchLake(wb) {
  const [s, w, n, e] = bboxAround(wb.centroid, (wb.radius_km || 5) * 1.6);
  const q = `[out:json][timeout:60];(way["natural"="water"](${s},${w},${n},${e});relation["natural"="water"](${s},${w},${n},${e}););out geom;`;
  const data = await overpass(q);
  const ways = collectWays(data.elements || []).filter((x) => x.coords.length >= 4);
  if (!ways.length) return null;
  const named = ways.filter((x) => nameMatches(x.tags, wb.name));
  const pool = named.length ? named : ways;
  // Largest ring by bbox area = the main basin.
  pool.sort((a, b) => bboxArea(b.coords) - bboxArea(a.coords));
  let ring = pool[0].coords;
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ring = [...ring, ring[0]];
  ring = simplify(ring, 0.0008);
  if (ring.length > 500) ring = simplify(ring, 0.0016);
  return { geometry: { type: 'Polygon', coordinates: [ring] }, source: 'OpenStreetMap', osm: pool[0].osm, osmUrl: osmUrl(pool[0].osm) };
}

async function fetchRiver(wb) {
  const [s, w, n, e] = bboxAround(wb.centroid, (wb.reach_km || 12) * 1.1);
  const q = `[out:json][timeout:60];(way["waterway"~"river|stream|canal"](${s},${w},${n},${e}););out geom;`;
  const data = await overpass(q);
  const ways = collectWays(data.elements || []).filter((x) => x.coords.length >= 2);
  if (!ways.length) return null;
  const named = ways.filter((x) => nameMatches(x.tags, wb.name));
  const pool = named.length ? named : ways.sort((a, b) => lineLength(b.coords) - lineLength(a.coords)).slice(0, 1);
  const lines = pool
    .map((x) => simplify(x.coords, 0.0006))
    .filter((c) => c.length >= 2)
    .slice(0, 40);
  if (!lines.length) return null;
  const primary = pool.slice().sort((a, b) => lineLength(b.coords) - lineLength(a.coords))[0];
  return { geometry: { type: 'MultiLineString', coordinates: lines }, source: 'OpenStreetMap', osm: primary.osm, osmUrl: osmUrl(primary.osm) };
}

// Deterministic fallbacks (no network) so seeding always succeeds.
function generatedLake(wb) {
  const [lng, lat] = wb.centroid;
  const rk = wb.radius_km || 3;
  const dLat = rk / 111;
  const dLng = rk / (111 * Math.cos(toRad(lat)) || 1);
  const pts = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * 2 * Math.PI;
    // gentle irregularity so it doesn't read as a perfect circle
    const wob = 1 + 0.12 * Math.sin(3 * t) + 0.06 * Math.cos(5 * t);
    pts.push([lng + Math.cos(t) * dLng * wob, lat + Math.sin(t) * dLat * wob]);
  }
  return { geometry: { type: 'Polygon', coordinates: [pts] }, source: 'generated (approx.)', osm: null, osmUrl: null };
}
function generatedRiver(wb) {
  const [lng, lat] = wb.centroid;
  const rk = wb.reach_km || 12;
  const dLat = rk / 111 / 2;
  const pts = [];
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = lat - dLat + t * 2 * dLat;
    const x = lng + 0.03 * Math.sin(t * 6) * Math.cos(toRad(lat));
    pts.push([x, y]);
  }
  return { geometry: { type: 'LineString', coordinates: pts }, source: 'generated (approx.)', osm: null, osmUrl: null };
}

async function run() {
  const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  let cache = {};
  try { cache = JSON.parse(readFileSync(CACHE_PATH, 'utf8')); } catch { /* fresh */ }

  const isRiver = (t) => t === 'river' || t === 'stream';
  for (const wb of seed.waterbodies) {
    if (cache[wb.id] && process.env.FORCE !== '1') {
      console.log(`· ${wb.name}: cached (${cache[wb.id].source})`);
      continue;
    }
    let result = null;
    try {
      result = isRiver(wb.water_type) ? await fetchRiver(wb) : await fetchLake(wb);
      if (result) console.log(`✓ ${wb.name}: OSM ${result.osm?.type}/${result.osm?.id}`);
    } catch (err) {
      console.log(`! ${wb.name}: Overpass failed (${err.message}) — using fallback`);
    }
    if (!result) {
      result = isRiver(wb.water_type) ? generatedRiver(wb) : generatedLake(wb);
      console.log(`~ ${wb.name}: ${result.source}`);
    }
    cache[wb.id] = result;
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 0));
    await new Promise((r) => setTimeout(r, 1200)); // be polite to Overpass
  }
  console.log(`\nGeometry cache written: ${CACHE_PATH} (${Object.keys(cache).length} features)`);
}

run().catch((e) => { console.error(e); process.exit(1); });
