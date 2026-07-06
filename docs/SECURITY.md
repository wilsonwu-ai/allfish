# AllFish — Security Review & Posture

*A senior application-security review was run against the backend (`server.js`, `repo.js`, `db.js`) as part of Task 1. This document records the threat model, findings, what was fixed, and what is deferred to public launch.*

---

## Verdict

**Safe to run as an MVP demo.** The fundamentals a security review most cares about are correct: **SQL is fully parameterized (no injection)**, the **CSP is tight and correctly scoped** to MapLibre + the tile host, **static serving is path-traversal-safe**, **CSRF is genuinely inapplicable** (no cookies/sessions/auth), and inputs are schema-validated with sane body/limit caps.

## Confirmed clean (verified during review)

- **SQL injection — none.** Every query in `repo.js` uses bound parameters. The one dynamically-assembled query (`listWaterbodiesInBbox`) concatenates only hard-coded clause fragments and binds all user values; `type`/`country` are additionally enum-validated.
- **Path traversal — none.** `@fastify/static` with a fixed root; no user-controlled path concatenation; SPA fallback serves a fixed `index.html`.
- **CSRF — not applicable.** No ambient credentials to ride.
- **ReDoS — none.** All regexes are linear over length-capped inputs.
- **XSS — defense confirmed.** User fields (`author`, `body`, `target_species`, search term) render only as React **text nodes** (auto-escaped) and never enter an `href`/`src`/`dangerouslySetInnerHTML` sink. `href` links in the UI come only from **trusted seed data** (agency/OSM URLs), not user input. Server-side `clean()` strips tags + control chars as defense-in-depth.

## Findings & remediation

| # | Sev | Finding | Status |
|---|---|---|---|
| **F1** | **HIGH** | `trustProxy: true` let a client spoof `X-Forwarded-For` to reset the rate-limit bucket every request, defeating both limiters. | **Fixed** — `trustProxy` now defaults to `false`; enable only behind a known proxy via `TRUST_PROXY` (hop count or CIDR). |
| **F2** | MED | `/api/waterbodies` could return up to 2000 rows × full geometry × 3 correlated subqueries on a synchronous DB → CPU/bandwidth DoS lever. | **Partially fixed** — row cap lowered to 1000, bbox range-validated (no full-extent abuse). Full fix at scale = **server-side vector tiles (MVT) + rating rollups** (see [ARCHITECTURE.md](./ARCHITECTURE.md) §5, Stage C). Negligible at MVP data size. |
| **F3** | MED@launch | Anonymous reviews publish instantly with no moderation. | **Deferred (documented).** Acceptable for a gated demo. Launch plan: default new reviews to `flagged`, add report/takedown + spam filter. The `review.status` enum (`published/hidden/flagged`) already exists for this. |
| **F4** | LOW | `clean()` is a blocklist, not an encoder — real XSS control is React escaping. | **Accepted** — verified no user field reaches an HTML/attr sink; `clean()` kept as defense-in-depth. Use DOMPurify if HTML rendering is ever introduced. |
| **F5** | LOW | `origin: true` reflects any origin. | **Accepted for MVP** — API is public, read-mostly, no credentials. Launch: pin to known front-end origin. **Never** add `credentials: true` while `origin: true`. |
| **F6** | LOW | bbox lacked length + coordinate-range validation. | **Fixed** — `maxLength: 64` on bbox, lat ∈ [−90,90] / lng ∈ [−180,180] validated, `min<max` enforced. |
| **F7** | LOW | No HSTS header. | **Fixed** — `Strict-Transport-Security` added (honored by browsers over HTTPS). |
| **F8** | INFO | In-memory rate-limit store is per-process. | **Documented** — correct for single instance; move to Redis when scaling horizontally (see [ARCHITECTURE.md](./ARCHITECTURE.md)). |

## Controls in place (MVP)

- **Input validation:** JSON schema on every route's querystring / params / body.
- **Rate limiting:** global 300/min + strict 10/5min on review writes; **32 KB** body cap.
- **Security headers:** `Content-Security-Policy` (script-src 'self', object-src 'none', frame-ancestors 'none', worker/tile allowances scoped to MapLibre + `tiles.openfreemap.org`), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `HSTS`.
- **Graceful degradation:** map-tile failure shows a banner; data/list keep working.

## Pre-launch checklist (before public, internet-facing exposure)

1. Set `TRUST_PROXY` correctly for the deployment (F1 already safe-by-default).
2. Review moderation + spam defense (F3): captcha/proof-of-work on write, trust scoring, report/takedown.
3. Pin CORS `origin` (F5); keep `credentials` off.
4. Accounts/auth for attribution & abuse traceability.
5. Redis-backed rate limiting + shared session store when horizontally scaled (F8).
6. Serve over TLS (HSTS then active); add observability (structured logs → metrics/traces).
7. Migrate to PostGIS + MVT before ingesting full NHD/NHN (F2 at scale).
