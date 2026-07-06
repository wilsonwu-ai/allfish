// Load seed.json + geometry-cache.json into SQLite. Idempotent: clears the
// content tables and reloads (reviews are preserved by default; pass
// ALLFISH_WIPE_REVIEWS=1 to also clear user reviews).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getDb, closeDb } from '../src/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = join(__dirname, '..', 'data', 'seed.json');
const CACHE_PATH = join(__dirname, '..', 'data', 'geometry-cache.json');

function bboxOf(geometry) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const visit = (c) => {
    if (typeof c[0] === 'number') {
      minLng = Math.min(minLng, c[0]); maxLng = Math.max(maxLng, c[0]);
      minLat = Math.min(minLat, c[1]); maxLat = Math.max(maxLat, c[1]);
    } else for (const x of c) visit(x);
  };
  visit(geometry.coordinates);
  return { minLng, minLat, maxLng, maxLat };
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Prebaked "angler report" seed content. Authored by "AllFish Guide" (clearly
// editorial, not impersonating real anglers). Content is grounded in the cited
// agency data so the reviews section is populated on flagship waters at launch.
// Idempotent: editorial rows are cleared and reinserted on each seed; genuine
// user reviews are never touched.
const EDITORIAL_AUTHOR = 'AllFish Guide';
const EDITORIAL = [
  { wb: 'us-mn-millelacs', rating: 5, target_species: 'Walleye', body: 'The benchmark walleye fishery in the Upper Midwest. MN DNR runs a tightly regulated slot, so check current harvest rules before you go. Rock reefs and mud flats produce all season.' },
  { wb: 'us-mn-millelacs', rating: 4, target_species: 'Smallmouth Bass', body: 'World-class smallmouth on the rocky shorelines — trophy-class fish are common. Catch-and-release keeps it that way.' },
  { wb: 'us-mn-minnetonka', rating: 4, target_species: 'Muskellunge', body: 'Big, weedy metro lake with a strong muskie program and healthy bass and panfish. Multiple public accesses; it gets busy with boat traffic on summer weekends.' },
  { wb: 'us-ca-tahoe', rating: 5, target_species: 'Lake Trout (Mackinaw)', body: 'Deep, cold and clear — Mackinaw fishing is the main event, best by boat with downriggers. Kokanee run in the fall. Stunning scenery even on a slow day.' },
  { wb: 'us-al-guntersville', rating: 5, target_species: 'Largemouth Bass', body: 'One of the top trophy largemouth lakes in the country. Grass mats and ledges on the Tennessee River channel are the classic patterns.' },
  { wb: 'ca-ab-bowriver', rating: 5, target_species: 'Brown Trout', body: 'A blue-ribbon tailwater running right through Calgary. Wild browns and rainbows in strong numbers. Barbless hooks required — read the Alberta regs before you wet a line.' },
  { wb: 'ca-bc-fraser', rating: 5, target_species: 'White Sturgeon', body: 'Catch-and-release sturgeon here can top two metres — a genuine bucket-list fish. Go with a licensed guide; the river is powerful and the regulations are strict.' },
  { wb: 'ca-on-nipissing', rating: 4, target_species: 'Walleye', body: 'Classic Ontario walleye and muskie water near North Bay. Great ice fishing in winter; mind the slot limits that protect the walleye population.' },
];

function run() {
  const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  const geom = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {};
  const db = getDb();

  const tx = db.transaction(() => {
    db.exec('DELETE FROM waterbody_species; DELETE FROM species; DELETE FROM waterbody;');
    if (process.env.ALLFISH_WIPE_REVIEWS === '1') db.exec('DELETE FROM review;');

    const insWb = db.prepare(`
      INSERT INTO waterbody (id,name,water_type,country,admin,description,centroid_lng,centroid_lat,
        min_lng,min_lat,max_lng,max_lat,geometry_json,water_source_name,water_source_url,water_source_license,geometry_source,salinity,salinity_basis)
      VALUES (@id,@name,@water_type,@country,@admin,@description,@centroid_lng,@centroid_lat,
        @min_lng,@min_lat,@max_lng,@max_lat,@geometry_json,@water_source_name,@water_source_url,@water_source_license,@geometry_source,@salinity,@salinity_basis)
    `);
    // The curated waters are inland freshwater fisheries, except the Fraser's
    // tidal lower reach near Vancouver (brackish/mixed).
    const MIXED = new Set(['ca-bc-fraser']);
    const insSpecies = db.prepare(`INSERT OR IGNORE INTO species (id,common_name,scientific_name,category) VALUES (@id,@common_name,@scientific_name,@category)`);
    const insLink = db.prepare(`
      INSERT OR REPLACE INTO waterbody_species (waterbody_id,species_id,evidence,confidence,source_name,source_url,source_publisher)
      VALUES (@waterbody_id,@species_id,@evidence,@confidence,@source_name,@source_url,@source_publisher)
    `);

    for (const wb of seed.waterbodies) {
      const g = geom[wb.id];
      if (!g) { console.warn(`no geometry for ${wb.id} — run npm run fetch:geometry first; skipping`); continue; }
      const bb = bboxOf(g.geometry);
      // If OSM gave a per-feature permalink, prefer it as the water citation and
      // demote the dataset citation to the license/publisher context.
      let waterName = wb.water_source.name;
      let waterUrl = wb.water_source.url;
      if (g.osmUrl) {
        waterName = `${wb.water_source.name} · OpenStreetMap feature`;
        waterUrl = g.osmUrl;
      }
      insWb.run({
        id: wb.id, name: wb.name, water_type: wb.water_type, country: wb.country, admin: wb.admin ?? null,
        description: wb.description ?? null, centroid_lng: wb.centroid[0], centroid_lat: wb.centroid[1],
        min_lng: bb.minLng, min_lat: bb.minLat, max_lng: bb.maxLng, max_lat: bb.maxLat,
        geometry_json: JSON.stringify(g.geometry),
        water_source_name: waterName, water_source_url: waterUrl, water_source_license: wb.water_source.license,
        geometry_source: g.source,
        salinity: MIXED.has(wb.id) ? 'mixed' : 'fresh',
        salinity_basis: MIXED.has(wb.id) ? 'tidal lower reach (brackish/estuarine)' : 'inland freshwater fishery',
      });
      for (const sp of wb.species || []) {
        const sid = slug(sp.scientific_name || sp.common_name);
        insSpecies.run({ id: sid, common_name: sp.common_name, scientific_name: sp.scientific_name ?? null, category: sp.category ?? null });
        insLink.run({
          waterbody_id: wb.id, species_id: sid, evidence: sp.evidence ?? null, confidence: sp.confidence ?? 'medium',
          source_name: sp.source_name, source_url: sp.source_url, source_publisher: sp.source_publisher ?? null,
        });
      }
    }

    // Editorial seed reviews (idempotent — clear + reinsert; user reviews untouched).
    db.prepare(`DELETE FROM review WHERE author = ?`).run(EDITORIAL_AUTHOR);
    const insReview = db.prepare(`INSERT INTO review (waterbody_id,author,rating,target_species,body) VALUES (@wb,@author,@rating,@target,@body)`);
    const known = new Set(seed.waterbodies.map((w) => w.id));
    for (const r of EDITORIAL) {
      if (!known.has(r.wb)) continue;
      insReview.run({ wb: r.wb, author: EDITORIAL_AUTHOR, rating: r.rating, target: r.target_species ?? null, body: r.body });
    }
  });
  tx();

  const c = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  console.log(`Seeded: ${c('waterbody')} water bodies, ${c('species')} species, ${c('waterbody_species')} cited species links, ${c('review')} reviews.`);
  closeDb();
}

run();
