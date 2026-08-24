'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { CaseRow } from './types';

/**
 * Clustered case map.
 *
 * Raster basemap, on purpose.
 *
 * The vector version of the same CARTO style was the first choice and it does
 * look better, but it pulls a style document, a sprite sheet and glyph ranges
 * from a second host and then decodes vector tiles on the GPU. On the first
 * machine this ran on it stalled indefinitely — every one of those URLs
 * answered in under 200ms from a shell on the same network, so something in
 * the browser was filtering them. A basemap that fails on the developer's own
 * laptop is not a basemap.
 *
 * This asks for one thing: PNG tiles. No style document, no sprite, no glyphs,
 * no vector decoding. Visually it is the same Positron design.
 *
 * Because there are no glyphs there is no symbol layer, so cluster counts are
 * drawn as DOM markers rather than map labels. That removes the last dependency
 * on a font endpoint and keeps the numbers.
 *
 * To go back to vector, point BASEMAP at the style.json and re-add a symbol
 * layer — but read the paragraph above first.
 */

const BASEMAP = {
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

type Stage = 'starting' | 'ready' | 'failed';

export function CaseMap({ cases }: { cases: CaseRow[] }) {
  const router = useRouter();
  const container = React.useRef<HTMLDivElement>(null);
  const [stage, setStage] = React.useState<Stage>('starting');
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
    const labels = new Map<number, import('maplibre-gl').Marker>();
    let timeout: number | undefined;

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

      const target = new maplibregl.Map({
        container: container.current,
        style: BASEMAP,
        center: [-86.15, 39.0],
        zoom: 4,
        attributionControl: { compact: true },
      });
      map = target;

      target.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      // Report anything the library knows. An earlier version filtered errors by
      // message and swallowed the one that actually happened.
      target.on('error', (e) => {
        if (cancelled) return;
        const raw = (e as { error?: { message?: string } })?.error?.message ?? 'unknown error';
        setStage('failed');
        setMessage(
          /webgl|gpu|context/i.test(raw)
            ? `The graphics context failed: ${raw}. Hardware acceleration may be switched off.`
            : `The basemap could not be drawn: ${raw}`,
        );
      });

      // 'load' never firing is its own failure mode, and no error event
      // necessarily reports it.
      timeout = window.setTimeout(() => {
        if (cancelled) return;
        setStage((current) => {
          if (current === 'ready') return current;
          setMessage(
            'The map tiles did not arrive. Everything it needs answered when tested from this machine, so a browser extension or proxy filtering cartocdn.com is the likeliest cause — the network tab will name the stalled request. The cases are listed below regardless.',
          );
          return 'failed';
        });
      }, 12000);

      /**
       * Cluster counts as DOM markers.
       *
       * A symbol layer would be less code, but it needs glyphs from a font
       * endpoint — one more request to be blocked, which is the failure this
       * whole component is working around. Markers are plain HTML and cost
       * nothing extra to fetch.
       */
      function syncLabels() {
        if (cancelled || !map) return;

        const seen = new Set<number>();
        if (clustered) {
          for (const feature of map.queryRenderedFeatures({ layers: ['clusters'] })) {
            const id = feature.properties?.cluster_id as number | undefined;
            const at = pointCoords(feature.geometry);
            if (id === undefined || !at) continue;
            seen.add(id);

            let marker = labels.get(id);
            if (!marker) {
              const el = document.createElement('div');
              el.className = 'fb-cluster-count';
              marker = new maplibregl.Marker({ element: el }).setLngLat(at).addTo(map);
              labels.set(id, marker);
            }
            marker.setLngLat(at);
            marker.getElement().textContent = String(
              feature.properties?.point_count_abbreviated ?? feature.properties?.point_count ?? '',
            );
          }
        }

        for (const [id, marker] of labels) {
          if (!seen.has(id)) {
            marker.remove();
            labels.delete(id);
          }
        }
      }

      target.on('load', () => {
        if (cancelled) return;
        window.clearTimeout(timeout);

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

        // 'idle' fires once the frame has settled, which is when the cluster
        // features are actually queryable.
        target.on('idle', syncLabels);
        target.on('move', syncLabels);

        setStage('ready');
        setMessage(null);
      });
    }

    void boot();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      labels.forEach((m) => m.remove());
      labels.clear();
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
          {stage === 'starting' ? ' · loading map…' : ''}
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

      {stage === 'failed' && message ? (
        <div className="flex items-start gap-2 rounded-lg border border-edge-strong bg-sunken px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">The map could not be drawn</p>
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
