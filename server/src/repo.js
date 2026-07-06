// Repository layer — the ONLY module that talks SQL. Route handlers depend on
// these functions, not on the DB engine, so the store can be swapped (Postgres/
// PostGIS, read replicas, a caching layer) without touching the API surface.

import { getDb } from './db.js';

/**
 * Water bodies whose bounding box intersects the requested viewport bbox.
 * Returns lightweight rows (no per-species joins) so the map layer stays fast.
 * @param {{minLng:number,minLat:number,maxLng:number,maxLat:number,type?:string,country?:string,species?:string,limit?:number}} q
 */
export function listWaterbodiesInBbox(q) {
  const db = getDb();
  const clauses = [
    'w.max_lng >= @minLng',
    'w.min_lng <= @maxLng',
    'w.max_lat >= @minLat',
    'w.min_lat <= @maxLat',
  ];
  const params = {
    minLng: q.minLng, minLat: q.minLat, maxLng: q.maxLng, maxLat: q.maxLat,
    limit: Math.min(Math.max(q.limit ?? 500, 1), 1000),
  };
  if (q.type) { clauses.push('w.water_type = @type'); params.type = q.type; }
  if (q.country) { clauses.push('w.country = @country'); params.country = q.country; }

  let sql = `
    SELECT w.id, w.name, w.water_type, w.country, w.admin,
           w.centroid_lng, w.centroid_lat, w.geometry_json,
           w.water_source_name, w.water_source_url, w.water_source_license, w.geometry_source,
           (SELECT COUNT(*) FROM waterbody_species s WHERE s.waterbody_id = w.id) AS species_count,
           (SELECT ROUND(AVG(r.rating),2) FROM review r WHERE r.waterbody_id = w.id AND r.status='published') AS avg_rating,
           (SELECT COUNT(*) FROM review r WHERE r.waterbody_id = w.id AND r.status='published') AS review_count
    FROM waterbody w
  `;
  if (q.species) {
    sql += ` JOIN waterbody_species ws ON ws.waterbody_id = w.id AND ws.species_id = @species `;
    params.species = q.species;
  }
  sql += ` WHERE ${clauses.join(' AND ')} LIMIT @limit`;
  return db.prepare(sql).all(params);
}

/** Full detail for one water body: props + geometry + cited species + published reviews. */
export function getWaterbody(id) {
  const db = getDb();
  const w = db.prepare(`SELECT * FROM waterbody WHERE id = ?`).get(id);
  if (!w) return null;
  const species = db.prepare(`
    SELECT s.id, s.common_name, s.scientific_name, s.category,
           ws.evidence, ws.confidence, ws.source_name, ws.source_url, ws.source_publisher
    FROM waterbody_species ws JOIN species s ON s.id = ws.species_id
    WHERE ws.waterbody_id = ?
    ORDER BY (CASE ws.confidence WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END), s.common_name
  `).all(id);
  const reviews = db.prepare(`
    SELECT id, author, rating, target_species, body, created_at
    FROM review WHERE waterbody_id = ? AND status='published'
    ORDER BY created_at DESC LIMIT 200
  `).all(id);
  const agg = db.prepare(`
    SELECT ROUND(AVG(rating),2) AS avg_rating, COUNT(*) AS review_count
    FROM review WHERE waterbody_id = ? AND status='published'
  `).get(id);
  return { ...w, species, reviews, avg_rating: agg.avg_rating, review_count: agg.review_count };
}

export function searchWaterbodies(term, limit = 20) {
  const db = getDb();
  return db.prepare(`
    SELECT id, name, water_type, country, admin, centroid_lng, centroid_lat
    FROM waterbody WHERE name LIKE ? COLLATE NOCASE ORDER BY name LIMIT ?
  `).all(`%${term}%`, Math.min(limit, 50));
}

export function listSpecies() {
  const db = getDb();
  return db.prepare(`
    SELECT s.id, s.common_name, s.scientific_name, s.category,
           COUNT(ws.waterbody_id) AS waterbody_count
    FROM species s LEFT JOIN waterbody_species ws ON ws.species_id = s.id
    GROUP BY s.id ORDER BY waterbody_count DESC, s.common_name
  `).all();
}

export function addReview(waterbodyId, { author, rating, target_species, body }) {
  const db = getDb();
  const exists = db.prepare(`SELECT 1 FROM waterbody WHERE id = ?`).get(waterbodyId);
  if (!exists) return { error: 'not_found' };
  const info = db.prepare(`
    INSERT INTO review (waterbody_id, author, rating, target_species, body)
    VALUES (@waterbodyId, @author, @rating, @target_species, @body)
  `).run({ waterbodyId, author, rating, target_species: target_species ?? null, body });
  return db.prepare(`SELECT id, author, rating, target_species, body, created_at FROM review WHERE id = ?`)
    .get(info.lastInsertRowid);
}

export function stats() {
  const db = getDb();
  const one = (sql) => db.prepare(sql).get().n;
  return {
    waterbodies: one(`SELECT COUNT(*) n FROM waterbody`),
    species: one(`SELECT COUNT(*) n FROM species`),
    species_links: one(`SELECT COUNT(*) n FROM waterbody_species`),
    reviews: one(`SELECT COUNT(*) n FROM review WHERE status='published'`),
  };
}

/** Turn a repo row into a GeoJSON Feature for the map layer. */
export function rowToFeature(row) {
  return {
    type: 'Feature',
    id: row.id,
    geometry: JSON.parse(row.geometry_json),
    properties: {
      id: row.id,
      name: row.name,
      water_type: row.water_type,
      country: row.country,
      admin: row.admin,
      centroid: [row.centroid_lng, row.centroid_lat],
      species_count: row.species_count ?? undefined,
      avg_rating: row.avg_rating ?? null,
      review_count: row.review_count ?? 0,
      water_source: {
        name: row.water_source_name,
        url: row.water_source_url,
        license: row.water_source_license,
      },
      geometry_source: row.geometry_source,
    },
  };
}
