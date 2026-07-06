// Data layer for the AllFish client. Two modes:
//  • API mode (default, full-stack): talks to the Fastify backend.
//  • Static mode (VITE_STATIC=1, for GitHub Pages): reads pre-generated JSON
//    bundled with the site and stores new reviews in the visitor's browser
//    (localStorage). No backend required.
// The component layer imports the same function signatures either way.

export type WaterType = 'lake' | 'pond' | 'river' | 'stream' | 'reservoir';
export type Confidence = 'high' | 'medium' | 'low';

export interface WaterSource { name: string; url: string; license?: string }

export interface WaterbodyProps {
  id: string;
  name: string;
  water_type: WaterType;
  country: 'US' | 'CA';
  admin: string | null;
  centroid: [number, number];
  species_count?: number;
  avg_rating: number | null;
  review_count: number;
  salinity?: 'fresh' | 'salt' | 'mixed' | null;
  salinity_basis?: string | null;
  water_source: WaterSource;
  geometry_source?: string;
  speciesIds?: string[];
}

export interface WaterbodyFeature {
  type: 'Feature';
  id: string;
  geometry: GeoJSON.Geometry;
  properties: WaterbodyProps;
}

export interface FeatureCollection {
  type: 'FeatureCollection';
  attribution: string;
  features: WaterbodyFeature[];
}

export interface SpeciesLink {
  id: string;
  common_name: string;
  scientific_name: string | null;
  category: string | null;
  evidence: string | null;
  confidence: Confidence;
  source_name: string;
  source_url: string;
  source_publisher: string | null;
}

export interface Review {
  id: number;
  author: string;
  rating: number;
  target_species: string | null;
  body: string;
  created_at: string;
}

export interface WaterbodyDetail {
  id: string;
  name: string;
  water_type: WaterType;
  country: 'US' | 'CA';
  admin: string | null;
  description: string | null;
  centroid_lng: number;
  centroid_lat: number;
  min_lng: number;
  min_lat: number;
  max_lng: number;
  max_lat: number;
  geometry?: GeoJSON.Geometry; // present from the API; omitted in the static build (client doesn't render it)
  salinity: 'fresh' | 'salt' | 'mixed' | null;
  salinity_basis: string | null;
  water_source_name: string;
  water_source_url: string;
  water_source_license: string;
  geometry_source: string | null;
  species: SpeciesLink[];
  reviews: Review[];
  avg_rating: number | null;
  review_count: number;
}

export interface SpeciesRow {
  id: string;
  common_name: string;
  scientific_name: string | null;
  category: string | null;
  waterbody_count: number;
}

export interface Bbox { minLng: number; minLat: number; maxLng: number; maxLat: number }

const FIREBASE = import.meta.env.VITE_FIREBASE === '1';
// Firebase build also serves water data as static JSON — only reviews differ.
const STATIC = import.meta.env.VITE_STATIC === '1' || FIREBASE;
const BASE = import.meta.env.BASE_URL || '/';

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let msg = `${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// ------------------------------- Static mode -------------------------------
let _fcCache: Promise<FeatureCollection> | null = null;
let _detailCache: Promise<Record<string, WaterbodyDetail>> | null = null;
let _speciesCache: Promise<SpeciesRow[]> | null = null;

const loadFc = () => (_fcCache ??= j<FeatureCollection>(`${BASE}data/waterbodies.geojson`));
const loadDetails = () => (_detailCache ??= j<Record<string, WaterbodyDetail>>(`${BASE}data/details.json`));
const loadSpecies = () => (_speciesCache ??= j<{ species: SpeciesRow[] }>(`${BASE}data/species.json`).then((r) => r.species));

function featureBbox(geom: GeoJSON.Geometry): Bbox {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const visit = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      const [x, y] = c as number[];
      minLng = Math.min(minLng, x); maxLng = Math.max(maxLng, x);
      minLat = Math.min(minLat, y); maxLat = Math.max(maxLat, y);
    } else if (Array.isArray(c)) c.forEach(visit);
  };
  visit((geom as { coordinates: unknown }).coordinates);
  return { minLng, minLat, maxLng, maxLat };
}
const bboxIntersects = (a: Bbox, b: Bbox) =>
  a.maxLng >= b.minLng && a.minLng <= b.maxLng && a.maxLat >= b.minLat && a.minLat <= b.maxLat;

const LS_KEY = (id: string) => `allfish:reviews:${id}`;
function localReviews(id: string): Review[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY(id)) || '[]'); } catch { return []; }
}
function saveLocalReview(id: string, r: Review) {
  const all = localReviews(id);
  all.unshift(r);
  try { localStorage.setItem(LS_KEY(id), JSON.stringify(all)); } catch { /* quota */ }
}

// -------------------------------- Public API -------------------------------
export type WaterFilters = { type?: WaterType; country?: 'US' | 'CA'; species?: string; salinity?: 'fresh' | 'salt' | 'mixed'; hasFish?: boolean };

export async function fetchWaterbodies(
  bbox: Bbox | null,
  filters: WaterFilters = {},
): Promise<FeatureCollection> {
  if (STATIC) {
    const fc = await loadFc();
    const features = fc.features.filter((f) => {
      if (bbox && !bboxIntersects(featureBbox(f.geometry), bbox)) return false;
      if (filters.type && f.properties.water_type !== filters.type) return false;
      if (filters.country && f.properties.country !== filters.country) return false;
      if (filters.salinity && f.properties.salinity !== filters.salinity) return false;
      if (filters.hasFish && !(f.properties.species_count && f.properties.species_count > 0)) return false;
      if (filters.species && !(f.properties.speciesIds || []).includes(filters.species)) return false;
      return true;
    });
    return { ...fc, features };
  }
  const p = new URLSearchParams();
  const r = (n: number) => Number(n.toFixed(5));
  if (bbox) p.set('bbox', [r(bbox.minLng), r(bbox.minLat), r(bbox.maxLng), r(bbox.maxLat)].join(','));
  if (filters.type) p.set('type', filters.type);
  if (filters.country) p.set('country', filters.country);
  if (filters.salinity) p.set('salinity', filters.salinity);
  if (filters.hasFish) p.set('hasFish', '1');
  if (filters.species) p.set('species', filters.species);
  return j<FeatureCollection>(`/api/waterbodies?${p.toString()}`);
}

export async function fetchWaterbody(id: string): Promise<WaterbodyDetail> {
  if (STATIC) {
    const details = await loadDetails();
    const base = details[id];
    if (!base) throw new Error('not_found');
    let extra: Review[] = [];
    if (FIREBASE) {
      try {
        const { getFirestoreReviews } = await import('./firebase');
        extra = await getFirestoreReviews(id);
      } catch (e) { console.warn('[allfish] firestore reviews failed', e); extra = []; }
    } else {
      extra = localReviews(id);
    }
    const baseReviews = Array.isArray((base as { reviews?: Review[] }).reviews) ? (base as { reviews: Review[] }).reviews : [];
    const reviews = [...extra, ...baseReviews];
    const avg = reviews.length ? Number((reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(2)) : null;
    return { ...base, reviews, avg_rating: avg, review_count: reviews.length };
  }
  return j<WaterbodyDetail>(`/api/waterbodies/${encodeURIComponent(id)}`);
}

export async function fetchSpecies(): Promise<SpeciesRow[]> {
  if (STATIC) return loadSpecies();
  return j<{ species: SpeciesRow[] }>(`/api/species`).then((r) => r.species);
}

export async function searchWaterbodies(q: string) {
  if (STATIC) {
    const fc = await loadFc();
    const t = q.toLowerCase();
    return fc.features
      .filter((f) => f.properties.name.toLowerCase().includes(t))
      .slice(0, 20)
      .map((f) => ({
        id: f.id, name: f.properties.name, water_type: f.properties.water_type,
        country: f.properties.country, admin: f.properties.admin,
        centroid_lng: f.properties.centroid[0], centroid_lat: f.properties.centroid[1],
      }));
  }
  return j<{ results: Array<{ id: string; name: string; water_type: WaterType; country: string; admin: string | null; centroid_lng: number; centroid_lat: number }> }>(
    `/api/waterbodies/search?q=${encodeURIComponent(q)}`,
  ).then((r) => r.results);
}

const clean = (s: string) => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

export async function postReview(
  id: string,
  payload: { author: string; rating: number; target_species?: string; body: string },
): Promise<{ review: Review }> {
  if (STATIC) {
    const cleaned = {
      author: clean(payload.author).slice(0, 60),
      rating: Math.max(1, Math.min(5, Math.round(payload.rating))),
      target_species: payload.target_species ? clean(payload.target_species).slice(0, 80) : undefined,
      body: clean(payload.body).slice(0, 2000),
    };
    if (FIREBASE) {
      const { addFirestoreReview } = await import('./firebase');
      return { review: await addFirestoreReview(id, cleaned) };
    }
    const review: Review = {
      id: Date.now(),
      author: cleaned.author,
      rating: cleaned.rating,
      target_species: cleaned.target_species ?? null,
      body: cleaned.body,
      created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };
    saveLocalReview(id, review);
    return { review };
  }
  return j(`/api/waterbodies/${encodeURIComponent(id)}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
