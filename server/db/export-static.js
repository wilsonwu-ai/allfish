// Export the seeded database to static JSON for the GitHub Pages build.
// Produces client/public/data/{waterbodies.geojson, details.json, species.json},
// which the client reads directly in static mode (no backend). Run after seeding.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { allWaterbodyRows, getWaterbody, listSpecies, rowToFeature } from '../src/repo.js';
import { closeDb } from '../src/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', '..', 'client', 'public', 'data');
mkdirSync(OUT, { recursive: true });

const ATTRIBUTION =
  'Water: USGS NHD (US) / NRCan NHN (CA) · Geometry © OpenStreetMap contributors (ODbL) · Species: state/provincial fish & wildlife agencies';

// Round coordinates to 5 decimals (~1 m) to shrink the static bundle ~35%
// with no visible quality loss at map scale.
function round5(geom) {
  const r = (n) => Math.round(n * 1e5) / 1e5;
  const walk = (c) => (typeof c[0] === 'number' ? [r(c[0]), r(c[1])] : c.map(walk));
  return { ...geom, coordinates: walk(geom.coordinates) };
}

const rows = allWaterbodyRows();

const features = [];
const details = {};
for (const row of rows) {
  const wb = getWaterbody(row.id);
  const feature = rowToFeature(row);
  feature.geometry = round5(feature.geometry);
  feature.properties.speciesIds = wb.species.map((s) => s.id);
  features.push(feature);
  // Geometry is intentionally omitted from details — the client reads geometry
  // only from waterbodies.geojson (the detail panel uses bbox + species). This
  // keeps details.json ~10x smaller for the static bundle.
  const { geometry_json, ...rest } = wb;
  details[row.id] = rest;
}

const fc = { type: 'FeatureCollection', attribution: ATTRIBUTION, features };

writeFileSync(join(OUT, 'waterbodies.geojson'), JSON.stringify(fc));
writeFileSync(join(OUT, 'details.json'), JSON.stringify(details));
writeFileSync(join(OUT, 'species.json'), JSON.stringify({ species: listSpecies() }));
closeDb();

console.log(`Exported static data → ${OUT}`);
console.log(`  waterbodies.geojson: ${features.length} features`);
console.log(`  details.json: ${Object.keys(details).length} water bodies`);
console.log(`  species.json: ${listSpecies().length} species`);
