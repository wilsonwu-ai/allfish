import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MLMap, type GeoJSONSource, type LngLatBoundsLike, type ExpressionSpecification } from 'maplibre-gl';
import type { FeatureCollection, Bbox } from '../lib/api';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
// Continental US + southern Canada as the opening view.
const HOME_BOUNDS: LngLatBoundsLike = [[-128, 24], [-62, 52]];

type Props = {
  data: FeatureCollection | null;
  selectedId: string | null;
  flyToCentroid: [number, number] | null;
  onSelect: (id: string) => void;
  onViewport: (bbox: Bbox) => void;
  onError: (msg: string | null) => void;
};

const POLY_TYPES: ExpressionSpecification = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false];
const LINE_TYPES: ExpressionSpecification = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false];

function pointsFrom(fc: FeatureCollection | null): FeatureCollection {
  return {
    type: 'FeatureCollection',
    attribution: '',
    features: (fc?.features ?? []).map((f) => ({
      type: 'Feature',
      id: f.id,
      geometry: { type: 'Point', coordinates: f.properties.centroid },
      properties: f.properties,
    })) as never,
  };
}

export default function MapView({ data, selectedId, flyToCentroid, onSelect, onViewport, onError }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const readyRef = useRef(false);
  const onViewportRef = useRef(onViewport);
  const onSelectRef = useRef(onSelect);
  onViewportRef.current = onViewport;
  onSelectRef.current = onSelect;

  // Initialize the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      bounds: HOME_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), 'top-right');

    map.on('error', (e) => {
      // Style/tile failures shouldn't blank the app — surface a banner instead.
      if (e?.error?.message?.match(/style|fetch|load/i)) onError('Basemap tiles are slow or unreachable — water data still works.');
    });

    map.on('load', () => {
      map.addSource('wb', { type: 'geojson', data: data ?? { type: 'FeatureCollection', features: [] } as never, promoteId: 'id' });
      map.addSource('wb-pts', { type: 'geojson', data: pointsFrom(data), promoteId: 'id' });

      map.addLayer({
        id: 'wb-fill', type: 'fill', source: 'wb', filter: POLY_TYPES,
        paint: {
          'fill-color': ['case', ['==', ['get', 'id'], ['literal', '']], '#1d9bf0', '#38bdf8'],
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.35, 10, 0.22],
        },
      });
      map.addLayer({
        id: 'wb-outline', type: 'line', source: 'wb', filter: POLY_TYPES,
        paint: { 'line-color': '#0b6fa4', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 10, 1.6] },
      });
      map.addLayer({
        id: 'wb-line', type: 'line', source: 'wb', filter: LINE_TYPES,
        paint: {
          'line-color': '#0ea5e9',
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.4, 12, 4],
          'line-opacity': 0.9,
        },
      });
      // Selection highlight (filter updated on selection change).
      map.addLayer({
        id: 'wb-sel-fill', type: 'fill', source: 'wb', filter: ['all', POLY_TYPES, ['==', ['get', 'id'], '']],
        paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.35 },
      });
      map.addLayer({
        id: 'wb-sel-line', type: 'line', source: 'wb', filter: ['==', ['get', 'id'], ''],
        paint: { 'line-color': '#d97706', 'line-width': 3.5 },
      });
      // Clickable dots + labels.
      map.addLayer({
        id: 'wb-dot', type: 'circle', source: 'wb-pts',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'id'], selectedId ?? ''], 8, 5.5],
          'circle-color': ['match', ['get', 'water_type'], 'river', '#0ea5e9', 'stream', '#0ea5e9', '#0284c7'],
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'wb-label', type: 'symbol', source: 'wb-pts',
        minzoom: 5,
        layout: {
          'text-field': ['get', 'name'], 'text-size': 12, 'text-offset': [0, 1.1], 'text-anchor': 'top',
          'text-font': ['Noto Sans Regular'], 'text-max-width': 9,
        },
        paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
      });

      readyRef.current = true;
      onError(null);
      // QA hook (opt-in via ?qa=1): exposes the map for automated testing only.
      if (new URLSearchParams(window.location.search).has('qa')) {
        (window as unknown as { __map?: MLMap }).__map = map;
      }
      const emit = () => {
        const b = map.getBounds();
        onViewportRef.current({ minLng: b.getWest(), minLat: b.getSouth(), maxLng: b.getEast(), maxLat: b.getNorth() });
      };
      emit();
      map.on('moveend', emit);

      for (const layer of ['wb-fill', 'wb-line', 'wb-dot']) {
        map.on('click', layer, (ev) => {
          const f = ev.features?.[0];
          if (f) onSelectRef.current(String(f.properties?.id ?? f.id));
        });
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
      }
    });

    return () => { map.remove(); mapRef.current = null; readyRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push new data to the sources.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource('wb') as GeoJSONSource | undefined)?.setData((data ?? { type: 'FeatureCollection', features: [] }) as never);
    (map.getSource('wb-pts') as GeoJSONSource | undefined)?.setData(pointsFrom(data) as never);
  }, [data]);

  // Reflect selection in the highlight layers + dot size.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const id = selectedId ?? '';
    const isSel: ExpressionSpecification = ['==', ['get', 'id'], id];
    map.setFilter('wb-sel-fill', ['all', POLY_TYPES, ['==', ['get', 'id'], id]]);
    map.setFilter('wb-sel-line', ['==', ['get', 'id'], id]);
    // Make the selected water unmistakable in place: big amber dot + thick halo.
    map.setPaintProperty('wb-dot', 'circle-radius', ['case', isSel, 11, 5.5]);
    map.setPaintProperty('wb-dot', 'circle-color', ['case', isSel, '#f59e0b', ['match', ['get', 'water_type'], 'river', '#0ea5e9', 'stream', '#0ea5e9', '#0284c7']]);
    map.setPaintProperty('wb-dot', 'circle-stroke-width', ['case', isSel, 3.5, 2]);
  }, [selectedId]);

  // Fly to a selection made from the list.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToCentroid) return;
    map.flyTo({ center: flyToCentroid, zoom: Math.max(map.getZoom(), 9), speed: 1.2, essential: true });
  }, [flyToCentroid]);

  return <div ref={containerRef} className="map-canvas" aria-label="Map of water bodies" role="application" />;
}
