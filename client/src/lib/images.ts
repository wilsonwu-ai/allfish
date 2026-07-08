// Auto-sourced water-body photos from Wikimedia Commons — free (Creative
// Commons / public domain), keyless, CORS-enabled. Every photo carries author +
// license + a link to the Commons file page (AllFish's cite-everything model).
//
// Correctness: photos are matched by NAME **constrained to the water's own
// coordinates** (CirrusSearch `nearcoord:`), so a common name like "Long Pond"
// only returns photos of THIS Long Pond — not a same-named one elsewhere. If no
// geo-matched photo exists we return nothing rather than showing a wrong image.

export interface WaterPhoto {
  title: string;
  thumbUrl: string;
  fullUrl: string;
  sourceUrl: string; // Commons file page
  author: string;
  license: string;
  source: 'Wikimedia Commons';
}

export interface PhotoQuery { lat: number; lng: number; radiusKm: number }

const API = 'https://commons.wikimedia.org/w/api.php';
const cache = new Map<string, Promise<WaterPhoto[]>>();

function stripHtml(html: string): string {
  return (html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Skip non-photos: maps, diagrams, logos, and raw survey/aerial GeoTIFF tiles.
const SKIP = /\b(map|karte|diagram|logo|seal|coat of arms|flag|icon|locator|\.svg|\.tif|\.tiff|master-pnp|USGS|topographic)\b/i;

async function searchNear(name: string, q: PhotoQuery, limit = 8): Promise<WaterPhoto[]> {
  const radius = Math.max(2, Math.min(Math.round(q.radiusKm), 20));
  const term = `${name} nearcoord:${radius}km,${q.lat.toFixed(5)},${q.lng.toFixed(5)}`;
  const url = `${API}?action=query&generator=search&gsrsearch=${encodeURIComponent(term)}` +
    `&gsrnamespace=6&gsrlimit=${limit}&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=640&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const pages = (data?.query?.pages ?? {}) as Record<string, {
    title: string; index?: number; imageinfo?: Array<{ thumburl?: string; url?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }>;
  }>;
  return Object.values(pages)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p) => {
      const ii = p.imageinfo?.[0];
      if (!ii?.thumburl) return null;
      const em = ii.extmetadata ?? {};
      const mime = (em.MimeType?.value || '').toLowerCase();
      if (mime && !mime.startsWith('image/')) return null;
      if (mime.includes('svg') || mime.includes('tiff')) return null;
      if (SKIP.test(p.title)) return null;
      return {
        title: p.title.replace(/^File:/, ''),
        thumbUrl: ii.thumburl,
        fullUrl: ii.url || ii.thumburl,
        sourceUrl: ii.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
        author: stripHtml(em.Artist?.value || '') || 'Unknown',
        license: stripHtml(em.LicenseShortName?.value || em.License?.value || '') || 'See source',
        source: 'Wikimedia Commons' as const,
      };
    })
    .filter((x): x is WaterPhoto => x !== null);
}

/** Location-matched photos for a water body, cached. Empty when no geo-matched
 *  Commons photo exists (we never show a photo of a same-named water elsewhere). */
export function getWaterbodyPhotos(name: string, q: PhotoQuery): Promise<WaterPhoto[]> {
  const key = `${name}|${q.lat.toFixed(3)}|${q.lng.toFixed(3)}`;
  if (cache.has(key)) return cache.get(key)!;
  const run = (async () => {
    const rows = await searchNear(name, q).catch(() => []);
    const seen = new Set<string>();
    return rows.filter((r) => (seen.has(r.title) ? false : (seen.add(r.title), true))).slice(0, 6);
  })();
  cache.set(key, run);
  return run;
}
