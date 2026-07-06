# AllFish — Data Sources, Licensing & Citation Model

*All licensing facts below were gathered and **adversarially fact-checked** by the `allfish-research` workflow (10 CONFIRMED / 2 PARTIALLY-TRUE / 0 REFUTED). See [RESEARCH_BRIEF.md](./RESEARCH_BRIEF.md) for the full cited research and per-claim verification.*

---

## 1. The citation model (why AllFish is different)

Every claim the app makes is separately sourced:

- **"There is water here."** → each `waterbody` stores `water_source_{name,url,license}`. In the app this renders as *"Water body confirmed by USGS National Hydrography Dataset · OpenStreetMap feature ↗"* — the OSM permalink (e.g. `openstreetmap.org/relation/1823287`) is captured at geometry-fetch time, so the citation points at the **exact feature** whose shape is drawn.
- **"This species is in this water."** → each `waterbody_species` link stores its **own** `evidence`, `confidence`, and `source_{name,url,publisher}`. The same species cites different evidence in different waters. Confidence renders as a badge: **Documented** (high) / **Reported** (medium) / **Unconfirmed** (low).

This is the direct implementation of the two requirements: *cite the source that shows there is water, and cite the source for why we believe a species is there.*

## 2. Water-body geometry & identity

### United States
| Source | What it provides | Format / access | License |
|---|---|---|---|
| **USGS National Hydrography Dataset (NHD) / NHDPlus HR** | Rivers, streams, lakes, ponds, reservoirs at 1:24,000; value-added routing | GeoPackage/Shapefile/services — [access](https://www.usgs.gov/national-hydrography/access-national-hydrography-products) | **U.S. Government public domain** — free to adapt, redistribute, sell; courtesy attribution only ([USGS Terms](https://www.usgs.gov/faqs/what-are-terms-uselicensing-map-services-and-data-national-map)) |
| **USGS Watershed Boundary Dataset (WBD)** | HUC2–HUC12 watershed polygons | same hub | Public domain |
| **USGS Water Data OGC API** (NWIS successor) | Real-time + historical gage streamflow/height | [API hub](https://api.waterdata.usgs.gov/) | Public domain |

### Canada
| Source | What it provides | License |
|---|---|---|
| **NRCan National Hydrographic Network (NHN)** | Rivers, lakes, ponds; national coverage — [dataset](https://open.canada.ca/data/en/dataset/a4b190fe-e090-4e6d-881e-b87956c07977) | **Open Government Licence – Canada** (attribution required) |
| Provincial hydro (e.g. **BC Freshwater Atlas**, Ontario Hydro Network) | Higher-resolution provincial water | OGL-BC / OGL-Ontario (attribution) |

### Rendering geometry (both countries)
**OpenStreetMap** (`natural=water`, `waterway=*`) via Overpass — used for the actual polygons/lines drawn on the map and the per-feature permalink citation. **License: ODbL (share-alike).** ⚠️ ODbL is a share-alike/attribution obligation: OSM-derived geometry must stay attributed and must not be silently merged into a proprietary dataset. Kept as a clearly-labeled rendering layer, separate from public-domain NHD/NHN identity.

## 3. Fish species per water body

| Source | What it gives | Geolocated? | License / note |
|---|---|---|---|
| **State/Provincial fish & wildlife agencies** (MN DNR LakeFinder, TPWD stocking, WI DNR, CA DFW, NV DOW, ODFW, Ontario, Alberta, DFO, BC FFSBC) | Authoritative species lists, surveys, **stocking records** per named water | ✅ per water body | Government content; cite the agency page. **The gold standard** — highest confidence. |
| **iNaturalist** | Research-grade fish observations within a bbox | ✅ via bbox query | Observations vary (many **CC-BY-NC**); we link to the *query*, not redistribute records. Surfaces baitfish/**minnows** (fathead minnow, redside shiner, pikeminnow). |
| **GBIF** | Aggregated occurrence records | ✅ coordinates | Mixed CC licenses; good for range/presence, cite dataset. |
| **USGS NAS** | Nonindigenous/invasive aquatic species | ✅ | Public domain; important for "what's invasive here". |
| **FishBase / NatureServe** | Taxonomy, traits, ranges | ✗ per-water | **CC-BY-NC (FishBase)** — reference only; do **not** put in a commercial DB. |

### Attribution strings the app ships
- Map data: **`© OpenStreetMap contributors (ODbL)`** + `OpenFreeMap · OpenMapTiles` (rendered by MapLibre's attribution control).
- API responses carry: *"Water: USGS NHD (US) / NRCan NHN (CA) · Geometry © OpenStreetMap contributors (ODbL) · Species: state/provincial fish & wildlife agencies."*
- Canadian water requires the **OGL-Canada** attribution: *"Contains information licensed under the Open Government Licence – Canada."*

## 4. Licensing traps (must-segregate)

The single licensing risk, flagged by the research, is mixing share-alike / non-commercial data into a commercial database:
1. **OSM = ODbL (share-alike).** Keep as a rendering/citation layer; don't merge into a proprietary identity DB.
2. **FishBase & default iNaturalist records = CC-BY-NC.** Link out / cite; never store as if owned. Prefer public-domain agency + NAS data as the commercial backbone.

## 5. The 13 seeded, cited water bodies (MVP)

8 US states + 4 Canadian provinces, spanning lakes, reservoirs, and rivers, each with real OSM geometry and cited species:

Lake Minnetonka (MN), Mille Lacs Lake (MN, deep-link survey cite), Lake of the Woods (MN/ON), Lake Tahoe (CA/NV, iNaturalist incl. fathead minnow), Lake Guntersville (AL), Chautauqua Lake (NY), Deschutes River (OR), Inks Lake (TX, TPWD stocking deep-link), Lake Simcoe (ON), Lake Nipissing (ON), Bow River (AB), Fraser River (BC), Okanagan Lake (BC, iNaturalist incl. redside shiner/pikeminnow).
