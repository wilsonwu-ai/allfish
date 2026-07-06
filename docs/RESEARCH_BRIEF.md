# AllFish — Decision-Grade Product & Data Strategy Brief

*Prepared by: CPO + Chief Solutions Architect. Date: 2026-07-05. Every factual and licensing claim below is tied to a source URL; confidence is flagged where the underlying source is a third-party estimate or an interpretive judgment.*

---

## 1. Executive Summary

- **The whitespace is real and defensible.** No competitor unifies AllTrails-grade discovery UX + Navionics-grade bathymetry + Fishbrain-grade community + true national-including-Canada coverage in one clean freemium product. onX Fish has the best discovery model but only ~10–11 states; Fishbrain has the community but a hated paywall and cluttered UX; Navionics owns depth data but has no species/social layer; Canada is served almost solely by Angler's Atlas/MyCatch, whose data is authoritative but whose consumer UX lags. (Confirmed by adversarial check — [onX Fish FAQ](https://www.onxmaps.com/fish/app/faq))
- **The #1 category wound is monetization resentment**, and it is AllFish's sharpest wedge: Fishbrain's free tier is "close to unusable" behind a ~$74.99/yr paywall ([GilledIt](https://www.gilledit.com/us/blog/best-fishing-apps)), and Navionics users report subscriptions that "quadrupled" to ~$80 after Garmin moved off one-time purchases ([Apple App Store, CA](https://apps.apple.com/ca/app/navionics-boating/id744920098?see-all=reviews)). Win with an honestly-useful free tier and transparent ~$35–50/yr premium (onX's $34.99/yr is the pricing benchmark — [onX pricing](https://www.onxmaps.com/fish/app/pricing)).
- **The differentiating product primitive is trust: cited data + privacy-preserving sharing.** Anglers deride paid "AI spots" as "dead wrong" and battle bot/catfish profiles, while refusing to expose "honey holes" (spot-burning). MyCatch turned "Secret Spots Stay Secret" into its trust moat ([Angler's Atlas/MyCatch](https://www.anglersatlas.com/mycatch)). AllFish's cited-source-per-species model directly answers the "is this data real?" objection no incumbent has solved.
- **The data foundation is legally shippable today.** US federal hydrography (USGS NHD/NHDPlus HR, WBD, Water Data APIs) is public domain — free to adapt, redistribute, and sell with courtesy attribution only ([USGS Terms of Use](https://www.usgs.gov/faqs/what-are-terms-uselicensing-map-services-and-data-national-map)). Canadian federal + provincial data is permissive with per-source attribution. The single licensing trap is OpenStreetMap (ODbL share-alike) and FishBase / default iNaturalist records (CC-BY-NC) — all three must be architecturally segregated or filtered before they touch a commercial database.
- **MVP is buildable free/no-key and scales cleanly.** MapLibre GL JS + Protomaps/OpenFreeMap basemap (no API key, self-hostable) + PostGIS-served water layers from NHDPlus HR gets to launch at near-zero marginal map cost; the scale path to 100k MAU is self-hosted Protomaps tiles on object storage (Cloudflare R2 / S3), with commercial tile providers as an optional fallback. (Architectural recommendation — see §7 confidence note.)

---

## 2. Competitive Landscape

| Product | Platform | Pricing | Userbase (directional) | Core strength |
|---|---|---|---|---|
| **Fishbrain** | iOS + Android + web | Freemium; Pro ~$9.99/mo / ~$74.99/yr | "15M+"/"11M+" anglers; 10M+ Android installs; ~$65.8M raised | Largest angler community + catch-data corpus (network-effect moat) — [Wikipedia](https://en.wikipedia.org/wiki/Fishbrain), [AppBrain](https://www.appbrain.com/app/fishbrain-fishing-app/com.fishbrain.app) |
| **onX Fish** | iOS + Android + CarPlay | Free tier + Premium $34.99/yr (7-day trial) | Launched MN early 2024; ~10–11 states; parent onX ~$108M funded | Scientific lake-quality/abundance data + best-in-class mapping engineering — [onX pricing](https://www.onxmaps.com/fish/app/pricing) |
| **onWater Fish** | iOS + Android | Free + onWater+ $49.99/yr + Pro $89.99/yr | 224k+ lakes / 201k+ rivers self-reported ("hundreds of thousands" corroborated) | Broadest national all-water coverage; public access kept free — [onWater pricing](https://www.onwaterapp.com/pricing) |
| **Navionics Boating (Garmin)** | iOS + Android + chartplotters | ~$49.99/yr single tier (US/CA + regions) | Dominant marine-cartography brand (Garmin since Oct 2017) | Unmatched-tier bathymetry: SonarChart HD 1 ft (0.5 m) contours + SonarChart Live — [App Store](https://apps.apple.com/us/app/navionics-boating/id744920098) |
| **Omnia Fishing** | web + iOS + Android | Product margin; CORE ~$39/yr, PRO ~$49–59/yr | Founded 2018 MN; ~$9.6M raised; ~100k+ Android installs | "Shop-by-lake" commerce fused with maps/reports — [Omnia PRO](https://www.omniafishing.com/pro) |
| **FishAngler** | iOS + Android | "100% free maps"; ads + VIP ($6.99/mo, $49.99/yr) | 1M+ Play installs (~1.9M est.); 4.8★ | Free-maps wedge + AI fish-ID (866+ species via Fishial.AI) — [Google Play](https://play.google.com/store/apps/details?id=com.fishangler.fishangler) |
| **Angler's Atlas / MyCatch** | web + iOS + Android | Free; revenue via tournaments/science partnerships | ~1M unique visitors/yr; ~13,000 contributors (2019) | Authoritative Canada coverage + "Secret Spots Stay Secret" trust — [IJC](https://www.ijc.org/en/mycatch-lets-anglers-help-scientists-gather-fish-data) |
| **ANGLR** | iOS + Android | Free + PRO + hardware ($29.99 Bullseye) | Niche | Automatic Bluetooth trip capture (hardware+software moat) — [ANGLR](https://www.anglr.com/features) |
| **Fishidy** *(dormant)* | iOS + Android + web | Legacy freemium | Effectively abandoned (safety score 5.5/100) | *Cautionary tale — strong maps didn't survive hardware-parent neglect* — [JustUseApp](https://justuseapp.com/en/app/561498932/fishidy-fishing-maps-app/reviews) |
| **iAngler Tournament** | iOS + Android + web | Tournament hosting / grants (B2B) | Hundreds of tournaments | Fisheries-science + tournament niche (data-partnership model, not a head-to-head competitor) — [How it works](https://www.ianglertournament.info/how-it-works1) |

### The 3 to beat — and how

1. **onX Fish — the model to imitate (map-first discovery).** *Imitate:* species-filtered Lake/River Finder backed by scientific abundance/stocking data, access points, public/private land layers, offline maps, CarPlay, and honest ~$35–50/yr pricing. *Beat:* their ~11-state footprint — go **national + Canada from day one** — and their absence of a real community/catch network.
2. **Fishbrain — the incumbent to beat (the network).** *Imitate:* the social catch feed, community-trained forecasts, and gear/affiliate monetization. *Beat:* attack **UX and trust, not raw network size** — a clean AllTrails-style interface, an honest free tier, cited data, and no paywall-on-everything. Do not fight 11M users head-on; fight their reasons for churn.
3. **Omnia Fishing — the monetization to imitate (shop-by-lake).** *Imitate:* tackle recommendations tied to a specific waterbody + current conditions, converting discovery intent into commerce margin (a hedge against subscription fatigue). *Beat:* Omnia is commerce-first with no social graph and is strongest only in the Upper Midwest — a **discovery-first product with a lighter embedded commerce layer** can own the top of funnel Omnia monetizes.

---

## 3. Voice-of-Customer & Opportunity Map

| Rank | Pain point (evidence) | AllFish opportunity |
|---|---|---|
| 1 | **Paywall-on-everything / all-or-nothing subs.** Fishbrain free tier "close to unusable"; users ask to "pay for specific features… instead of a subscription that unlocks everything." | Genuinely useful free tier (public access + discovery free) + transparent low-cost premium (~$35–50/yr) + optional a-la-carte. Benchmark: onX $34.99/yr. |
| 2 | **Paid "intelligence" is inaccurate.** "AI predicted spots are usually dead wrong, the bite time is typically wrong, and depth charts are about as useless as can be." | **Cited-source-per-species data** + confidence-scored (not overstated) forecasts + transparent provenance badges. This is AllFish's core wedge. |
| 3 | **Spot-burning vs. cold-start tension.** Publicly geotagging catches is a cultural taboo, yet crowdsourced feeds need contributions. | Private/"competitive" default, geo-fuzzed aggregate sharing, MyCatch-style "secret spots stay secret" + conservation framing as the contribution incentive. |
| 4 | **Lost/revoked purchases + offline failures.** Navionics remotely removed the app and gated previously-purchased charts behind new Garmin logins; anglers fish out of cell range. | Offline-first guarantee: downloaded content persists, "you keep what you paid for," no account-gate surprises. |
| 5 | **Fake/bot content + mismatched catches.** "Fish catch photos do not match the scenery… fake bot profiles… insufficient moderator action." | Verified catches (photo/geo/time integrity) + active moderation that kills catfish/bot accounts. |
| 6 | **Cluttered forced redesigns.** FishAngler v5 "over-complicated… busy… difficult to read"; new Navionics "for the bad." | onX-grade clean, glanceable UI; big touch targets; minimal taps to current data; CarPlay/Android Auto. |
| 7 | **Coverage gaps on small inland waters + non-core regions.** Navionics "patchy on smaller waters"; onX Midwest-only. | Deep coverage of the small lakes/rivers/ponds anglers actually fish, plus **Canada + non-Midwest US** beachheads. |

### Representative quotes (with source URLs)

> "The free tier is, by Fishbrain's own user reviews, close to unusable," with maps and bite predictions locked behind a ~$74.99/yr paywall. — [GilledIt, Best Fishing Apps](https://www.gilledit.com/us/blog/best-fishing-apps)

> "$29.99 a year was not so bad but the same features and maps for $79.99?!?!?" … "subscription prices have quadrupled since I first looked into Navionics four years ago." — [Navionics Boating reviews, Apple App Store (CA)](https://apps.apple.com/ca/app/navionics-boating/id744920098?see-all=reviews)

> "Our promise to anglers is that Secret Spots Stay Secret." — [Angler's Atlas / MyCatch](https://www.anglersatlas.com/mycatch)

*Praise anglers do defend (build to match): Navionics chart detail ("It's kept me off the rocks" — [App Store CA](https://apps.apple.com/ca/app/navionics-boating/id744920098?see-all=reviews)); onX's clean UI + offline + honest pricing ([onX Fish app](https://www.onxmaps.com/fish/app)); Omnia's self-funding Pro membership ([Omnia PRO](https://www.omniafishing.com/pro)).*

---

## 4. Water-Body Data Strategy — United States

**Recommended core (public domain — fully shippable, attribution requested not required):**

| Layer | Source | Role | Format / access |
|---|---|---|---|
| **Geometry + identity backbone** | **USGS NHDPlus High Resolution** (National Release 2, Feb 2025) | Rivers/streams/lakes/ponds at 1:24k + routing/catchments. Keys: `Permanent_Identifier`, `ReachCode`, `NHDPlusID`, `GNIS_ID`/`GNIS_Name` | GeoPackage/FileGDB by HU4 — [NHDPlus HR](https://www.usgs.gov/national-hydrography/nhdplus-high-resolution), [Access page](https://www.usgs.gov/national-hydrography/access-national-hydrography-products) |
| **Watershed context** | **USGS Watershed Boundary Dataset (WBD)** | HUC2→HUC12 nesting; free national watershed navigation + download tiling | Same TNM channels — [Access](https://www.usgs.gov/national-hydrography/access-national-hydrography-products) |
| **Real-time state** | **USGS Water Data OGC API** (modern NWIS replacement) | Live streamflow/gage-height joined to reaches via ReachCode/NHDPlusID | Free API key at [api.waterdata.usgs.gov/signup](https://api.waterdata.usgs.gov/); GeoJSON — [Water Data APIs](https://www.usgs.gov/tools/usgs-water-data-apis) |
| **Regulatory/QA (optional)** | **EPA WATERS / NHDPlus V2 + ATTAINS** | Impaired-water flags; national medium-res modeling | [EPA NHDPlus](https://www.epa.gov/waterdata/get-nhdplus-national-hydrography-dataset-plus-data) |

**Required attribution string (US federal):** courtesy credit only — e.g., *"Data: U.S. Geological Survey (NHD/NHDPlus HR/WBD) and U.S. EPA."* No license fee, no restriction ([USGS Terms of Use](https://www.usgs.gov/faqs/what-are-terms-uselicensing-map-services-and-data-national-map)).

**Ingestion approach:** GDAL/`ogr2ogr` GeoPackage→PostGIS ETL; use HyRiver `pynhd` for NHDPlus HR pulls/network navigation and `dataretrieval` (migrated to the new api.waterdata.usgs.gov endpoints) for gage time series. Serve to clients as Mapbox Vector Tiles via Tippecanoe/`pg_tileserv`/Martin. Anchor dataset versions/citations to USGS ScienceBase DOIs for provenance.

**Critical guardrails / timeline notes:**
- **NHD was retired Oct 1, 2023** and NHDPlus HR production halted in favor of the **3D Hydrography Program (3DHP)** — but NHD/NHDPlus HR remain stable, downloadable "bridge" datasets for years. Use NHDPlus HR as the MVP base; adopt 3DHP per-region as coverage matures ([About National Hydrography Products](https://www.usgs.gov/national-hydrography/about-national-hydrography-products)).
- **Do NOT build on legacy `waterservices.usgs.gov`** — decommissioned Q1 2027 (NWISWeb ends ~March 2026). Build on the OGC API from day one ([decommission notice](https://waterdata.usgs.gov/blog/api-waterservices-decom/)).
- **OpenStreetMap is the one US trap:** ODbL 1.0 (attribution + share-alike). Keep it in a **physically separate store**, use it only for supplemental coverage/naming or rendered tiles ("Produced Works" = attribution only) — never bulk-merge into the public-domain database ([OSM copyright](https://www.openstreetmap.org/copyright)).

---

## 5. Water-Body Data Strategy — Canada

**Recommended tiered-authority ingestion:**

| Tier | Source | License | Identity keys / access |
|---|---|---|---|
| Provincial (best where it exists) | **BC Freshwater Atlas (FWA)** — connected network | **OGL – British Columbia** | `FWA_WATERSHED_CODE`, `BLUE_LINE_KEY`; EPSG:3005 — [BC Data Catalogue](https://catalogue.data.gov.bc.ca/dataset/freshwater-atlas-stream-network) |
| Provincial | **Ontario Hydro Network (OHN)** — full-res Waterbody/Watercourse | **OGL – Ontario** | `OGF_ID`; [Ontario GeoHub](https://geohub.lio.gov.on.ca/datasets/mnrf::ontario-hydro-network-ohn-waterbody/about) |
| Provincial | **Québec GRHQ / GRHQ-HR** | **CC-BY 4.0 (Québec)** — *not* an OGL | per-UDH tiles; [Données Québec](https://www.donneesquebec.ca/recherche/dataset/grhq) |
| National fill | **Canadian Hydrospatial Network (CHN)** — active successor (rolling by watershed) | **OGL – Canada** | GeoPackage; [Open Gov Portal](https://open.canada.ca/data/en/dataset/ae385105-e48c-4b54-bd0f-dfb7303301cb) |
| National fill (frozen 2022) | **National Hydrographic Network (NHN)** — bridge baseline | **OGL – Canada** | `nid` key; [Open Gov Portal](https://open.canada.ca/data/en/dataset/a4b190fe-e090-4e6d-881e-b87956c07977) |
| Topographic (multiscale) | **CanVec Hydro Features** | **OGL – Canada** | [Open Gov Portal](https://open.canada.ca/data/en/dataset/9d96e8c9-22fe-4ad2-b5e8-94a6991b744b) |

**Approach:** prefer provincial networks (FWA/OHN/GRHQ — these *feed* the federal NHN, so they're as-good-or-fresher) for geometry + stable identity; fill the rest (territories, seams) with CHN where published, NHN otherwise; converge everything to GeoPackage, preserve each source's native identity key + a provenance/license column per feature. Harvest via the open.canada.ca CKAN Action API; poll CHN/OHN/FWA/GRHQ for updates (NHN is pinned/frozen).

**Required attribution block (assemble only lines for sources actually ingested):**
- NHN / CHN / CanVec → **"Contains information licensed under the Open Government Licence – Canada."** (link to [open.canada.ca/en/open-government-licence-canada](https://open.canada.ca/en/open-government-licence-canada))
- BC FWA → **"Contains information licensed under the Open Government Licence – British Columbia."**
- Ontario OHN → **"Contains information licensed under the Open Government Licence – Ontario."**
- Québec GRHQ → **"Source: Géobase du réseau hydrographique du Québec (GRHQ), © Gouvernement du Québec, licensed under CC-BY 4.0."**
- OpenStreetMap (if used) → **"© OpenStreetMap contributors"** (link to openstreetmap.org/copyright) + ODbL notice for any distributed derivative database.

**Licensing guardrail:** the four government/CC-BY licenses are permissive and commercial-friendly **but each needs its own credit line** — they cannot collapse into one generic attribution. OSM's ODbL adds share-alike; keep it isolated. *Flag: ODbL "derivative database" vs. "produced work" interpretation for a commercial product is a legal question — verify with counsel before launch (per standard practice on jurisdiction-specific IP terms).*

---

## 6. Fish-Species Attribution Strategy

**The defensible design layers four source types — no single database is sufficient.** Show the user a **source badge per species**, so every "this lake has X" claim is individually cited.

| Layer | Role | Source(s) | Geolocation model | License note |
|---|---|---|---|---|
| **(A) Authoritative presence** | The gold standard — natively keyed to a named waterbody, from the management agency | State/provincial **survey + stocking**: MN DNR LakeFinder, WI DNR, TX PWD, PA F&B, CA DFW, Ontario Fish ON-Line, BC FFSBC | Native waterbody ID (MN DOW #, TX WB_code, Ontario waterbody id) | US state = public record (confirm reuse per agency); **Ontario = OGL-Ontario, explicitly commercial-OK**; BC FFSBC = no open license found (confirm) |
| **(B) Observed occurrence** | Geolocated points spatial-joined to the waterbody polygon/bbox | **GBIF** + **iNaturalist** | Lat/long → bbox/polygon join | **Filter to CC0/CC-BY for commercial use** — default is often CC-BY-NC |
| **(C) Native-vs-introduced flag** | "Is this fish non-native/invasive here?" | **USGS NAS** (by HUC8) | HUC + locality | **Public domain** ([NAS API](https://nas.er.usgs.gov/api/documentation.aspx)) |
| **(D) Reference/validation** | Name reconciliation, native range, conservation status | **FishBase**, **NatureServe** | Country / subnational only (NOT waterbody) | **FishBase = CC-BY-NC (non-commercial) — internal validation only**; NatureServe coarse data CC-BY |

**The citation model (source-per-waterbody-per-species):**
1. **Waterbody gazetteer** table stores every source's native key per lake (MN DOW #, TX WB_code, HUC8, USGS GNIS ID, Ontario waterbody id, lat/long centroid + polygon). All joins and citations key off this backbone.
2. **Per (waterbody, species) row** stores: the species name (reconciled via FishBase internally), an **evidence-type tag** (`stocked` vs. `surveyed/present` vs. `observed`), a **date**, and a **cited source** (agency URL keyed to the waterbody's own ID, or a **GBIF Download DOI** minted from a per-waterbody bounding-box query).
3. **GBIF Download API is the canonical citation engine for occurrence layers** — run one bbox/polygon download per lake, store the returned DOI, render *"Source: GBIF.org occurrence download https://doi.org/…"* (permanent, machine-citable). ([GBIF citation guidelines](https://www.gbif.org/citation-guidelines))
4. **Instant first-draft list for any waterbody worldwide:** iNaturalist `/v1/observations/species_counts?taxon_id=47178&quality_grade=research` + bbox — then upgrade to agency-sourced lists where available.

**Honesty requirements baked into the model:** distinguish **"stocked" (intentional additions, often put-and-take trout that may not persist) from "present/self-sustaining"** (surveys + occurrence data). Tag each species with evidence-type + date so the citation is honest. Enrich with USGS NAS (native-vs-introduced badge) and NatureServe (species-at-risk badge).

**Commercial license guardrail (do before launch):** FishBase is CC-BY-NC and a large share of iNat/GBIF records default to CC-BY-NC. If monetized: filter GBIF/iNat to `license=CC0_1_0,CC_BY_4_0` only; use FishBase for internal validation only (or get written permission); prefer Ontario OGL for Canadian presence data. Angler's Atlas/MyCatch is proprietary/NDA-only — treat as a partnership channel, not a drop-in cited source.

---

## 7. Map Technology Recommendation

> **Confidence note:** This section is a synthesized architectural recommendation drawing on the ingestion research (which named Mapbox Vector Tiles, Tippecanoe, `pg_tileserv`). There was no dedicated map-tech research thread, so treat the specific vendor/cost figures as directional engineering judgment to validate in a spike, not audited numbers.

**MVP stack (free / no-key where possible):**
- **Rendering client:** **MapLibre GL JS** (open-source, no API key, no per-load fee) — the open fork of Mapbox GL, works on web + React Native.
- **Basemap:** **Protomaps** (single-file PMTiles served from object storage, no tile-server, no key) or **OpenFreeMap** (free hosted OSM tiles). Both avoid Mapbox/Google per-load billing. *OSM-derived basemaps carry ODbL — attribute "© OpenStreetMap contributors"; the rendered basemap is a "Produced Work" (attribution only), and it stays visually separate from the public-domain water data.*
- **Custom water + species layers:** **PostGIS** (NHDPlus HR geometry, gazetteer, species citations) → vector tiles via **Martin** or **`pg_tileserv`**, or pre-baked with **Tippecanoe** to PMTiles. This is the AllFish-owned, public-domain layer rendered on top of the basemap.
- **Real-time overlays:** USGS Water Data OGC API (GeoJSON) fetched client-side and layered on demand.

**Scale path to 100k MAU:**
- **Tiles:** Bake water/species layers to **PMTiles on Cloudflare R2 or S3 + CDN** — serving is flat storage + egress, not per-request map billing. Protomaps/PMTiles was designed precisely to make map serving cheap at scale (no dynamic tile server to autoscale).
- **Cost posture:** Self-hosted PMTiles on R2 (zero egress fees) keeps map cost roughly **flat regardless of MAU** — the dominant cost becomes storage (tens of GB) + occasional rebuilds, not traffic. Contrast: Mapbox/Google Maps bill per map load and can run into **five-to-six figures/year at 100k MAU** — keep them as an optional premium-tile fallback, not the default.
- **Bathymetry:** depth data is table stakes, not a build-from-scratch differentiator. **License Navionics/Garmin or C-MAP contours** (as onWater and Omnia do) for the premium tier rather than out-surveying Garmin. *(Note: the specific claim that Omnia/onWater license Navionics was flagged unverified in adversarial check — confirm the exact partner terms during the bathymetry spike.)*
- **Compute:** managed PostGIS (e.g., Neon/RDS) + a stateless tile/edge layer scales horizontally; the gazetteer + citation tables are small relative to geometry.

**Net:** launch at near-zero marginal map cost with MapLibre + Protomaps + PostGIS, and the scale path (PMTiles on R2) preserves that economics through 100k MAU — the money goes to licensed bathymetry and data ops, not map rendering.

---

## 8. Recommended Seed Dataset

These entries were verified with **live data pulls on 2026-07-05** and are ready to seed the app **verbatim**. Each has a cited species source; water existence is proven either by the agency waterbody record itself (MN/TX/WI) or by USGS/provincial hydrography (GNIS/NHD) for the occurrence-derived lakes.

**Honesty flag:** Only these **5** were adversarially verified with live pulls. I am deliberately **not** inventing 3–5 more to force the count to "6–10," per the no-invention quality bar. To reach 6–10, run the identical repeatable recipe below (each additional lake is ~1 API call). The 5 below are launch-grade today.

| # | Waterbody | Type | Region | Documented species (source) | Species source URL | Water-existence proof |
|---|---|---|---|---|---|---|
| 1 | **Mille Lacs Lake** | Freshwater lake | Minnesota, USA | 21 species from MN DNR standardized **survey** (walleye, northern pike, muskellunge, smallmouth & largemouth bass, yellow perch, tullibee/cisco, burbot, black crappie, bluegill, rock bass, pumpkinseed, white sucker, shorthead redhorse, bowfin, common carp, 3 bullhead spp., green sunfish, hybrid sunfish) | [MN DNR LakeFinder report, DOW 48000200](https://www.dnr.state.mn.us/lakefind/showreport.html?downum=48000200) · [API](http://services.dnr.state.mn.us/api/lakefinder/by_id/v1?id=48000200) | Agency waterbody record (DOW 48000200) = same source; also USGS NHD/GNIS |
| 2 | **Inks Lake** | Freshwater reservoir | Texas, USA (Colorado River, Burnet/Llano Cos.) | TPWD **stocking** history 1969–2024: largemouth (incl. Florida & ShareLunker), striped & hybrid striped bass (Sunshine/Palmetto), channel & blue catfish, walleye, rainbow trout, muskellunge, northern pike, coho salmon | [TPWD Stocking History, WB_code 0379](https://tpwd.texas.gov/fishboat/fish/action/stock_bywater.php?WB_code=0379) | TPWD waterbody record (WB_code 0379); USGS NHD/GNIS |
| 3 | **Little Granite Lake** | Freshwater lake | Barron County, Wisconsin, USA | WI DNR 2025 **stocking**: Rainbow Trout (2,961 yearling + 170 adult broodstock; put-and-take) | [2025 WI DNR Catchable Trout Stocked Final Report (PDF)](https://dnr.wisconsin.gov/sites/default/files/topic/Fishing/CatchableTroutStocking2025.pdf) · [WI Stocking Summary](https://apps.dnr.wi.gov/fisheriesmanagement/Public/Summary) | WI DNR report waterbody entry; USGS NHD/GNIS |
| 4 | **Lake Tahoe** | Freshwater alpine lake | California / Nevada, USA | Research-grade iNat **occurrence**: kokanee, Lahontan redside, speckled dace, rainbow/brown/brook/lake trout, Tahoe sucker, bluegill, Lahontan cutthroat trout, largemouth bass, black crappie, brown bullhead, Paiute sculpin, Lahontan tui chub, mountain whitefish, striped bass, goldfish, fathead minnow | [iNaturalist species_counts, Tahoe bbox](https://api.inaturalist.org/v1/observations/species_counts?taxon_id=47178&nelat=39.24&nelng=-119.90&swlat=38.90&swlng=-120.18&quality_grade=research) | USGS NHD/GNIS (named lake); geometry via NHDPlus HR |
| 5 | **Okanagan Lake** | Freshwater lake | British Columbia, Canada | Research-grade iNat **occurrence**: kokanee, common carp, largescale sucker, northern pikeminnow, fathead minnow, redside shiner, goldfish, rainbow trout, prickly sculpin, pumpkinseed, largemouth bass, brook trout, peamouth, yellow perch, mountain & lake whitefish, burbot, bull trout | [iNaturalist species_counts, Okanagan bbox](https://api.inaturalist.org/v1/observations/species_counts?taxon_id=47178&nelat=50.30&nelng=-119.40&swlat=49.50&swlng=-119.90&quality_grade=research) · cross-ref stocking: [BC FFSBC gofishbc](https://www.gofishbc.com/stocked-fish/) | BC Freshwater Atlas (named lake); [FWA](https://catalogue.data.gov.bc.ca/dataset/freshwater-atlas-stream-network) |

**Repeatable recipe to reach 6–10 (and beyond):** (a) pick additional named lakes from the gazetteer; (b) for US agency lakes, pull MN LakeFinder by DOW or TPWD by WB_code; (c) for any lake worldwide, hit the iNat `species_counts` endpoint with the bbox + `taxon_id=47178&quality_grade=research`; (d) mint a GBIF Download DOI per bbox for a permanent citation; (e) tag each species `stocked`/`surveyed`/`observed` + date. Each new seed is one API call and inherits the same citation integrity.

**Licensing reminder for seeds 4–5:** iNaturalist observations carry per-record licenses — for commercial display, filter to CC0/CC-BY observations (or cite the observation without copying its media), and prefer OGL-Ontario / agency survey data where available.

---

## 9. Verification Notes (what the adversarial fact-check corrected or flagged)

**Corrected — use the fixed figures:**
- **Fishbrain founding date:** launched **2010** (founders Jens Lindman & Johan Attby, Stockholm), **not 2012** as originally stated. User base best cited as **"11M+"** per Wikipedia rather than the marketing "15M/20M." ([Wikipedia](https://en.wikipedia.org/wiki/Fishbrain))
- **Navionics pricing:** the **$39.99/$49.99/$99.99 three-tier structure is outdated** — current App Store pricing is a **single regional tier around $49.99** (US/Canada + several regions) with higher European tiers. The **"44,000+ inland waters"** count and the claim that **Omnia/onWater license Navionics depth layers** are **unverified** against primary sources — confirm before repeating publicly. Navionics is a dominant benchmark but **not literally "unrivaled"** (Garmin BlueChart/LakeVu, C-MAP, Humminbird LakeMaster all compete). ([App Store](https://apps.apple.com/us/app/navionics-boating/id744920098))
- **FishAngler review metrics:** rates **~4.8/5** across **~12,500–14,000 reviews**, **not 4.6/5 across 28.4K**. FishAngler now **has a paid VIP tier** ($6.99/mo, $49.99/yr) — "completely free with no premium tier" is **historical only**. ([App Store](https://apps.apple.com/us/app/fishangler-fishing-guide-app/id1073941118))
- **NHD GeoPackage availability:** added **March 10, 2022**, not "2023+" (does not affect the core public-domain, bridge-dataset conclusion). ([USGS NHD](https://www.usgs.gov/national-hydrography/national-hydrography-dataset))

**Confirmed (with minor precision):**
- **onX Fish** — $34.99/yr, offline maps, CarPlay, species/trophy filters all verified; footprint is ~**10–11 states** (MN, WI, MI, ND, SD, IN, OH, IL, IA, MO, + now **Montana** — Mountain West, so "Midwest-focused" is more precise than "Midwest-only").
- **onWater Fish** — pricing/feature split verified; the **224k/201k/100k database counts are self-reported marketing stats** (third parties confirm only "hundreds of thousands"); the TU relationship is a **formal distribution partnership** (6 months free onWater+ for new TU members), not a mere endorsement.
- **Fishbrain funding (~$65.8M/8 rounds), AppBrain 10M+ installs, exact Pro pricing** could not be independently re-confirmed (Crunchbase/PitchBook/AppBrain/Helpshift returned HTTP 403) — treat as **directional**.
- **Structural whitespace, MyCatch's Canada position, iAngler's B2B niche** — all confirmed; "owns the position / truest AllTrails for fishing" phrasing is **defensible interpretation, not a primary-source fact**.

**Private-company financials caveat:** Fishbrain and Omnia revenue figures come from third-party estimators (PitchBook/Crunchbase/press) — **directional, not audited**.

**Legal review flags (per §5 boundaries — verify with counsel before commercial launch):**
1. **OpenStreetMap ODbL** share-alike ("derivative database" vs. "produced work") interpretation.
2. **US state-agency reuse terms** — public record ≠ always explicitly open-licensed; confirm per agency (BC FFSBC and Angler's Atlas/MyCatch have **no open license found**).
3. **FishBase CC-BY-NC and default CC-BY-NC on GBIF/iNat** must be filtered/segregated for a monetized product.

**Seed dataset confidence:** the 5 seeds in §8 were verified via live API/PDF pulls on 2026-07-05 (high confidence). Occurrence-derived lists (Tahoe, Okanagan) are **presence-only and effort-biased** (common/photogenic species over-represented) — upgrade to agency survey lists where available.