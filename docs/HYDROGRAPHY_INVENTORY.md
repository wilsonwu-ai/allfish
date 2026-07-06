# AllFish — Regional Water-Body Inventory: Methodology & Sources

*How AllFish inventories "all" rivers, ponds, and lakes for a region, classifies each as fresh / salt / mixed, and cites every claim. Applies to the Greater Boston (50-mile radius) and New York State ingestions, and to any future region.*

---

## 1. What "all water bodies" means here (scope)

The inventory targets the water bodies people actually name and fish: **all named lakes, ponds, reservoirs, and rivers**. Explicitly:

- **Included:** every OpenStreetMap feature tagged `natural=water` (lakes/ponds/reservoirs/lagoons) or `landuse=reservoir` **with a name**, and every `waterway=river` **with a name**, within the region.
- **Excluded (by design, not silently):** unnamed micro-ponds and `waterway=stream` brooks. These number in the tens of thousands per region and are mostly unfishable/unnamed noise; they can be added later by relaxing the query. Any feature dropped by the per-region cap is logged, never hidden.

This is the honest, useful interpretation of "everywhere": comprehensive coverage of the *named* hydrography, not every satellite-detected puddle.

## 2. Source of record & citation model

| What | Source | License | How it's cited |
|---|---|---|---|
| **Water exists + geometry + type** | **OpenStreetMap** (Overpass API) | ODbL (© OpenStreetMap contributors) | Each feature stores its **OSM permalink** (`openstreetmap.org/way|relation/<id>`) as `water_source_url` — it documents the feature *and* the tags used to classify it. |
| **Authoritative cross-reference (US)** | USGS National Hydrography Dataset (NHD) | U.S. public domain | Named as the authoritative dataset; OSM is the rendering/geometry layer. |
| **Salinity basis** | OSM `tidal` / `salt` / `water` tags + name | ODbL | Stored per feature as `salinity_basis`; visible in the app. |
| **Coastal/estuary authority** | NOAA (tidal waters), USGS | public domain | Cross-reference for the fresh/salt/mixed call. |
| **Fish species (where enriched)** | State agencies (MassWildlife, NY DEC), iNaturalist, USGS NAS | mixed (cited per record) | Per-species source link + confidence, as elsewhere in AllFish. |

**Attribution shipped:** *"© OpenStreetMap contributors (ODbL)"* on the map, plus per-feature OSM permalinks. US freshwater cross-referenced to USGS NHD (public domain); coastal/tidal classification cross-referenced to NOAA.

## 3. Fresh / salt / mixed classification

Each water body is classified from OpenStreetMap attributes with a conservative rule set, and the **basis is stored and displayed** so the call is auditable:

| Result | Rule (in priority order) | Stored basis |
|---|---|---|
| **Mixed / brackish** | OSM `tidal=yes` or `water=tidal`; or name contains "estuary" | "OSM tidal tag (brackish/estuarine)" / "named estuary" |
| **Salt water** | OSM `salt=yes`; or name contains "salt pond" / "harbor" | "OSM salt=yes tag" / "named salt pond/harbor" |
| **Freshwater** | none of the above (inland lakes/ponds/reservoirs and non-tidal rivers) | "inland freshwater (OSM, no tidal/salt tag)" |

Design choices for **accuracy over false positives:** ambiguous coastal terms ("bay", "cove", "sound") are *not* treated as salt, because they also name bays *of* freshwater lakes — so a "Sandy Bay" on an inland lake is not misclassified. The strongest signal (OSM `tidal`/`salt` tags, which mappers apply to genuinely tidal/coastal features) drives the call; names only escalate on unambiguous terms. Where OSM lacks a tidal tag on a genuinely tidal reach, the reach defaults to freshwater — a known conservative bias, cross-checkable against the cited NOAA tidal data.

The curated flagship waters are set explicitly (e.g., the Fraser River's tidal lower reach = mixed; inland fisheries = fresh).

## 4. Pipeline

```
Overpass (tiled over the region, polite pacing, mirror failover + backoff)
   → parse named natural=water polygons + waterway=river lines
   → classify water_type (lake/pond/reservoir/river) + salinity (fresh/salt/mixed)
   → simplify geometry (Douglas–Peucker) + dedupe (by OSM id; rivers merged by name)
   → INSERT OR REPLACE into SQLite (incremental per-tile → resilient to interruption)
```
Run with: `node server/db/ingest-region.js boston` · `node server/db/ingest-region.js ny`

## 5. Minnows — where we can say "there are minnows here"

"Minnows" = the minnow families **Leuciscidae** (New World minnows, shiners, dace) and **Cyprinidae** (carps & true minnows). AllFish sources minnow presence per water body from **iNaturalist research-grade observations**, queried by the water's bounding box and filtered to those families (`server/db/enrich-minnows.js`). Where minnows are documented, they're added as cited species (category *baitfish*) linked to the exact iNaturalist observation query — so the app shows *which* minnows and links the evidence. Freshwater bodies only (minnows are freshwater). Cross-references for forage/baitfish where available: MassWildlife and NY DEC baitfish/forage lists, and USGS NAS for introduced minnows.

## 6. Results

*(Populated after each ingestion — see the live counts below.)*

| Region | Named waters | Fresh | Salt | Mixed | Rivers | With minnows |
|---|---|---|---|---|---|---|
| Greater Boston (50 mi) | _pending_ | _–_ | _–_ | _–_ | _–_ | _pending_ |
| New York State | _pending_ | _–_ | _–_ | _–_ | _–_ | _pending_ |

## 7. Honest limitations

- Salinity is derived from OSM tags + a conservative heuristic, cross-referenced to NOAA/USGS — not a per-feature hydrographic salinity survey. It is auditable (basis shown) and correct for the overwhelming majority of inland (fresh) and clearly-tidal (mixed) cases; edge cases (untagged tidal reaches, coastal salt ponds without tags) may read fresh.
- Coverage = OSM's named hydrography, which is excellent in the Northeast US but not literally exhaustive.
- Minnow presence reflects where citizen scientists have logged research-grade observations; absence of a record is not proof of absence.
