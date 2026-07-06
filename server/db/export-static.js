// Export the seeded database to static JSON for the GitHub Pages build.
// Produces client/public/data/{waterbodies.geojson, details.json, species.json},
// which the client reads directly in static mode (no backend). Run after seeding.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { listWaterbodiesInBbox, getWaterbody, listSpecies, rowToFeature } from '../src/repo.js';
import { closeDb } from '../src/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', '..', 'client', 'public', 'data');
mkdirSync(OUT, { recursive: true });

const ATTRIBUTION =
  'Water: USGS NHD (US) / NRCan NHN (CA) · Geometry © OpenStreetMap contributors (ODbL) · Species: state/provincial fish & wildlife agencies';

const rows = listWaterbodiesInBbox({ minLng: -180, minLat: -90, maxLng: 180, maxLat: 90, limit: 5000 });

const features = [];
const details = {};
for (const row of rows) {
  const wb = getWaterbody(row.id);
  const feature = rowToFeature(row);
  feature.properties.speciesIds = wb.species.map((s) => s.id);
  features.push(feature);
  const { geometry_json, ...rest } = wb;
  details[row.id] = { ...rest, geometry: JSON.parse(geometry_json) };
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
