'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { CaseRow } from './types';

/**
 * Clustered case map.
 *
 * Two basemaps, tried in order, because one of them failing is not hypothetical
 * — it happened, silently, on the first machine this ran on:
 *
 *   1. CARTO Positron, vector. Better looking, but it pulls a style document,
 *      a sprite sheet, glyph ranges and vector tiles from a second host, and
 *      decodes them on the GPU. Four things to go wrong.
 *   2. CARTO Positron raster. One tile URL, no sprite, no glyphs, no vector
 *      decoding. Far less to block or choke on.
 *
 * If the vector map has not reported itself loaded within eight seconds the
 * component tears it down and rebuilds on raster, and says which one it ended
 * up using. Cluster counts are drawn as text only on the vector style, because
 * a symbol layer needs glyphs — on raster the clusters are sized circles you
 * click to expand, which is a small loss next to no map at all.
 */

const VECTOR_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

/** Inline, so it depends on a tile endpoint and nothing else. */
const RASTER_STYLE = {
  version: 8 as const,
  sources: {
    basemap: {
      type: 'raster' as const,
      tiles: [
        'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    },
  },
  layers: [{ id: 'basemap', type: 'raster' as const, source: 'basemap' }],
};

type Stage = 'starting' | 'style' | 'ready' | 'failed';

export function CaseMap({ cases }: { cases: CaseRow[] }) {
  const router = useRouter();
  const container = React.useRef<HTMLDivElement>(null);
  const [stage, setStage] = React.useState<Stage>('starting');
  const [renderer, setRenderer] = React.useState<'vector' | 'raster' | null>(null);
  const [clustered, setClustered] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);

  const located = React.useMemo(
    () => cases.filter((c) => c.lat !== null && c.lng !== null),
    [cases],
  );

  React.useEffect(() => {
    if (located.length === 0) return;

    let cancelled = false;
    let map: import('maplibre-gl').Map | null = null;
    const timers: number[] = [];

    async function boot() {
      if (!container.current) return;

      let maplibregl: typeof import('maplibre-gl');
      try {
        maplibregl = await import('maplibre-gl');
      } catch (e) {
        if (!cancelled) {
          setStage('failed');
          setMessage(`The map library did not load: ${(e as Error).message}`);
        }
        return;
      }
      if (cancelled || !container.current) return;

      // MapLibre v5+ needs WebGL 2. Checking first names the problem instead of
      // leaving an opaque library failure.
      if (!document.createElement('canvas').getContext('webgl2')) {
        setStage('failed');
        setMessage(
          'This browser cannot provide WebGL 2, which the map needs. Turn on hardware acceleration in the browser settings, or use the list below.',
        );
        return;
      }

      const geojson = {
        type: 'FeatureCollection' as const,
        features: located.map((c) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [c.lng!, c.lat!] },
          properties: {
            id: c.id,
            caseNumber: c.case_number,
            address: c.address ?? '',
            statusLabel: c.status_label ?? 'No status',
            statusColor: c.status_color ?? '#64748b',
            typeName: c.case_type_name,
          },
        })),
      };

      function addOverlay(target: import('maplibre-gl').Map, mode: 'vector' | 'raster') {
        target.addSource('cases', {
          type: 'geojson',
          data: geojson,
          cluster: clustered,
          clusterRadius: 45,
          clusterMaxZoom: 12,
        });

        target.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'cases',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#12161f',
            'circle-radius': ['step', ['get', 'point_count'], 15, 5, 20, 20, 26],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        });

        // A symbol layer needs glyphs, which the raster style deliberately does
        // not pull. Clusters stay clickable either way.
        if (mode === 'vector') {
          target.addLayer({
            id: 'cluster-count',
            type: 'symbol',
            source: 'cases',
            filter: ['has', 'point_count'],
            layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
            paint: { 'text-color': '#ffffff' },
          });
        }

        target.addLayer({
          id: 'case-points',
          type: 'circle',
          source: 'cases',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': ['get', 'statusColor'],
            'circle-radius': 7,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        });

        const bounds = new maplibregl.LngLatBounds();
        for (const c of located) bounds.extend([c.lng!, c.lat!]);
        if (located.length === 1) {
          target.setCenter([located[0].lng!, located[0].lat!]);
          target.setZoom(11);
        } else {
          target.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 0 });
        }

        target.on('click', 'clusters', (e) => {
          const feature = target.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
          const clusterId = feature?.properties?.cluster_id;
          const center = feature ? pointCoords(feature.geometry) : null;
          if (clusterId === undefined || !center) return;
          const source = target.getSource('cases') as import('maplibre-gl').GeoJSONSource;
          source.getClusterExpansionZoom(clusterId).then((zoom) => {
            target.easeTo({ center, zoom });
          });
        });

        target.on('click', 'case-points', (e) => {
          const feature = e.features?.[0];
          const at = feature ? pointCoords(feature.geometry) : null;
          if (!feature || !at) return;
          const p = feature.properties as Record<string, string>;

          const node = document.createElement('div');
          node.innerHTML = `
            <p class="fb-popup-number">${escapeHtml(p.caseNumber)}</p>
            <p class="fb-popup-address">${escapeHtml(p.address || 'No address recorded')}</p>
            <p class="fb-popup-meta">
              <span class="fb-popup-dot" style="background:${escapeHtml(p.statusColor)}"></span>
              ${escapeHtml(p.statusLabel)} · ${escapeHtml(p.typeName)}
            </p>
            <button type="button" class="fb-popup-open">Open case</button>`;
          node.querySelector('.fb-popup-open')?.addEventListener('click', () => {
            router.push(`/cases/${p.id}`);
          });

          new maplibregl.Popup({ closeButton: true, offset: 14 })
            .setLngLat(at)
            .setDOMContent(node)
            .addTo(target);
        });

        for (const layer of ['clusters', 'case-points']) {
          target.on('mouseenter', layer, () => {
            target.getCanvas().style.cursor = 'pointer';
          });
          target.on('mouseleave', layer, () => {
            target.getCanvas().style.cursor = '';
          });
        }
      }

      function build(mode: 'vector' | 'raster') {
        map?.remove();
        setStage('starting');
        setRenderer(mode);

        const created = new maplibregl.Map({
          container: container.current!,
          style: mode === 'vector' ? VECTOR_STYLE : RASTER_STYLE,
          center: [-86.15, 39.0],
          zoom: 4,
          attributionControl: { compact: true },
        });
        map = created;

        created.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

        // Report anything the library knows. The first version of this filtered
        // errors by message and swallowed the one that actually happened.
        created.on('error', (e) => {
          if (cancelled) return;
          const raw = (e as { error?: { message?: string } })?.error?.message ?? 'unknown error';
          // A vector failure is not terminal — the raster retry follows.
          if (mode === 'vector') return;
          setStage('failed');
          setMessage(
            /webgl|gpu|context/i.test(raw)
              ? `The graphics context failed: ${raw}. Hardware acceleration may be switched off.`
              : `The basemap could not be drawn: ${raw}`,
          );
        });

        created.on('styledata', () => {
          if (!cancelled) setStage((s) => (s === 'starting' ? 'style' : s));
        });

        created.on('load', () => {
          if (cancelled) return;
          addOverlay(created, mode);
          setStage('ready');
          if (mode === 'vector') setMessage(null);
        });
      }

      build('vector');

      // Vector did not get there in time: rebuild on the simpler style rather
      // than leaving a blank rectangle.
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return;
          setStage((current) => {
            if (current === 'ready') return current;
            setMessage('The detailed basemap did not load, so a simpler one is being used.');
            build('raster');
            return 'starting';
          });
        }, 8000),
      );

      // Raster did not get there either: stop pretending and show the list.
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return;
          setStage((current) => {
            if (current === 'ready') return current;
            setMessage(
              'Neither basemap finished loading. Everything the map needs answered when tested from this machine, so the likeliest cause is a browser extension or proxy blocking cartocdn.com — the network tab will say which request is stalling. The cases are listed below regardless.',
            );
            return 'failed';
          });
        }, 20000),
      );
    }

    void boot();

    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
      map?.remove();
    };
  }, [located, clustered, router]);

  if (located.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-edge-strong bg-sunken px-6 py-10 text-center">
        <p className="text-base font-medium text-ink">Nothing to place on a map</p>
        <p className="mx-auto mt-1 max-w-prose text-sm text-ink-secondary">
          None of the {cases.length} case{cases.length === 1 ? '' : 's'} in this result carries
          coordinates. Add a latitude and longitude to a case and it appears here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted" role="status">
          {located.length} of {cases.length} case{cases.length === 1 ? '' : 's'} positioned
          {stage === 'starting' ? ' · starting map…' : ''}
          {stage === 'style' ? ' · loading tiles…' : ''}
          {stage === 'ready' && renderer === 'raster' ? ' · simplified basemap' : ''}
        </p>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-secondary">
          <input
            type="checkbox"
            checked={clustered}
            onChange={(e) => setClustered(e.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer accent-[color:var(--accent)]"
          />
          Group nearby cases
        </label>
      </div>

      {message ? (
        <div className="flex items-start gap-2 rounded-lg border border-edge-strong bg-sunken px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">
              {stage === 'failed' ? 'The map could not be drawn' : 'Falling back to a simpler map'}
            </p>
            <p className="mt-0.5 text-sm text-ink-secondary">{message}</p>
          </div>
        </div>
      ) : null}

      {/* A failed map is a blank rectangle, which tells nobody anything. */}
      <div
        ref={container}
        role="application"
        aria-label={`Map of ${located.length} cases`}
        className={
          stage === 'failed'
            ? 'hidden'
            : 'h-[560px] w-full overflow-hidden rounded-lg border border-edge bg-sunken'
        }
      />

      {/* The map is not keyboard navigable; this is the same data, reachable. */}
      <details open={stage === 'failed'} className="rounded-lg border border-edge bg-raised">
        <summary className="cursor-pointer px-3 py-2 text-xs text-ink-secondary">
          {stage === 'failed' ? 'Positioned cases' : 'List the positioned cases'}
        </summary>
        <ul className="divide-y divide-edge border-t border-edge">
          {located.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <a
                href={`/cases/${c.id}`}
                className="tabular font-mono text-xs font-medium text-ink hover:text-accent"
              >
                {c.case_number}
              </a>
              <span className="flex-1 truncate text-ink-secondary">{c.address ?? '—'}</span>
              <span className="tabular font-mono text-2xs text-ink-muted">
                {c.lat!.toFixed(4)}, {c.lng!.toFixed(4)}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/** Narrow a GeoJSON geometry to a point position, rather than forcing a cast. */
function pointCoords(geometry: import('geojson').Geometry): [number, number] | null {
  return geometry.type === 'Point' ? [geometry.coordinates[0], geometry.coordinates[1]] : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
