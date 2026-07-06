# AllFish Water-Body Photos — Implementation-Ready Brief

## 1. Primary source + why

**Primary: Openverse (`api.openverse.org/v1/images/`). Co-primary coverage backbone: Wikimedia Commons MediaWiki API. Both keyless.**

Why Openverse is the integration point:
- **Keyless + CORS-friendly**: no API key for search. Anonymous throttle ~1 req/sec, 20 results/page. A free OAuth client (client_id/secret, machine-to-machine token) lifts both. It powers the openverse.org SPA (different origin), so it is browser-callable — run a one-line preflight from your domain to confirm `Access-Control-Allow-Origin` before shipping.
- **Ready-to-render attribution**: every result carries a prebuilt `attribution` string plus structured `creator`, `creator_url`, `license`, `license_version`, `license_url`, `foreign_landing_url`, `source`, `title`.
- **Clean hotlinking**: the `thumbnail` field is an Openverse-proxied URL you may hotlink freely — avoids the source's hotlink/cache rules. (The raw `url` field inherits source rules; don't use it directly.)
- **Aggregates the best CC images from Commons + Flickr + others** in one JSON call — so you get Flickr's good CC photos **without** touching Flickr's now-Pro-gated, staff-reviewed, 24-hour-takedown API.

**Hard guardrail (commercial app):** filter every Openverse query with `license_type=commercial,modification`, or restrict `license=by,by-sa,cc0,pdm`. The aggregate index includes NC/ND works you cannot use. Openverse legally disclaims license verification, so **you still owe attribution per the underlying license.**

Why Commons is the co-primary coverage engine:
- Keyless MediaWiki Action API (`commons.wikimedia.org/w/api.php`); append **`&origin=*`** for browser CORS.
- **Strongest coverage of named natural water features** — dedicated geocoded categories per named lake/river with curated photography.
- Machine-readable `Artist`, `LicenseShortName`, `LicenseUrl`, `License`, `AttributionRequired`, `Credit`, `UsageTerms` via `prop=imageinfo&iiprop=extmetadata|url`.
- Caveat: hotlinking `upload.wikimedia.org` is allowed but discouraged, and **every request must send a descriptive `User-Agent`** — empty/generic UAs get HTTP 403, and unidentified traffic is throttled/blocked under the Foundation UA policy. So **cache the bytes on your CDN and store attribution metadata alongside.**

**Do not integrate Flickr directly** (new API keys require paid Pro, commercial keys are fee-reviewed, TOS caps caching + 24h takedown). **Mapillary** is a niche "nearest-road view" add-on only — street-level, road-biased (~2.65% rural areal coverage), token-required on every request — never for hero shots.

---

## 2. Exact attribution string per license (with required links)

Render **one** credit component fed from each source's metadata. TASL = Title, Author, Source, License.

**CC-BY (2.0 / 3.0 / 4.0) and CC-BY-SA (3.0 / 4.0):**
```
"{title}" by {creator} is licensed under {license} {version}.
To view a copy of this license, visit {license_url}.
```
- Link `{creator}` → `creator_url` (author page).
- Link `{title}`/image → `foreign_landing_url` (Openverse) or the Commons **file page** `descriptionurl` (Commons).
- Link `{license} {version}` → `license_url` (the deed, e.g. `https://creativecommons.org/licenses/by/4.0/`).
- Rendered example (verified live from Openverse): *"On Top of the World (Lake Tahoe) by christophelaphotography is licensed under CC BY 2.0. To view a copy of this license, visit https://creativecommons.org/licenses/by/2.0/."*
- Commons short form is equivalent: `"{Title}" by {Artist} / {LicenseShortName}` with `LicenseShortName` linked to `LicenseUrl` and the image linked to the file page.

**ShareAlike note (CC-BY-SA only):** ShareAlike triggers **only if you adapt/remix** the image. Merely displaying it unmodified requires attribution but does **not** force you to relicense your app. If you crop/filter/composite, mark "modified" and license the derivative under the same CC-BY-SA version.

**CC0 / Public Domain Mark (pdm):**
```
This work is marked with CC0 1.0. / Public domain.
```
- **No legal attribution requirement.** Best practice: still credit provenance (author + source link) to keep one consistent rendering path. Check the per-file `AttributionRequired` flag on Commons before dropping the credit.

**Universal rules:** always include name + license notice + link to the material + a modification indicator when supplied; never imply endorsement; store the attribution metadata next to every cached image so the credit renders offline.

---

## 3. Google Maps: go/no-go + the only compliant path

**NO-GO (hard ToS violations — do not do):**
- Scraping, downloading, screenshotting, hotlinking, self-hosting, or caching Google map tiles, Street View images, or Place photos outside the official APIs (ToS §3.2.3(a) No Scraping, (b) No Caching, (c) No Creating Content). Account-termination + legal exposure. There is **no free/gray-area** way to show Google imagery.
- **The deal-breaker (§3.2.3(e) "No Use With Non-Google Maps"):** you may not display Places content or Street View imagery *with or near* a non-Google map. Google explicitly lists "displaying Street View imagery and non-Google maps on the same screen" as prohibited. **AllFish's core surface is MapLibre + OpenFreeMap (OSM) — a non-Google map.** So you cannot pin Place photos on the AllFish map and cannot show a Street View pane on the same screen as it.

**The only compliant path (conditional GO):**
1. Keep MapLibre + OpenFreeMap as the basemap. Put **zero** Google content on it.
2. Surface Google imagery **only inside a dedicated water-body detail view/modal that does not render the OSM map at the same time.**
3. Store the Google **place ID** per water body (the only element allowed to persist indefinitely).
4. On detail open, call the **free** Street View **metadata** endpoint (no quota) to check coverage; only if present, render the paid **Street View Static** image (~$7/1,000 after 10K free/month; images capped 640×640).
5. Optionally render **Place Photos** (~$7/1,000; photo name expires and **cannot be cached** — fetch fresh each view).
6. **Fetch both live, client-side, every view. Never cache image bytes or photo names. Never bundle them into a static export.**
7. Show the **Google logo** (required when Google content appears without a Google map) + each photo's **authorAttributions**.

**Recommendation:** Given the deliberately keyless, map-first product, keep OSM and confine Google Street View/Place photos to a separate detail card with no OSM map visible. **Get counsel/Google Cloud sign-off on the "same screen as a non-Google map" interpretation before shipping** — that clause is the single biggest legal risk for a map-first UI. (Not legal advice; terms read July 2026 and Google revises them frequently.)

---

## 4. Coverage plan for the ~18k waters (three tiers)

**Tier 1 — Flagship seed (pre-verified, bundled):** the 16 verified images in §5. Ship these hardcoded with cached bytes + attribution metadata on your CDN. Zero runtime cost, guaranteed quality.

**Tier 2 — On-demand lookup (the coverage engine for the long tail):**
- On first view of an unseeded water body, query in order:
  1. **Commons MediaWiki API** by name (+ geosearch by coords to disambiguate same-named features): `action=query&generator=search&gsrnamespace=6&prop=imageinfo&iiprop=url|extmetadata|...&iiurlwidth=800&origin=*`. Best for named natural features. Disambiguate with `list=geosearch` around the water body's lat/lng.
  2. **Openverse** fallback (`q={name}&license_type=commercial,modification`) to reach Flickr/other CC imagery Commons lacks.
- **Filter** to CC-BY / CC-BY-SA / CC0 / PDM (exclude NC/ND). **Cache** the winning image + its `Artist`/`LicenseShortName`/`LicenseUrl` (Commons) or `attribution`/`license_url` (Openverse) to your CDN + DB. Serve from cache thereafter.
- **Ops:** send a descriptive `User-Agent` on all Commons requests (403 otherwise). Use the API-returned `thumburl` verbatim (hand-built widths return HTTP 400) or `Special:FilePath` for stable resized URLs. Store attribution beside the bytes so it renders even if the source file is later renamed/deleted.

**Tier 3 — User uploads (fills everything the first two tiers miss):**
- **Firebase Storage** for user-contributed water-body photos. Capture uploader attribution + a license grant at upload time; moderate before display; store the same attribution schema so all three tiers render through one credit component.
- This is the durable answer for the many small/rural waters with no CC coverage (Mapillary's road bias and Commons' gaps both bottom out here).

**Rendering contract:** all three tiers write to one image record `{ waterbodyId, thumbUrl, author, authorUrl, license, licenseUrl, sourcePageUrl, modified, attributionRequired }` so a single component renders the correct credit line (§2) regardless of origin.

---

## 5. Verified flagship seed images (only entries that passed verification)

All 16 below returned `ok:true` on subject + URL + author/license checks. **Jamaica Pond, Walden Pond, and Charles River are excluded** — they were candidates but were not in the verified set.

| Waterbody | thumbUrl | Author | License | commonsPage |
|---|---|---|---|---|
| Lake Tahoe | `upload.wikimedia.org/wikipedia/commons/e/e0/Golden_Hour_at_Emerald_Bay.jpg` ⚠ full-res ~19.7MB | Frank Schulenburg | CC BY-SA 3.0 | `commons.wikimedia.org/wiki/File:Golden_Hour_at_Emerald_Bay.jpg` |
| Lake Tahoe | `upload.wikimedia.org/wikipedia/commons/2/20/Lake_Tahoe_at_morning_-_7-2023.jpg` ⚠ full-res ~13MB | John D. (Flickr: macrophile / John Desjarlais) | CC BY 2.0 | `commons.wikimedia.org/wiki/File:Lake_Tahoe_at_morning_-_7-2023.jpg` |
| Lake Tahoe | `upload.wikimedia.org/wikipedia/commons/c/ca/South_Lake_Tahoe_%28CA%2C_USA%29%2C_Blick_nach_Stateline_--_2022_--_162945.jpg` ⚠ full-res ~9.9MB; street view toward Stateline | Dietmar Rabich | CC BY-SA 4.0 | `commons.wikimedia.org/wiki/File:South_Lake_Tahoe_(CA,_USA),_Blick_nach_Stateline_--_2022_--_162945.jpg` |
| Lake Tahoe | Openverse-proxied thumb `api.openverse.org/v1/images/{id}/thumb/` (Flickr source, not Commons) | Christophe La (christophelaphotography) | CC BY 2.0 | Flickr page via Openverse `foreign_landing_url`: `flickr.com/photos/christophela/32141411106` |
| Lake Tahoe | `upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Lake_Tahoe_Scenic_Overlook%2C_Nevada%2C_20220827%2C_01.jpg/960px-Lake_Tahoe_Scenic_Overlook%2C_Nevada%2C_20220827%2C_01.jpg` | Blake Everett Carroll | CC BY-SA 4.0 | `commons.wikimedia.org/wiki/File:Lake_Tahoe_Scenic_Overlook,_Nevada,_20220827,_01.jpg` |
| Lake Minnetonka | `upload.wikimedia.org/wikipedia/commons/thumb/2/28/Lake_Minnetonka_-_Aerial_photo.jpg/960px-Lake_Minnetonka_-_Aerial_photo.jpg` | Tyler Vigen | CC BY-SA 4.0 | `commons.wikimedia.org/wiki/File:Lake_Minnetonka_-_Aerial_photo.jpg` |
| Mille Lacs Lake | `upload.wikimedia.org/wikipedia/commons/thumb/e/e1/A_beautiful%2C_scenic_sunset_on_Mille_Lacs_Lake%2C_Minnesota_%2828982171863%29.jpg/960px-...jpg` | Tony Webster (Minneapolis, MN) | CC BY 2.0 | `commons.wikimedia.org/wiki/File:A_beautiful,_scenic_sunset_on_Mille_Lacs_Lake,_Minnesota_(28982171863).jpg` |
| Lake Guntersville | `upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Lake_Guntersville%2C_Alabama.jpg/960px-Lake_Guntersville%2C_Alabama.jpg` | KyleRobles | CC BY-SA 4.0 | `commons.wikimedia.org/wiki/File:Lake_Guntersville,_Alabama.jpg` |
| Chautauqua Lake | `upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Chautauqua_Lake_at_Mayville%2C_New_York_-_20200809.jpg/960px-...jpg` | Andre Carrotflower | CC BY-SA 4.0 | `commons.wikimedia.org/wiki/File:Chautauqua_Lake_at_Mayville,_New_York_-_20200809.jpg` |
| Deschutes River (OR) | `upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Deschutes_River_Oregon_%2836898876623%29.jpg/960px-...jpg` | Bill Reynolds (Lake Oswego, OR) | CC BY 2.0 | `commons.wikimedia.org/wiki/File:Deschutes_River_Oregon_(36898876623).jpg` |
| Lake of the Woods | `upload.wikimedia.org/wikipedia/commons/thumb/3/34/Lake_of_the_Woods_Beach_at_Zippel_Bay_State_Park%2C_Minnesota_%2838845944862%29.jpg/960px-...jpg` | Tony Webster | CC BY 2.0 | `commons.wikimedia.org/wiki/File:Lake_of_the_Woods_Beach_at_Zippel_Bay_State_Park,_Minnesota_(38845944862).jpg` |
| Lake Simcoe | `upload.wikimedia.org/wikipedia/commons/thumb/7/73/Lake_Simcoe%2C_Ontario_%288122625901%29.jpg/960px-...jpg` | Steve Knight (Halstead, UK) | CC BY 2.0 | `commons.wikimedia.org/wiki/File:Lake_Simcoe,_Ontario_(8122625901).jpg` |
| Lake Nipissing | `upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Lake_Nipissing_viewed_from_a_lookout_in_North_Bay%2C_Ontario.jpg/960px-...jpg` | Wiki.cullin | CC BY-SA 4.0 | `commons.wikimedia.org/wiki/File:Lake_Nipissing_viewed_from_a_lookout_in_North_Bay,_Ontario.jpg` |
| Bow River | `upload.wikimedia.org/wikipedia/commons/thumb/9/94/Bow_River%2C_near_Banff_20240820_1.jpg/960px-...jpg` | DXR | CC BY-SA 4.0 | `commons.wikimedia.org/wiki/File:Bow_River,_near_Banff_20240820_1.jpg` |
| Fraser River | `upload.wikimedia.org/wikipedia/commons/thumb/5/55/Fraser_River_Hope.jpg/960px-Fraser_River_Hope.jpg` | Emma0mb | CC BY 4.0 | `commons.wikimedia.org/wiki/File:Fraser_River_Hope.jpg` |
| Okanagan Lake | `upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Kelowna_Vineyard_overlooking_Okanagan_Lake.jpg/960px-...jpg` | Kelowna09 | CC BY 2.0 | `commons.wikimedia.org/wiki/File:Kelowna_Vineyard_overlooking_Okanagan_Lake.jpg` |

**Seed-table notes:**
- ⚠ The first three Lake Tahoe rows point at **raw full-resolution originals** (10–20MB). Before shipping, swap to a rendered thumbnail via `Special:FilePath/<File>?width=960` or the API-returned `thumburl` to avoid multi-MB downloads. The other 13 rows already use proper 960px thumbs.
- The "On Top of the World" row is a **Flickr asset via Openverse**, not a Commons/`upload.wikimedia.org` file — its `thumbUrl` and source page are the Openverse proxy + Flickr landing URL, resolved at fetch time from the Openverse record.
- Lake Tahoe has 4 verified options; pick one hero (recommend **Golden Hour at Emerald Bay**, a Commons Featured Picture) and hold the rest as alternates.
- License mix: CC-BY-SA and CC-BY only (no CC0/PD survived) — all require the attribution credit line from §2; none forces relicensing unless you modify the image.