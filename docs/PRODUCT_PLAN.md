# AllFish — Product & Solutions-Architecture Plan
*Author role: Chief Product Officer + Chief Solutions Architect. Companion documents: [ARCHITECTURE.md](./ARCHITECTURE.md), [DATA_SOURCES.md](./DATA_SOURCES.md), [SECURITY.md](./SECURITY.md), [RESEARCH_BRIEF.md](./RESEARCH_BRIEF.md).*

---

## 1. One-line vision

**AllTrails for anglers.** A map-first web app to discover every river, lake, and pond across the US and Canada — with a cited, trustworthy answer to two questions incumbents don't answer honestly: *"Is there really water here?"* and *"What actually swims in it?"* — plus community reports on what the fishing is like.

## 2. The North Star Metric

> **North Star Metric (NSM): Weekly Cited Water Interactions (WCWI)** — the count of distinct *(user × water body)* interactions per week in which the user opens a water body that carries **at least one cited data source** (water provenance and/or a cited species), or contributes a report to one.

Why this metric and not "MAU" or "catches logged":

- It is only earned when the **data is real and cited.** A water body with no provenance can't generate WCWI, so the metric structurally rewards the mission the founder set: *accurate data on where the water is and what's in it.* Growth-hacking empty pins does not move it.
- It couples the three things that must be true for the product to win: **coverage** (there are waters to find), **trust** (they carry citations), and **engagement** (people open and contribute to them).
- It is the direct analogue of AllTrails' engagement core ("verified activities on real trails") re-pointed at water.

### Input metrics (the levers that move the NSM)

| Layer | Metric | MVP definition | Why it matters |
|---|---|---|---|
| **Coverage** | Cited-water coverage | % of ingested NHD/NHN waters with ≥1 citation shown | The denominator of trust. |
| **Data accuracy** | Species-citation rate | % of listed species whose source URL resolves to a live authoritative page | Guards against the #2 category complaint: "the data is dead wrong." |
| **Acquisition** | New water-viewers / week | first-time openers of any water detail | Top of funnel. |
| **Engagement** | Reports per active water | angler reports ÷ waters opened | The community flywheel. |
| **Retention** | W1 / W4 return rate of contributors | | Contributors are the moat (see §6). |

## 3. Who it's for (personas & jobs-to-be-done)

- **The Explorer (primary).** "I'm driving through / just moved / want a new spot this weekend. Show me water near me and tell me honestly what's in it and whether it's worth the trip." → *discovery + cited species + reports.*
- **The Local Logger.** "I fish the same three lakes. I'll drop honest reports if the app respects my spots and isn't a paywall." → *contribution + privacy.*
- **The Planner.** "Trip to a new region — which waters hold the species I target, and what are the access/regulation gotchas?" → *species filter + provenance + regulations link-out.*

The unifying JTBD: **"When I have time to fish unfamiliar water, help me choose a spot I can trust, quickly, without paying to find out it was fake."**

## 4. Positioning — how we win (from the competitive research)

The research (see [RESEARCH_BRIEF.md](./RESEARCH_BRIEF.md), 6 cited dimensions, adversarially verified) found a real, defensible gap. No competitor unifies **AllTrails-grade discovery UX + honest free tier + true US-*and*-Canada coverage + cited/trustworthy data**.

| Incumbent | Their strength | Their wound (from real reviews/Reddit) | AllFish's answer |
|---|---|---|---|
| **Fishbrain** | Largest community (~11M+) | Free tier "close to unusable" behind a ~$75/yr paywall; cluttered | Genuinely useful free tier; clean AllTrails-style UI |
| **onX Fish** | Best map-first discovery + science data | Only ~10–11 US states; no community | National + **Canada from day one**; add reports |
| **Navionics** | Gold-standard bathymetry | Sub quadrupled to ~$80; no species/social layer | Species + community, transparent pricing |
| **Angler's Atlas / MyCatch** | Authoritative **Canada** data + "secret spots stay secret" trust | Consumer UX lags | Modern UX on top of the same trust promise |

**The wedge is trust + honesty:** cited-source-per-species is a product primitive *no incumbent ships*, and it directly rebuts the two loudest complaints — "the paid data is inaccurate" and "I'm being nickel-and-dimed."

## 5. MVP scope — what is built in this repo

Delivered and QA-verified (see the app in `/app`):

- **Google-Maps-like interactive map** (MapLibre GL + keyless OpenFreeMap tiles) of the US & Canada.
- **13 real, cited water bodies** rendered from **actual OpenStreetMap geometry**, spanning lakes, ponds→reservoirs, and rivers, in 8 US states + 4 Canadian provinces.
- **Water provenance citation** on every water body: USGS NHD (US) / NRCan NHN (CA) **plus a per-feature OpenStreetMap permalink** — the literal answer to "cite the source that shows there's water here."
- **Cited fish species per water body**, each with its **own** source link + confidence badge (Documented / Reported / Unconfirmed) — answering "cite why you believe that species is in that water." Sources include MN DNR LakeFinder survey pages, TPWD stocking history, and **iNaturalist research-grade observation queries** (which surface minnows/baitfish like fathead minnow and redside shiner — the "does it have minnows?" ask).
- **Community reports** (reviews): star rating, target species, body — posted live, persisted, XSS-sanitized. Seeded with clearly-labeled editorial reports so flagship waters aren't empty.
- **Search + filters** by name, water type, country, and species.
- **"Search this area" control** (Google-Maps pattern): results stay put while you explore; a button appears once the view has moved enough and re-queries only the water bodies in the current viewport — and opens the write-up directly when you've zoomed into a single water.
- **AllTrails UX pattern**: list rail + map + detail panel, responsive to mobile bottom-sheet.

Explicitly **out of MVP scope** (roadmap below): accounts/auth, catch logging with photos, bathymetry/depth, offline maps, native mobile apps, real-time gage/flow overlays, moderation tooling.

## 6. The data & community flywheel (the moat)

```
   Authoritative open data (NHD/NHN geometry + agency species)
                 │  seeds trust on day 1
                 ▼
        Users discover cited waters  ──►  WCWI ↑
                 │                              │
                 ▼                              │
     Users add reports/corrections  ───────────┘
                 │  proprietary layer incumbents can't buy
                 ▼
     Better data → more discovery → more contribution  (compounds)
```

The founder's stated long-game — **a future data partnership with AllTrails** — fits here: AllTrails owns the trailhead/parking/trip-planning graph; AllFish owns the water/species/report graph. They are complementary map layers, not competitors, and a two-way tile/POI exchange is the natural integration once AllFish has proprietary contribution volume worth trading.

## 7. Roadmap

- **Phase 0 — this MVP (done):** map + cited waters + species + reports, US/CA, seed dataset.
- **Phase 1 — coverage & accounts (0–3 mo):** ingest NHDPlus HR + NHN at scale into PostGIS (see [ARCHITECTURE.md](./ARCHITECTURE.md)); anonymous → optional accounts; report moderation; "claim a correction" flow.
- **Phase 2 — trust & depth (3–6 mo):** automated species-citation freshness checks; regulations link-outs per state/province; species range overlays from GBIF/NAS; saved waters & alerts.
- **Phase 3 — community & monetization (6–12 mo):** catch logging w/ photos; freemium ($35–50/yr benchmark vs onX $34.99) unlocking advanced layers, *keeping discovery + public-access free* (the anti-Fishbrain promise); light shop-by-water commerce (Omnia-style) as a subscription hedge.
- **Phase 4 — partnerships:** AllTrails data exchange; state-agency data partnerships (the iAngler/tournament science model).

## 8. Monetization principle

Freemium with an **honest free tier** as the brand's core differentiator. Free forever: discovery, cited species, public reports, public access. Premium (~$39/yr): offline maps, advanced/ scientific layers, catch analytics. **Never** paywall the basic "where is the water and what's in it" answer — that is the wound we are exploiting in every incumbent.

## 9. Key risks & mitigations

| Risk | Mitigation |
|---|---|
| **Spot-burning** (anglers won't share honey holes) | Report at water-body granularity, never GPS pins; adopt MyCatch's "secret spots stay secret" stance explicitly. |
| **Data-accuracy blowback** ("dead wrong") | Confidence badges + live source links; freshness checks on citations; community correction flow. |
| **Licensing traps** | Segregate ODbL (OSM) and CC-BY-NC (FishBase/default iNaturalist) data from any future commercial DB; ship required attributions. See [DATA_SOURCES.md](./DATA_SOURCES.md). |
| **Map cost at scale** | Self-host Protomaps/PMTiles on object storage; commercial tiles only as fallback. See [ARCHITECTURE.md](./ARCHITECTURE.md) §Scale. |
