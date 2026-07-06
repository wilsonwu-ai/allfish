// Auto-sourced water-body photos from Wikimedia Commons — free (Creative
// Commons / public domain), keyless, and CORS-enabled, so the browser queries
// it directly with no backend. Every photo carries its author + license + a
// link to the Commons file page, consistent with AllFish's cite-everything model.

export interface WaterPhoto {
  title: string;
  thumbUrl: string;
  fullUrl: string;
  sourceUrl: string; // Commons file page
  author: string;
  license: string;
  source: 'Wikimedia Commons';
}

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

// Skip obvious non-photos (maps, diagrams, logos, coats of arms).
const SKIP = /\b(map|karte|diagram|logo|seal|coat of arms|flag|icon|svg|locator)\b/i;

async function search(term: string, limit = 8): Promise<WaterPhoto[]> {
  const url = `${API}?action=query&generator=search&gsrsearch=${encodeURIComponent(term)}` +
    `&gsrnamespace=6&gsrlimit=${limit}&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=640&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const pages = (data?.query?.pages ?? {}) as Record<string, {
    title: string; index?: number; imageinfo?: Array<{ thumburl?: string; url?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }>;
  }>;
  const rows = Object.values(pages)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p) => {
      const ii = p.imageinfo?.[0];
      if (!ii?.thumburl) return null;
      const em = ii.extmetadata ?? {};
      const mime = (em.MimeType?.value || '').toLowerCase();
      if (mime && !mime.startsWith('image/')) return null;
      if (mime.includes('svg')) return null;
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
  return rows;
}

/** Photos for a water body, best-effort, cached. Searches by name (+ region for
 *  disambiguation) and de-dupes. Returns [] when nothing suitable is found. */
export function getWaterbodyPhotos(name: string, admin?: string | null): Promise<WaterPhoto[]> {
  const key = `${name}|${admin ?? ''}`;
  if (cache.has(key)) return cache.get(key)!;
  const run = (async () => {
    const region = (admin || '').split(/[\/,]/)[0].trim();
    // Name + region first (disambiguates common names), then name alone.
    let rows = region ? await search(`${name} ${region}`).catch(() => []) : [];
    if (rows.length < 3) {
      const more = await search(name).catch(() => []);
      const seen = new Set(rows.map((r) => r.title));
      rows = [...rows, ...more.filter((r) => !seen.has(r.title))];
    }
    return rows.slice(0, 6);
  })();
  cache.set(key, run);
  return run;
}
