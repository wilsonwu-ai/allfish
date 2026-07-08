import { useState } from 'react';
import type { WaterbodyDetail, Review, SpeciesLink } from '../lib/api';
import { postReview } from '../lib/api';
import Stars from './Stars';
import Photos from './Photos';

const TYPE_LABEL: Record<string, string> = {
  lake: 'Lake', pond: 'Pond', river: 'River', stream: 'Stream', reservoir: 'Reservoir',
};

const SALINITY: Record<string, { label: string; cls: string }> = {
  fresh: { label: 'Freshwater', cls: 'sal-fresh' },
  salt: { label: 'Salt water', cls: 'sal-salt' },
  mixed: { label: 'Mixed / brackish', cls: 'sal-mixed' },
};

// Photo-search radius scaled to the water's size: small ponds ~4 km, big lakes up
// to 20 km — so shore photos are found without pulling in same-named waters far off.
function photoRadiusKm(wb: WaterbodyDetail): number {
  const latKm = (wb.max_lat - wb.min_lat) * 111;
  const lngKm = (wb.max_lng - wb.min_lng) * 111 * Math.cos((wb.centroid_lat * Math.PI) / 180);
  return Math.min(Math.max(Math.max(latKm, lngKm) * 0.7 + 3, 4), 20);
}

function ConfidenceBadge({ c }: { c: SpeciesLink['confidence'] }) {
  const label = { high: 'Documented', medium: 'Reported', low: 'Unconfirmed' }[c];
  return <span className={`conf conf-${c}`} title={`Evidence confidence: ${c}`}>{label}</span>;
}

function SpeciesRow({ s }: { s: SpeciesLink }) {
  return (
    <li className="species-row">
      <div className="species-main">
        <span className="species-name">{s.common_name}</span>
        {s.scientific_name && <span className="species-sci">{s.scientific_name}</span>}
      </div>
      <div className="species-meta">
        {s.category && <span className="chip chip-cat">{s.category}</span>}
        <ConfidenceBadge c={s.confidence} />
      </div>
      <div className="species-cite">
        <a href={s.source_url} target="_blank" rel="noopener noreferrer">
          {s.evidence ? `${s.evidence} · ` : ''}Source: {s.source_publisher || s.source_name} ↗
        </a>
      </div>
    </li>
  );
}

function ReviewCard({ r }: { r: Review }) {
  const date = new Date(r.created_at + 'Z').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  return (
    <li className="review-card">
      <div className="review-head">
        <span className="review-author">{r.author}</span>
        <Stars value={r.rating} size={14} />
      </div>
      {r.target_species && <div className="review-target">Targeting: {r.target_species}</div>}
      <p className="review-body">{r.body}</p>
      <time className="review-date">{date}</time>
    </li>
  );
}

function ReviewForm({ id, onAdded }: { id: string; onAdded: (r: Review) => void }) {
  const [author, setAuthor] = useState('');
  const [rating, setRating] = useState(0);
  const [target, setTarget] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!author.trim() || rating < 1 || body.trim().length < 3) {
      setErr('Add your name, a star rating, and a few words.');
      return;
    }
    setBusy(true);
    try {
      const { review } = await postReview(id, { author: author.trim(), rating, target_species: target.trim() || undefined, body: body.trim() });
      onAdded(review);
      setAuthor(''); setRating(0); setTarget(''); setBody('');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not post review.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="review-form" onSubmit={submit}>
      <h4>Share your report</h4>
      <div className="rf-row">
        <input className="rf-input" placeholder="Your name" value={author} maxLength={60} onChange={(e) => setAuthor(e.target.value)} aria-label="Your name" />
        <div className="rf-stars"><Stars value={rating} size={22} interactive onChange={setRating} /></div>
      </div>
      <input className="rf-input" placeholder="Species you targeted (optional)" value={target} maxLength={80} onChange={(e) => setTarget(e.target.value)} aria-label="Target species" />
      <textarea className="rf-input rf-text" placeholder="How was the fishing? Access, crowds, what was biting…" value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} aria-label="Review" />
      {err && <div className="rf-err">{err}</div>}
      <button className="btn btn-primary" disabled={busy} type="submit">{busy ? 'Posting…' : 'Post report'}</button>
    </form>
  );
}

export default function DetailPanel({ wb, onBack }: { wb: WaterbodyDetail; onBack: () => void }) {
  const [reviews, setReviews] = useState<Review[]>(wb.reviews);
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : null;
  const isOsm = /openstreetmap/i.test(wb.water_source_url);

  return (
    <div className="detail">
      <button className="back" onClick={onBack}>← All waters</button>
      <div className="detail-head">
        <h2>{wb.name}</h2>
        <div className="detail-sub">
          <span className={`chip chip-type type-${wb.water_type}`}>{TYPE_LABEL[wb.water_type]}</span>
          {wb.salinity && SALINITY[wb.salinity] && (
            <span className={`chip ${SALINITY[wb.salinity].cls}`}>{SALINITY[wb.salinity].label}</span>
          )}
          <span className="muted">{wb.admin ?? ''}{wb.admin ? ' · ' : ''}{wb.country === 'US' ? 'United States' : 'Canada'}</span>
        </div>
        <div className="detail-rating">
          {avg != null ? <><Stars value={Math.round(avg)} size={18} /> <b>{avg.toFixed(1)}</b> <span className="muted">({reviews.length} report{reviews.length === 1 ? '' : 's'})</span></>
            : <span className="muted">No angler reports yet — be the first.</span>}
        </div>
      </div>

      <Photos id={wb.id} name={wb.name} lat={wb.centroid_lat} lng={wb.centroid_lng} radiusKm={photoRadiusKm(wb)} />

      {wb.description && <p className="detail-desc">{wb.description}</p>}

      <section className="prov">
        <h3>Where this water is</h3>
        <p className="prov-line">
          Water body confirmed by{' '}
          <a href={wb.water_source_url} target="_blank" rel="noopener noreferrer">{wb.water_source_name} ↗</a>.
        </p>
        <p className="prov-meta">
          {wb.geometry_source && <>Shape rendered from <b>{wb.geometry_source}</b>. </>}
          License: {wb.water_source_license}.{isOsm ? '' : ' Authoritative hydrography dataset.'}
        </p>
        {wb.salinity && SALINITY[wb.salinity] && (
          <p className="prov-meta">
            Water type: <b>{SALINITY[wb.salinity].label}</b>
            {wb.salinity_basis ? <> — {wb.salinity_basis}</> : null} (from the cited OpenStreetMap feature).
          </p>
        )}
      </section>

      <section className="species">
        <h3>Fish present <span className="count">{wb.species.length}</span></h3>
        {wb.species.length > 0 ? (
          <>
            <p className="section-note">Each species is linked to the source that documents it in this water.</p>
            <ul className="species-list">
              {wb.species.map((s) => <SpeciesRow key={s.id} s={s} />)}
            </ul>
          </>
        ) : (
          <div className="no-fish">
            <p><b>No fish species documented yet</b> — this is a data gap, not a survey result. It does <i>not</i> mean the water is fishless.</p>
            <p className="section-note">
              AllFish attributes species from state/provincial fish &amp; wildlife agencies and from iNaturalist research-grade observations. Neither has records matched to this specific water yet, so we don&apos;t assert any species rather than guess. Check the primary source yourself:
            </p>
            <a className="verify-link"
              href={`https://www.inaturalist.org/observations?taxon_id=47178&nelat=${wb.max_lat}&nelng=${wb.max_lng}&swlat=${wb.min_lat}&swlng=${wb.min_lng}&quality_grade=research&verifiable=true`}
              target="_blank" rel="noopener noreferrer">
              Search iNaturalist for fish in this water ↗
            </a>
          </div>
        )}
      </section>

      <section className="reviews">
        <h3>Angler reports <span className="count">{reviews.length}</span></h3>
        <ReviewForm id={wb.id} onAdded={(r) => setReviews((prev) => [r, ...prev])} />
        <ul className="review-list">
          {reviews.map((r) => <ReviewCard key={r.id} r={r} />)}
        </ul>
      </section>
    </div>
  );
}
