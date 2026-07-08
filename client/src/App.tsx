import { useCallback, useEffect, useRef, useState } from 'react';
import MapView from './components/MapView';
import ResultsList from './components/ResultsList';
import DetailPanel from './components/DetailPanel';
import {
  fetchWaterbodies, fetchWaterbody, fetchSpecies, searchWaterbodies,
  type FeatureCollection, type Bbox, type WaterbodyDetail, type SpeciesRow, type WaterType,
} from './lib/api';

type Filters = { type?: WaterType; country?: 'US' | 'CA'; species?: string; salinity?: 'fresh' | 'salt' | 'mixed'; hasFish?: boolean };

// Has the view moved enough since the last search to justify offering a re-search?
// True on a pan of >25% of the view span or a zoom that changes area by >~40%.
function movedEnough(now: Bbox, prev: Bbox): boolean {
  const nw = now.maxLng - now.minLng, nh = now.maxLat - now.minLat;
  const pw = prev.maxLng - prev.minLng, ph = prev.maxLat - prev.minLat;
  if (pw <= 0 || ph <= 0) return true;
  const ncx = (now.minLng + now.maxLng) / 2, ncy = (now.minLat + now.maxLat) / 2;
  const pcx = (prev.minLng + prev.maxLng) / 2, pcy = (prev.minLat + prev.maxLat) / 2;
  const centerShift = Math.max(Math.abs(ncx - pcx) / pw, Math.abs(ncy - pcy) / ph);
  const areaRatio = (nw * nh) / (pw * ph);
  return centerShift > 0.25 || areaRatio < 0.6 || areaRatio > 1.7;
}

export default function App() {
  const [data, setData] = useState<FeatureCollection | null>(null);
  const [filters, setFilters] = useState<Filters>({});
  const [speciesList, setSpeciesList] = useState<SpeciesRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WaterbodyDetail | null>(null);
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [showSearchArea, setShowSearchArea] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; water_type: string; admin: string | null; centroid_lng: number; centroid_lat: number }>>([]);
  const [railOpen, setRailOpen] = useState(true);

  const reqRef = useRef(0);
  const viewportRef = useRef<Bbox | null>(null);       // latest map bounds
  const searchedRef = useRef<Bbox | null>(null);        // bounds of the last fetch
  const filtersRef = useRef<Filters>(filters);
  filtersRef.current = filters;

  useEffect(() => { fetchSpecies().then(setSpeciesList).catch(() => {}); }, []);

  // Fetch water bodies for a given bounds. autoSelectSingle opens the detail
  // when the search returns exactly one water (i.e. you zoomed into one lake).
  const doSearch = useCallback((bbox: Bbox, opts?: { autoSelectSingle?: boolean }) => {
    const id = ++reqRef.current;
    searchedRef.current = bbox;
    setShowSearchArea(false);
    setLoading(true);
    fetchWaterbodies(bbox, filtersRef.current)
      .then((fc) => {
        if (id !== reqRef.current) return;
        setData(fc);
        if (opts?.autoSelectSingle && fc.features.length === 1) setSelectedId(fc.features[0].id);
      })
      .catch(() => { if (id === reqRef.current) setData({ type: 'FeatureCollection', attribution: '', features: [] }); })
      .finally(() => { if (id === reqRef.current) setLoading(false); });
  }, []);

  // Map reported a new viewport: fetch once on first load, otherwise offer
  // "Search this area" when the view has moved enough (Google-Maps pattern).
  const handleViewport = useCallback((bbox: Bbox) => {
    viewportRef.current = bbox;
    if (!searchedRef.current) doSearch(bbox);
    else if (movedEnough(bbox, searchedRef.current)) setShowSearchArea(true);
  }, [doSearch]);

  const searchThisArea = useCallback(() => {
    if (viewportRef.current) doSearch(viewportRef.current, { autoSelectSingle: true });
  }, [doSearch]);

  // Filters are an explicit action → re-search the current view immediately.
  useEffect(() => {
    if (viewportRef.current) doSearch(viewportRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Load detail for the selected water body.
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let live = true;
    fetchWaterbody(selectedId).then((d) => {
      if (!live) return;
      setDetail(d);
      // Note: no flyTo here — selecting must NOT move the map. Clicking a dot
      // keeps you exactly where you are (the water highlights in place); only
      // list/search picks fly, because there you don't yet know where it is.
    }).catch(() => { if (live) setDetail(null); });
    return () => { live = false; };
  }, [selectedId]);

  // Debounced search.
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(() => { searchWaterbodies(q).then(setSearchResults).catch(() => setSearchResults([])); }, 220);
    return () => clearTimeout(t);
  }, [search]);

  // Map-click selection: select + highlight in place, WITHOUT moving the map.
  const onSelect = useCallback((id: string) => {
    setSelectedId(id);
    setRailOpen(true);
  }, []);

  // List selection: fly to it (you can't see it yet), then it highlights.
  const onSelectFromList = useCallback((id: string) => {
    setSelectedId(id);
    setRailOpen(true);
    const f = data?.features.find((x) => x.id === id);
    if (f) setFlyTo(f.properties.centroid);
  }, [data]);

  const pickSearch = (r: { id: string; centroid_lng: number; centroid_lat: number }) => {
    setSearch(''); setSearchResults([]);
    setSelectedId(r.id);
    setFlyTo([r.centroid_lng, r.centroid_lat]);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" onClick={() => { setSelectedId(null); }}>
          <span className="brand-mark" aria-hidden>🎣</span>
          <span className="brand-name">All<span className="brand-accent">Fish</span></span>
        </div>

        <div className="searchbox">
          <input
            className="search-input"
            placeholder="Search a lake, river, or pond…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search water bodies"
          />
          {searchResults.length > 0 && (
            <ul className="search-results">
              {searchResults.map((r) => (
                <li key={r.id}><button onClick={() => pickSearch(r)}>
                  <b>{r.name}</b> <span className="muted">{r.admin ?? ''}</span>
                </button></li>
              ))}
            </ul>
          )}
        </div>

        <div className="filters">
          <select aria-label="Water type" value={filters.type ?? ''} onChange={(e) => setFilters((f) => ({ ...f, type: (e.target.value || undefined) as WaterType | undefined }))}>
            <option value="">All waters</option>
            <option value="lake">Lakes</option>
            <option value="pond">Ponds</option>
            <option value="reservoir">Reservoirs</option>
            <option value="river">Rivers</option>
            <option value="stream">Streams</option>
          </select>
          <select aria-label="Country" value={filters.country ?? ''} onChange={(e) => setFilters((f) => ({ ...f, country: (e.target.value || undefined) as 'US' | 'CA' | undefined }))}>
            <option value="">US &amp; Canada</option>
            <option value="US">United States</option>
            <option value="CA">Canada</option>
          </select>
          <select aria-label="Water salinity" value={filters.salinity ?? ''} onChange={(e) => setFilters((f) => ({ ...f, salinity: (e.target.value || undefined) as 'fresh' | 'salt' | 'mixed' | undefined }))}>
            <option value="">Fresh &amp; salt</option>
            <option value="fresh">Freshwater</option>
            <option value="salt">Salt water</option>
            <option value="mixed">Mixed / brackish</option>
          </select>
          <select aria-label="Fish data" value={filters.hasFish ? 'fish' : ''} onChange={(e) => setFilters((f) => ({ ...f, hasFish: e.target.value === 'fish' ? true : undefined }))}>
            <option value="">Any water</option>
            <option value="fish">Has fish data</option>
          </select>
          <select aria-label="Species" value={filters.species ?? ''} onChange={(e) => setFilters((f) => ({ ...f, species: e.target.value || undefined }))}>
            <option value="">Any species</option>
            {speciesList.map((s) => <option key={s.id} value={s.id}>{s.common_name} ({s.waterbody_count})</option>)}
          </select>
        </div>
      </header>

      {mapError && <div className="banner">{mapError}</div>}

      <div className="body">
        <aside className={`rail ${railOpen ? 'open' : 'closed'}`}>
          {detail
            ? <DetailPanel key={detail.id} wb={detail} onBack={() => setSelectedId(null)} />
            : <ResultsList features={data?.features ?? []} selectedId={selectedId} loading={loading} onSelect={onSelectFromList} />}
        </aside>

        <button className="rail-toggle" onClick={() => setRailOpen((o) => !o)} aria-label="Toggle list">
          {railOpen ? '‹' : '›'}
        </button>

        <main className="map-wrap">
          {showSearchArea && (
            <button className="search-area" onClick={searchThisArea} disabled={loading}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                <path d="M20 11a8 8 0 1 0-3 6.2" strokeLinecap="round" />
                <path d="M20 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {loading ? 'Searching…' : 'Search this area'}
            </button>
          )}
          <MapView
            data={data}
            selectedId={selectedId}
            flyToCentroid={flyTo}
            onSelect={onSelect}
            onViewport={handleViewport}
            onError={setMapError}
          />
        </main>
      </div>
    </div>
  );
}
