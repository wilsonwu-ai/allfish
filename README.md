# AllFish 🎣

**AllTrails for anglers.** A map-first web app to discover rivers, lakes, and ponds across the US & Canada — with cited sources for *where the water is* and *what fish are in it*, plus community reports.

> Planning & research docs live in [`docs`](docs): [PRODUCT_PLAN](docs/PRODUCT_PLAN.md) · [ARCHITECTURE](docs/ARCHITECTURE.md) · [DATA_SOURCES](docs/DATA_SOURCES.md) · [SECURITY](docs/SECURITY.md) · [RESEARCH_BRIEF](docs/RESEARCH_BRIEF.md)

## Stack
- **Client:** React + TypeScript + Vite + **MapLibre GL JS** (keyless OpenFreeMap tiles)
- **Server:** Node 22 + **Fastify** + **SQLite** (better-sqlite3), engine-agnostic repo layer (PostGIS-ready)
- **Data:** USGS NHD / NRCan NHN provenance + real **OpenStreetMap** geometry + agency/iNaturalist species citations

## Live demo

Hosted on GitHub Pages (static build — cited data bundled, reviews saved in your browser):
**https://wilsonwu-ai.github.io/allfish/**

## Quick start (full stack, with the live API + database)

```bash
npm install            # installs client + server workspaces

# one-time data setup
npm run fetch:geometry # pull real water-body geometry from OpenStreetMap (needs network)
npm run seed           # load cited seed data + editorial reviews into SQLite

npm run build:client   # build the React app
npm start              # serve API + app at http://localhost:8787
```

Open **http://localhost:8787**.

### Development (hot reload)
```bash
npm run dev:server     # Fastify on :8787 (node --watch)
npm run dev:client     # Vite on :5173, proxies /api → :8787
```

### Build the static (GitHub Pages) version
```bash
npm run build:pages    # exports data to JSON + builds client in static mode → client/dist
# deploy client/dist to any static host; on Pages, reviews persist per-visitor via localStorage
```

## API

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | liveness |
| GET | `/api/stats` | counts |
| GET | `/api/waterbodies?bbox=minLng,minLat,maxLng,maxLat&type=&country=&species=` | GeoJSON FeatureCollection for the viewport |
| GET | `/api/waterbodies/:id` | detail: geometry + cited species + reviews |
| GET | `/api/waterbodies/search?q=` | name search |
| GET | `/api/species` | species list with per-species water counts |
| POST | `/api/waterbodies/:id/reviews` | add an angler report `{author, rating, target_species?, body}` |

## Tests / QA
```bash
npm --workspace client run typecheck   # client type safety
node server/test/api.test.js           # API smoke tests (health, bbox, detail, review write, validation, XSS)
```

## Layout
```
server/   Fastify API, SQLite, cited seed data, geometry fetcher, static exporter, tests
client/   React + MapLibre SPA (API mode + static mode)
docs/     product plan, architecture, data sources, security, research brief
```

## Data & licensing
Water: USGS NHD (US, public domain) / NRCan NHN (CA, OGL-Canada). Geometry: © OpenStreetMap contributors (ODbL). Species: state/provincial fish & wildlife agencies + iNaturalist. See [DATA_SOURCES.md](docs/DATA_SOURCES.md).
