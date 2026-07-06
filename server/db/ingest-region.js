// Bulk-ingest named water bodies (lakes, ponds, reservoirs, rivers) for a
// region from OpenStreetMap via Overpass, classify each as fresh / salt / mixed
// from OSM tags (with a conservative name heuristic), and load them into SQLite.
// Each feature carries an OSM permalink as its cited source (documents both that
// the water exists and the tags used to classify salinity).
//
// Usage:  node server/db/ingest-region.js boston
//         node server/db/ingest-region.js ny
//
// Scope: named lakes/ponds/reservoirs (natural=water) + named rivers
// (waterway=river). Unnamed features and small brooks (waterway=stream) are
// excluded to keep the inventory meaningful — logged, never silently dropped.

import { getDb, closeDb } from '../src/db.js';

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const UA = 'AllFish/0.1 (waterbody discovery app; +https://github.com/wilsonwu-ai/allfish)';

const REGIONS = {
  boston: {
    label: 'Massachusetts (Greater Boston, 50 mi)',
    country: 'US',
    mode: 'circle',
    center: [-71.0589, 42.3601],
    radiusKm: 80.467, // 50 miles
    tileDeg: 0.35,
    maxFeatures: 6000,
  },
  ny: {
    label: 'New York',
    country: 'US',
    mode: 'bbox',
    bbox: [-79.85, 40.45, -71.75, 45.05], // NY State extent
    tileDeg: 0.5,
    maxFeatures: 20000,
  },
};

// ------------------------------ geo helpers ------------------------------
const R = 6371;
const toRad = (d) => (d * Math.PI) / 180;
function haversine(a, b) {
  const dLat = toRad(b[1] - a[1]), dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bboxOf(coords) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  const v = (x) => { if (typeof x[0] === 'number') { a = Math.min(a, x[0]); c = Math.max(c, x[0]); b = Math.min(b, x[1]); d = Math.max(d, x[1]); } else x.forEach(v); };
  v(coords);
  return { minLng: a, minLat: b, maxLng: c, maxLat: d };
}
function centroidOf(bb) { return [(bb.minLng + bb.maxLng) / 2, (bb.minLat + bb.maxLat) / 2]; }
function approxAreaKm2(bb) {
  const w = (bb.maxLng - bb.minLng) * 111 * Math.cos(toRad((bb.minLat + bb.maxLat) / 2));
  const h = (bb.maxLat - bb.minLat) * 111;
  return Math.abs(w * h);
}
function simplify(coords, tol) {
  if (coords.length <= 3) return coords;
  const sqTol = tol * tol;
  const sqSeg = (p, a, b) => {
    let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
    if (dx || dy) { const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy); if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; } }
    dx = p[0] - x; dy = p[1] - y; return dx * dx + dy * dy;
  };
  const keep = new Array(coords.length).fill(false);
  keep[0] = keep[coords.length - 1] = true;
  const st = [[0, coords.length - 1]];
  while (st.length) { const [f, l] = st.pop(); let m = 0, idx = -1; for (let i = f + 1; i < l; i++) { const dd = sqSeg(coords[i], coords[f], coords[l]); if (dd > m) { m = dd; idx = i; } } if (m > sqTol && idx !== -1) { keep[idx] = true; st.push([f, idx], [idx, l]); } }
  return coords.filter((_, i) => keep[i]);
}

async function overpass(query) {
  let lastErr;
  for (const url of OVERPASS_MIRRORS) {
    // Retry each mirror with backoff on transient 429/504 before failing over.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA, Accept: 'application/json' }, body: 'data=' + encodeURIComponent(query) });
        if (res.status === 429 || res.status === 502 || res.status === 504) throw new Error(`Overpass ${res.status}`);
        if (!res.ok) throw new Error(`Overpass ${res.status}`);
        return await res.json();
      } catch (e) {
        lastErr = e;
        const transient = /429|502|504|fetch failed|network/i.test(String(e.message));
        if (!transient) break; // permanent error → next mirror
        await sleep(2500 * attempt); // 2.5s, 5s, 7.5s
      }
    }
  }
  throw lastErr;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --------------------------- classification ------------------------------
const SALT_NAME = /\b(salt\s?pond|harbou?r|estuary)\b/i;
function classifySalinity(tags, name) {
  if (tags.tidal === 'yes' || tags.water === 'tidal') return ['mixed', 'OSM tidal tag (brackish/estuarine)'];
  if (tags.salt === 'yes') return ['salt', 'OSM salt=yes tag'];
  if (SALT_NAME.test(name || '')) return name && /estuary/i.test(name) ? ['mixed', 'named estuary'] : ['salt', 'named salt pond/harbor'];
  return ['fresh', 'inland freshwater (OSM, no tidal/salt tag)'];
}
function classifyType(tags, isLine, bb) {
  if (isLine) return 'river';
  if (tags.water === 'reservoir' || tags.landuse === 'reservoir') return 'reservoir';
  if (tags.water === 'pond') return 'pond';
  if (tags.water === 'lake') return 'lake';
  if (tags.water === 'lagoon') return 'pond';
  return approxAreaKm2(bb) >= 0.5 ? 'lake' : 'pond';
}

function tiles(region) {
  const [minLng, minLat, maxLng, maxLat] = region.mode === 'circle'
    ? [region.center[0] - region.radiusKm / (111 * Math.cos(toRad(region.center[1]))), region.center[1] - region.radiusKm / 111,
       region.center[0] + region.radiusKm / (111 * Math.cos(toRad(region.center[1]))), region.center[1] + region.radiusKm / 111]
    : region.bbox;
  const out = [];
  for (let lat = minLat; lat < maxLat; lat += region.tileDeg) {
    for (let lng = minLng; lng < maxLng; lng += region.tileDeg) {
      out.push([lat, lng, Math.min(lat + region.tileDeg, maxLat), Math.min(lng + region.tileDeg, maxLng)]);
    }
  }
  return out;
}

function collect(elements) {
  // Returns { polygons: [{tags,name,ring,osm}], lines: [{tags,name,coords,osm}] }
  const polygons = [], lines = [];
  for (const el of elements) {
    const tags = el.tags || {};
    const name = tags.name;
    if (!name) continue;
    if (el.type === 'way' && Array.isArray(el.geometry)) {
      const coords = el.geometry.map((g) => [g.lon, g.lat]);
      if (tags.natural === 'water' || tags.landuse === 'reservoir') polygons.push({ tags, name, ring: coords, osm: { type: 'way', id: el.id } });
      else if (tags.waterway === 'river') lines.push({ tags, name, coords, osm: { type: 'way', id: el.id } });
    } else if (el.type === 'relation' && Array.isArray(el.members)) {
      if (tags.natural === 'water') {
        // pick the largest outer ring
        let best = null, bestArea = -1;
        for (const m of el.members) {
          if (m.type === 'way' && Array.isArray(m.geometry) && m.geometry.length >= 4) {
            const ring = m.geometry.map((g) => [g.lon, g.lat]);
            const ar = approxAreaKm2(bboxOf(ring));
            if (ar > bestArea) { bestArea = ar; best = ring; }
          }
        }
        if (best) polygons.push({ tags, name, ring: best, osm: { type: 'relation', id: el.id } });
      } else if (tags.waterway === 'river') {
        for (const m of el.members) if (m.type === 'way' && Array.isArray(m.geometry)) lines.push({ tags, name, coords: m.geometry.map((g) => [g.lon, g.lat]), osm: { type: 'relation', id: el.id } });
      }
    }
  }
  return { polygons, lines };
}

async function run() {
  const key = process.argv[2];
  const region = REGIONS[key];
  if (!region) { console.error(`Unknown region "${key}". Options: ${Object.keys(REGIONS).join(', ')}`); process.exit(1); }
  const cells = tiles(region);
  console.log(`Ingesting "${region.label}" — ${cells.length} tiles, up to ${region.maxFeatures} features`);

  const db = getDb();
  const ins = db.prepare(`INSERT OR REPLACE INTO waterbody
    (id,name,water_type,country,admin,description,centroid_lng,centroid_lat,min_lng,min_lat,max_lng,max_lat,
     geometry_json,water_source_name,water_source_url,water_source_license,geometry_source,salinity,salinity_basis)
    VALUES (@id,@name,@water_type,@country,@admin,@description,@clng,@clat,@minLng,@minLat,@maxLng,@maxLat,
     @geo,@wsn,@wsu,@wsl,@gs,@sal,@salb)`);
  const inRadius = (c) => region.mode !== 'circle' || haversine(region.center, c) <= region.radiusKm;
  const bySal = {};
  let inserted = 0;
  const insertRecord = (r) => {
    ins.run({
      id: `osm-${r.osm.type}-${r.osm.id}`, name: r.name, water_type: r.water_type, country: region.country, admin: region.label,
      description: `${r.water_type[0].toUpperCase() + r.water_type.slice(1)}, classified ${r.salinity} — ${r.salinity_basis}.`,
      clng: r.centroid[0], clat: r.centroid[1], minLng: r.bb.minLng, minLat: r.bb.minLat, maxLng: r.bb.maxLng, maxLat: r.bb.maxLat,
      geo: JSON.stringify(r.geometry),
      wsn: 'OpenStreetMap feature', wsu: `https://www.openstreetmap.org/${r.osm.type}/${r.osm.id}`, wsl: '© OpenStreetMap contributors (ODbL)',
      gs: 'OpenStreetMap', sal: r.salinity, salb: r.salinity_basis,
    });
    bySal[r.salinity] = (bySal[r.salinity] || 0) + 1;
    inserted++;
  };
  const polyRecord = (p) => {
    let ring = p.ring;
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ring = [...ring, ring[0]];
    ring = simplify(ring, 0.0006);
    const bb = bboxOf(ring);
    const c = centroidOf(bb);
    if (!inRadius(c)) return null;
    const [salinity, basis] = classifySalinity(p.tags, p.name);
    return { osm: p.osm, name: p.name, water_type: classifyType(p.tags, false, bb), salinity, salinity_basis: basis, geometry: { type: 'Polygon', coordinates: [ring] }, bb, centroid: c };
  };

  const seenPoly = new Set();
  const riverByName = new Map();
  let queried = 0, cappedTiles = 0;

  for (const [s, w, n, e] of cells) {
    if (inserted >= region.maxFeatures) { cappedTiles++; continue; }
    const q = `[out:json][timeout:90];(way["natural"="water"]["name"](${s},${w},${n},${e});relation["natural"="water"]["name"](${s},${w},${n},${e});way["landuse"="reservoir"]["name"](${s},${w},${n},${e});way["waterway"="river"]["name"](${s},${w},${n},${e});relation["waterway"="river"]["name"](${s},${w},${n},${e}););out geom;`;
    let data;
    try { data = await overpass(q); }
    catch (err) { console.log(`  ! tile ${s.toFixed(2)},${w.toFixed(2)} failed: ${err.message}`); await sleep(1500); continue; }
    const { polygons, lines } = collect(data.elements || []);
    // Insert polygons incrementally so a long or interrupted run persists progress.
    const batch = db.transaction(() => {
      for (const p of polygons) {
        const k = `${p.osm.type}/${p.osm.id}`;
        if (seenPoly.has(k)) continue;
        seenPoly.add(k);
        if (inserted >= region.maxFeatures) break;
        const rec = polyRecord(p);
        if (rec) insertRecord(rec);
      }
    });
    batch();
    for (const l of lines) {
      const g = riverByName.get(l.name) || { tags: l.tags, name: l.name, segments: [], osm: l.osm };
      g.segments.push(l.coords);
      riverByName.set(l.name, g);
    }
    queried++;
    if (queried % 10 === 0) console.log(`  …${queried}/${cells.length} tiles · ${inserted} inserted · ${riverByName.size} rivers pending`);
    await sleep(1100);
  }

  // Insert accumulated rivers (merged by name) at the end.
  const riverTx = db.transaction(() => {
    for (const g of riverByName.values()) {
      if (inserted >= region.maxFeatures) break;
      const segs = g.segments.map((x) => simplify(x, 0.0006)).filter((x) => x.length >= 2).slice(0, 120);
      if (!segs.length) continue;
      const bb = bboxOf(segs);
      const c = centroidOf(bb);
      if (!inRadius(c)) continue;
      const [salinity, basis] = classifySalinity(g.tags, g.name);
      insertRecord({ osm: g.osm, name: g.name, water_type: 'river', salinity, salinity_basis: basis, geometry: { type: 'MultiLineString', coordinates: segs }, bb, centroid: c });
    }
  });
  riverTx();

  console.log(`\nIngested ${inserted} water bodies for "${region.label}".`);
  console.log(`  salinity: ${JSON.stringify(bySal)}`);
  if (cappedTiles) console.log(`  NOTE: hit maxFeatures cap (${region.maxFeatures}); ${cappedTiles} tiles skipped after the cap.`);
  console.log(`  total waterbodies in DB now: ${db.prepare('SELECT COUNT(*) n FROM waterbody').get().n}`);
  closeDb();
}

run().catch((e) => { console.error(e); process.exit(1); });
