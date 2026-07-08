import { useEffect, useState } from 'react';
import { getWaterbodyPhotos, type WaterPhoto } from '../lib/images';

const FIREBASE = import.meta.env.VITE_FIREBASE === '1';

interface UserPhoto { id: string; url: string; credit: string; submittedBy: string; created_at: string }

// Photos of a water body: auto-sourced from Wikimedia Commons (cited, matched to
// the water's own coordinates) plus crowdsourced community links (Firestore).
export default function Photos({ id, name, lat, lng, radiusKm }: { id: string; name: string; lat: number; lng: number; radiusKm: number }) {
  const [auto, setAuto] = useState<WaterPhoto[] | null>(null);
  const [community, setCommunity] = useState<UserPhoto[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let live = true;
    setAuto(null); setCommunity([]); setShowForm(false);
    getWaterbodyPhotos(name, { lat, lng, radiusKm }).then((p) => { if (live) setAuto(p); }).catch(() => { if (live) setAuto([]); });
    if (FIREBASE) {
      import('../lib/firebase').then((m) => m.getPhotoContributions(id))
        .then((p) => { if (live) setCommunity(p); }).catch(() => {});
    }
    return () => { live = false; };
  }, [id, name, lat, lng, radiusKm]);

  const hero = auto?.[0];
  const strip = auto?.slice(1) ?? [];

  return (
    <div className="photos">
      {auto === null ? (
        <div className="photo-hero skeleton" aria-label="Loading photos" />
      ) : hero ? (
        <>
          <a className="photo-hero" href={hero.sourceUrl} target="_blank" rel="noopener noreferrer">
            <img src={hero.thumbUrl} alt={`View of ${name}`} loading="lazy" />
            <span className="photo-credit">📷 {hero.author} · {hero.license} · Wikimedia Commons ↗</span>
          </a>
          {strip.length > 0 && (
            <div className="photo-strip">
              {strip.map((p) => (
                <a key={p.title} className="photo-thumb" href={p.sourceUrl} target="_blank" rel="noopener noreferrer"
                  title={`${p.author} · ${p.license} · Wikimedia Commons`}>
                  <img src={p.thumbUrl} alt={`View of ${name}`} loading="lazy" />
                </a>
              ))}
            </div>
          )}
        </>
      ) : null}

      {community.length > 0 && (
        <div className="photo-strip community">
          {community.map((p) => (
            <a key={p.id} className="photo-thumb community" href={p.url} target="_blank" rel="noopener noreferrer"
              title={`Contributed by ${p.submittedBy}${p.credit ? ' · ' + p.credit : ''}`}>
              <img src={p.url} alt={`Angler photo of ${name}`} loading="lazy" />
            </a>
          ))}
        </div>
      )}

      {FIREBASE && (
        showForm
          ? <ContributeForm id={id} onAdded={(p) => { setCommunity((c) => [p, ...c]); setShowForm(false); }} onCancel={() => setShowForm(false)} />
          : <button className="upload-btn" onClick={() => setShowForm(true)}>📷 Add a photo of {name.length > 22 ? 'this water' : name}</button>
      )}
      {FIREBASE && !showForm && (auto?.length || community.length)
        ? <p className="upload-note">Photos: Wikimedia Commons (cited) + community contributions.</p>
        : null}
    </div>
  );
}

const HOST_OK = /^https:\/\/(upload\.wikimedia\.org|live\.staticflickr\.com|i\.imgur\.com|farm\d+\.staticflickr\.com|.*\.googleusercontent\.com)\//i;

function ContributeForm({ id, onAdded, onCancel }: { id: string; onAdded: (p: UserPhoto) => void; onCancel: () => void }) {
  const [url, setUrl] = useState('');
  const [credit, setCredit] = useState('');
  const [by, setBy] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const u = url.trim();
    if (!HOST_OK.test(u)) {
      setErr('Paste a direct image link from Wikimedia Commons, Flickr, or Imgur (e.g. https://i.imgur.com/…jpg).');
      return;
    }
    if (!by.trim()) { setErr('Add your name so we can credit the contribution.'); return; }
    setBusy(true);
    try {
      const m = await import('../lib/firebase');
      const p = await m.addPhotoContribution(id, { url: u, credit: credit.trim(), submittedBy: by.trim() });
      onAdded(p);
    } catch {
      setErr('Could not save the photo. Please try again.');
    } finally { setBusy(false); }
  }

  return (
    <form className="review-form" onSubmit={submit} style={{ marginTop: 10 }}>
      <h4>Add a photo link</h4>
      <input className="rf-input" placeholder="Image URL (Wikimedia, Flickr, or Imgur)" value={url} maxLength={500} onChange={(e) => setUrl(e.target.value)} aria-label="Image URL" />
      <input className="rf-input" placeholder="Your name (for credit)" value={by} maxLength={60} onChange={(e) => setBy(e.target.value)} aria-label="Your name" />
      <input className="rf-input" placeholder="Credit / caption (optional)" value={credit} maxLength={120} onChange={(e) => setCredit(e.target.value)} aria-label="Credit" />
      {err && <div className="rf-err">{err}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" disabled={busy} type="submit">{busy ? 'Adding…' : 'Add photo'}</button>
        <button className="btn" type="button" onClick={onCancel} style={{ background: '#eef2f5', color: 'var(--ink)' }}>Cancel</button>
      </div>
      <p className="upload-note">Only direct links from Wikimedia Commons, Flickr, or Imgur (free hosts) are accepted. Don&apos;t post copyrighted photos you don&apos;t have rights to.</p>
    </form>
  );
}
