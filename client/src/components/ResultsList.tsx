import type { WaterbodyFeature } from '../lib/api';
import Stars from './Stars';

const TYPE_LABEL: Record<string, string> = {
  lake: 'Lake', pond: 'Pond', river: 'River', stream: 'Stream', reservoir: 'Reservoir',
};

export default function ResultsList({
  features, selectedId, loading, onSelect,
}: {
  features: WaterbodyFeature[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="results">
      <div className="results-head">
        <span>{loading ? 'Loading…' : `${features.length} water${features.length === 1 ? '' : 's'} in view`}</span>
      </div>
      <ul className="results-list">
        {features.map((f) => {
          const p = f.properties;
          return (
            <li key={f.id}>
              <button
                className={`result-card ${selectedId === f.id ? 'active' : ''}`}
                onClick={() => onSelect(f.id)}
              >
                <div className="rc-top">
                  <span className="rc-name">{p.name}</span>
                  <span className={`chip chip-type type-${p.water_type}`}>{TYPE_LABEL[p.water_type]}</span>
                </div>
                <div className="rc-meta">
                  <span className="muted">{p.admin ?? (p.country === 'US' ? 'United States' : 'Canada')}</span>
                </div>
                <div className="rc-stats">
                  {p.review_count > 0 ? (
                    <span className="rc-rating"><Stars value={Math.round(p.avg_rating ?? 0)} size={13} /> <b>{(p.avg_rating ?? 0).toFixed(1)}</b> <span className="muted">({p.review_count})</span></span>
                  ) : <span className="muted small">No reports yet</span>}
                  {typeof p.species_count === 'number' && <span className="rc-species">🐟 {p.species_count} species</span>}
                </div>
              </button>
            </li>
          );
        })}
        {!loading && features.length === 0 && (
          <li className="empty">No water bodies in this view. Zoom out or pan to the US &amp; Canada.</li>
        )}
      </ul>
    </div>
  );
}
