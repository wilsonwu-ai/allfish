// Minnow enrichment: for each freshwater body (up to a cap), query iNaturalist
// for research-grade observations of the minnow families (Leuciscidae — New
// World minnows/shiners/dace — and Cyprinidae — carps & true minnows) within
// the water's bounding box. Where minnows are documented, add them as cited
// species links (category "baitfish", source = iNaturalist) so the app can
// "mention where the minnows are." Reports which waters have documented minnows.
//
// Usage:  node server/db/enrich-minnows.js [regionLike] [cap]
//   regionLike: optional SQL LIKE on admin (e.g. "Massachusetts%"); default all
//   cap:        max waters to query (iNaturalist rate limits); default 150

import { getDb, closeDb } from '../src/db.js';

const INAT = 'https://api.inaturalist.org/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function resolveFamily(name) {
  try {
    const r = await fetch(`${INAT}/taxa?q=${encodeURIComponent(name)}&rank=family`, { headers: { 'User-Agent': 'AllFish/0.1' } });
    const d = await r.json();
    const hit = (d.results || []).find((t) => t.name === name) || (d.results || [])[0];
    return hit?.id ?? null;
  } catch { return null; }
}

function obsUrl(taxonIds, bb) {
  return `https://www.inaturalist.org/observations?taxon_id=${taxonIds.join(',')}` +
    `&nelat=${bb.max_lat}&nelng=${bb.max_lng}&swlat=${bb.min_lat}&swlng=${bb.min_lng}` +
    `&quality_grade=research&verifiable=true`;
}

async function minnowsIn(bb, taxonIds) {
  const url = `${INAT}/observations/species_counts?taxon_id=${taxonIds.join(',')}` +
    `&nelat=${bb.max_lat}&nelng=${bb.max_lng}&swlat=${bb.min_lat}&swlng=${bb.min_lng}` +
    `&quality_grade=research&verifiable=true&per_page=8`;
  const r = await fetch(url, { headers: { 'User-Agent': 'AllFish/0.1' } });
  if (!r.ok) throw new Error(`iNat ${r.status}`);
  const d = await r.json();
  return (d.results || []).map((x) => ({
    common: x.taxon?.preferred_common_name || x.taxon?.name,
    sci: x.taxon?.name,
    count: x.count,
  })).filter((s) => s.sci);
}

async function run() {
  const regionLike = process.argv[2] || '%';
  const cap = Number(process.argv[3] || 150);
  const db = getDb();

  console.log('Resolving iNaturalist minnow family taxa…');
  const leuc = await resolveFamily('Leuciscidae');
  const cypr = await resolveFamily('Cyprinidae');
  const taxonIds = [leuc, cypr].filter(Boolean);
  if (!taxonIds.length) { console.error('Could not resolve minnow taxa; aborting.'); process.exit(1); }
  console.log(`  Leuciscidae=${leuc} Cyprinidae=${cypr}`);

  // Freshwater bodies only (minnows are freshwater), prefer smaller-bbox lakes/
  // ponds/rivers so the iNat query is tightly scoped; cap for rate limits.
  const waters = db.prepare(`
    SELECT id, name, min_lng, min_lat, max_lng, max_lat,
           (max_lng-min_lng)*(max_lat-min_lat) AS area
    FROM waterbody
    WHERE (salinity = 'fresh' OR salinity IS NULL)
      AND admin LIKE ?
      AND water_type IN ('lake','pond','reservoir')
    ORDER BY area DESC
    LIMIT ?
  `).all(regionLike, cap);
  console.log(`Querying iNaturalist for ${waters.length} freshwater bodies…`);

  const insSpecies = db.prepare(`INSERT OR IGNORE INTO species (id,common_name,scientific_name,category) VALUES (@id,@common,@sci,'baitfish')`);
  const insLink2 = db.prepare(`INSERT OR REPLACE INTO waterbody_species
    (waterbody_id,species_id,evidence,confidence,source_name,source_url,source_publisher)
    VALUES (?,?,'iNaturalist research-grade observations (minnow family)','medium',
            'iNaturalist — minnow observations in this water',?, 'iNaturalist')`);

  const withMinnows = [];
  let i = 0;
  for (const w of waters) {
    i++;
    const bb = { min_lng: w.min_lng, min_lat: w.min_lat, max_lng: w.max_lng, max_lat: w.max_lat };
    let found = [];
    try { found = await minnowsIn(bb, taxonIds); }
    catch (e) { if (/429/.test(String(e))) await sleep(3000); }
    if (found.length) {
      const url = obsUrl([leuc].filter(Boolean).length ? [leuc] : taxonIds, bb);
      const tx = db.transaction(() => {
        for (const s of found.slice(0, 5)) {
          const sid = slug(s.sci);
          insSpecies.run({ id: sid, common: s.common || s.sci, sci: s.sci });
          insLink2.run(w.id, sid, url);
        }
      });
      tx();
      withMinnows.push({ name: w.name, minnows: found.slice(0, 5).map((s) => s.common || s.sci) });
    }
    if (i % 20 === 0) console.log(`  …${i}/${waters.length} · ${withMinnows.length} with minnows`);
    await sleep(1100); // iNaturalist politeness
  }

  console.log(`\nMinnow enrichment complete: ${withMinnows.length}/${waters.length} waters have documented minnows.`);
  for (const w of withMinnows.slice(0, 40)) console.log(`  • ${w.name}: ${w.minnows.join(', ')}`);
  if (withMinnows.length > 40) console.log(`  …and ${withMinnows.length - 40} more.`);
  closeDb();
}

run().catch((e) => { console.error(e); process.exit(1); });
