// SQLite data layer for the AllFish MVP.
//
// Design note (scalability): SQLite is the MVP store. The schema and the
// repository API in repo.js are deliberately engine-agnostic — every bbox
// query uses plain min/max lng/lat range predicates (not SQLite-only spatial
// functions), so migrating to Postgres/PostGIS later is a driver swap plus a
// `geometry(Geometry,4326)` column and a GiST index. See docs/ARCHITECTURE.md.

import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ALLFISH_DATA_DIR || join(__dirname, '..', 'db');
mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = process.env.ALLFISH_DB || join(DATA_DIR, 'allfish.sqlite');

let _db = null;

/** @returns {import('better-sqlite3').Database} */
export function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL'); // concurrent reads while writing
  _db.pragma('foreign_keys = ON');
  _db.pragma('busy_timeout = 5000');
  migrate(_db);
  return _db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS waterbody (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      water_type    TEXT NOT NULL CHECK (water_type IN ('lake','pond','river','stream','reservoir')),
      country       TEXT NOT NULL CHECK (country IN ('US','CA')),
      admin         TEXT,                       -- state / province
      description   TEXT,
      centroid_lng  REAL NOT NULL,
      centroid_lat  REAL NOT NULL,
      -- Bounding box for engine-agnostic spatial filtering (indexed).
      min_lng       REAL NOT NULL,
      min_lat       REAL NOT NULL,
      max_lng       REAL NOT NULL,
      max_lat       REAL NOT NULL,
      geometry_json TEXT NOT NULL,              -- GeoJSON geometry (Polygon/MultiPolygon/LineString)
      -- Provenance for the WATER itself (required by product spec).
      water_source_name    TEXT NOT NULL,
      water_source_url     TEXT NOT NULL,
      water_source_license TEXT NOT NULL,
      geometry_source      TEXT,                -- where the rendered geometry came from (e.g. OpenStreetMap)
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_wb_bbox ON waterbody (min_lng, max_lng, min_lat, max_lat);
    CREATE INDEX IF NOT EXISTS idx_wb_country ON waterbody (country);
    CREATE INDEX IF NOT EXISTS idx_wb_type ON waterbody (water_type);

    CREATE TABLE IF NOT EXISTS species (
      id            TEXT PRIMARY KEY,
      common_name   TEXT NOT NULL,
      scientific_name TEXT,
      category      TEXT                         -- e.g. gamefish, panfish, baitfish, trout, salmon
    );

    -- Per-waterbody species presence, each with its OWN citation (product spec:
    -- cite the source for *why we believe this species is in this water*).
    CREATE TABLE IF NOT EXISTS waterbody_species (
      waterbody_id  TEXT NOT NULL REFERENCES waterbody(id) ON DELETE CASCADE,
      species_id    TEXT NOT NULL REFERENCES species(id) ON DELETE CASCADE,
      evidence      TEXT,                         -- 'stocking record','survey','angler reports','occurrence data'
      confidence    TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high','medium','low')),
      source_name   TEXT NOT NULL,
      source_url    TEXT NOT NULL,
      source_publisher TEXT,
      PRIMARY KEY (waterbody_id, species_id)
    );
    CREATE INDEX IF NOT EXISTS idx_wbs_species ON waterbody_species (species_id);

    CREATE TABLE IF NOT EXISTS review (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      waterbody_id  TEXT NOT NULL REFERENCES waterbody(id) ON DELETE CASCADE,
      author        TEXT NOT NULL,
      rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      target_species TEXT,
      body          TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden','flagged')),
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_review_wb ON review (waterbody_id, status);
  `);
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
