# AllFish — System Architecture & Scaling Plan

*Companion to [PRODUCT_PLAN.md](./PRODUCT_PLAN.md). Covers the MVP as built and the path to 100k+ users.*

---

## 1. Principles

1. **Open, cost-controlled map stack.** No proprietary map API key on the critical path. MapLibre GL (renderer) + OpenFreeMap/Protomaps (tiles) → self-hostable, so map cost doesn't scale linearly with users.
2. **Engine-agnostic data layer.** The API depends on a repository interface, never on SQLite-specific SQL. Spatial filtering uses plain min/max lng/lat range predicates, so the store swaps to Postgres/PostGIS without touching routes.
3. **Citations are first-class.** Every water body carries water provenance; every species carries its own source + confidence. This is schema, not an afterthought.
4. **Stateless API, cacheable reads.** The read path (viewport → water bodies, detail) is pure and cache-friendly; only reviews write.

## 2. MVP architecture (as built, in `/app`)

```
                         ┌──────────────────────────────────────────┐
 Browser (React SPA)     │  Fastify (Node 22)                        │
 ┌───────────────────┐   │  ┌────────────────────────────────────┐  │
 │ MapLibre GL JS    │   │  │ /api/waterbodies?bbox=…  (GeoJSON) │  │
 │  • OpenFreeMap     │──HTTP─►│ /api/waterbodies/:id     (detail) │  │
 │    vector tiles    │   │  │ /api/waterbodies/:id/reviews (POST)│  │
 │  • water layers    │   │  │ /api/species, /search, /stats     │  │
 │ Rail + Detail panel│◄──────│ static client (client/dist)       │  │
 └───────────────────┘   │  └───────────────┬────────────────────┘  │
        │                 │        repo.js (only SQL lives here)      │
   tiles │ (keyless)      │                  │                        │
        ▼                 │                  ▼                        │
 tiles.openfreemap.org    │        SQLite (better-sqlite3, WAL)       │
                          └──────────────────────────────────────────┘
   Data pipeline (offline):  seed.json  +  OSM/Overpass geometry  ──►  seed.js  ──►  SQLite
   Provenance:  water = USGS NHD / NRCan NHN + per-feature OSM permalink;  species = agency / iNaturalist
```

**Component choices & why:**

| Concern | MVP choice | Rationale |
|---|---|---|
| Renderer | **MapLibre GL JS** | Open-source, WebGL vector rendering, "Google-Maps-like" pan/zoom, no key. |
| Basemap tiles | **OpenFreeMap (liberty)** | Free, no API key, no signup; self-hostable later (Protomaps/PMTiles). |
| API | **Fastify 5** | Fast, schema-based validation built in, first-class plugins (rate-limit, static, cors). |
| Store | **SQLite (better-sqlite3, WAL)** | Zero-ops for MVP; synchronous, fast; WAL gives concurrent reads during writes. |
| Geometry source | **OSM via Overpass**, cached to `geometry-cache.json` | Real, recognizable shapes + a per-feature permalink citation; deterministic re-seeds. |
| Spatial query | **bbox range predicate** on indexed min/max lng/lat | Portable to any SQL engine; no spatial extension needed at MVP size. |

## 3. Data model

`waterbody` (id, name, type, country, admin, centroid, **bbox columns (indexed)**, geometry GeoJSON, **water_source_{name,url,license}**, geometry_source) · `species` (id, common/scientific name, category) · `waterbody_species` (**per-link citation**: evidence, confidence, source_{name,url,publisher}) · `review` (author, rating, target_species, body, status, created_at).

The `waterbody_species` join table is the citation engine: the same species carries a *different* source per water body (a walleye in Mille Lacs cites the MN DNR survey; a fathead minnow in Tahoe cites an iNaturalist research-grade query).

## 4. The read path is the hot path

99% of traffic is `GET /api/waterbodies?bbox=…` fired on every map `moveend`, plus `GET /api/waterbodies/:id`. Both are:
- **Idempotent & pure** → cacheable at the edge/CDN keyed on rounded bbox + filters.
- **Bounded** → `limit` capped (max 2000), bbox validated, so a hostile huge query can't exhaust the DB.

Writes (`POST reviews`) are rare, small (32 KB body cap), and rate-limited (10 / 5 min / IP).

## 5. Scaling path — 10 → 1,000 → 100,000+ users

The design deliberately front-loads the choices (open tiles, stateless reads, portable spatial queries) that make each step a swap, not a rewrite.

### Stage A — ~10 users (today)
- Single Node process serves API **and** static client. SQLite file. OpenFreeMap public tiles.
- **Cost:** ~$5–10/mo (one small VM) or a free tier. **Ops:** none.
- Bottleneck: none. This is the demo in this repo.

### Stage B — ~1,000 users
- **Split tiers:** static client → CDN (Cloudflare/Netlify); API stays a single stateless Node instance behind the CDN.
- **Cache the read path:** CDN + `Cache-Control` on `GET /waterbodies` (bbox snapped to a grid) and `/species`. Most map pans become edge hits.
- **DB:** still SQLite (read-heavy, WAL handles it) **or** migrate to managed Postgres now for headroom. Reviews volume is trivial.
- **Cost:** ~$25–60/mo. Bottleneck: single API node CPU on GeoJSON serialization → mitigated by caching.

### Stage C — 100,000+ users
- **API:** horizontally scaled stateless Node behind a load balancer / autoscaler (Fastify is stateless; no session affinity). Target: N replicas, health-checked.
- **DB → PostgreSQL + PostGIS:** add a `geometry(Geometry,4326)` column + **GiST spatial index**; replace the bbox range predicate with `ST_Intersects(geom, ST_MakeEnvelope(...))`. Because all SQL is in `repo.js`, this is one module's change. Add **read replicas** for the read-heavy workload; primary handles review writes.
- **Cache:** Redis for hot bbox tiles + detail JSON; CDN in front of the read API. Reviews invalidate only their water body's detail key.
- **Map tiles → self-hosted:** generate vector tiles from NHDPlus HR + NHN with **tippecanoe**, serve as **PMTiles from object storage (Cloudflare R2 / S3) behind a CDN**. Map delivery cost becomes ~flat storage+egress, not per-request to a vendor. This is how AllTrails/Strava-class apps keep map COGS sane.
- **Water-body layer at zoom scale:** precompute **server-side vector tiles** for the water layer (or Postgres `ST_AsMVT`) instead of GeoJSON, so the client fetches tiles, not features — constant payload regardless of dataset size (millions of NHD waters).
- **Ingestion:** batch pipeline (Airflow/cron) pulls NHDPlus HR + NHN by HUC/region, normalizes, loads to PostGIS; species enrichment jobs hit agency/GBIF/iNaturalist APIs with the citation captured per record.
- **Cost:** scales with egress + DB size; the open-tile + CDN + replica pattern keeps it sub-linear to users.

### Scaling summary table

| Users | Client | API | DB | Tiles | Cache |
|---|---|---|---|---|---|
| 10 | served by API | 1 Node process | SQLite (WAL) | OpenFreeMap public | none |
| 1,000 | CDN static | 1 stateless Node | SQLite → managed PG | OpenFreeMap public | CDN read-path |
| 100k+ | CDN static | N replicas + LB | **PostGIS + read replicas** | **self-host PMTiles on R2/S3 + CDN** | **Redis + CDN + MVT** |

## 6. Reliability & stability guardrails (already in the MVP)

- **Input validation** (JSON schema) on every route; bbox parsed and sanity-checked (`min<max`), `limit` clamped → no unbounded scans.
- **Rate limiting** global (300/min) + strict on writes (10/5min); **32 KB body cap** blunts payload abuse.
- **Graceful map degradation:** if tiles are slow/unreachable, the app shows a banner and the water data/list still work.
- **WAL + busy_timeout** so a write never blocks reads to failure.
- **Deterministic, offline-safe seeding:** geometry is cached to disk; the fallback generator guarantees seeding never fails without network.

## 7. What I would harden before a public launch

Auth + accounts, review moderation/spam defense (captcha or proof-of-work on write, trust scoring), per-IP abuse analytics, PostGIS from the start if launching with full NHD ingestion, observability (structured logs → metrics/traces), and a CDN with a real cache policy. See [SECURITY.md](./SECURITY.md).
