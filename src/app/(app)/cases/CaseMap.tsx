'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { CaseRow } from './types';

/**
 * Clustered case map.
 *
 * MapLibre with CARTO's Positron basemap: vector tiles, no account, no API key,
 * and a near-monochrome style that leaves the status colours as the only
 * saturated thing on screen — the same rule the rest of the interface follows.
 *
 * The library is ~800KB, so it is imported inside an effect rather than at the
 * top of the module. Nothing is fetched until someone actually opens the map.
 */

const BASEMAP = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

export function CaseMap({ cases }: { cases: CaseRow[] }) {
  const router = useRouter();
  const container = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<unknown>(null);
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'failed'>('loading');
  const [clustered, setClustered] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);

  const located = React.useMemo(
    () => cases.filter((c) => c.lat !== null && c.lng !== null),
    [cases],
  );

  React.useEffect(() => {
    let cancelled = false;
    let map: import('maplibre-gl').Map | null = null;
    const timeouts: number[] = [];

    async function boot() {
      if (!container.current) return;

      let maplibregl: typeof import('maplibre-gl');
      try {
        maplibregl = await import('maplibre-gl');
      } catch {
        if (!cancelled) {
          setStatus('failed');
          setMessage('The map library could not be loaded.');
        }
        return;
      }
      if (cancelled || !container.current) return;

      // MapLibre v5+ requires WebGL 2. Checking first turns an opaque library
      // failure into a sentence that names the actual problem.
      const probe = document.createElement('canvas');
      if (!probe.getContext('webgl2')) {
        setStatus('failed');
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

      map = new maplibregl.Map({
        container: container.current,
        style: BASEMAP,
        center: [-86.15, 39.0],
        zoom: 4,
        attributionControl: { compact: true },
      });
      mapRef.current = map;

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      /*
       * Surface EVERY error, not a hand-picked subset.
       *
       * The first version only reported errors whose message matched
       * /style|tile|fetch|network/. A GPU initialisation failure says none of
       * those things, so the map sat on "loading map..." forever with a blank
       * canvas and told the user nothing. A blank box with no explanation is
       * the worst outcome available; anything the library knows is better.
       */
      map.on('error', (e) => {
        if (cancelled) return;
        const raw = (e as { error?: { message?: string } })?.error?.message ?? 'Unknown map error';
        setStatus('failed');
        setMessage(
          /webgl|gpu|context/i.test(raw)
            ? `The map could not start the graphics context (${raw}). This usually means hardware acceleration is switched off in the browser, or the GPU does not support WebGL 2.`
            : `The map could not load: ${raw}`,
        );
      });

      // 'load' never firing is its own failure mode, and one no error event
      // necessarily reports. Do not spin on "loading" indefinitely.
      const loadTimeout = window.setTimeout(() => {
        if (cancelled) return;
        setStatus((current) => {
          if (current === 'loading') {
            setMessage(
              'The map did not finish loading within 15 seconds. The basemap CDN may be blocked on this network.',
            );
            return 'failed';
          }
          return current;
        });
      }, 15000);
      timeouts.push(loadTimeout);

      map.on('load', () => {
        if (cancelled || !map) return;

        map.addSource('cases', {
          type: 'geojson',
          data: geojson,
          cluster: clustered,
          clusterRadius: 45,
          clusterMaxZoom: 12,
        });

        map.addLayer({
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

        map.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: 'cases',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-size': 12,
          },
          paint: { 'text-color': '#ffffff' },
        });

        // Individual cases carry their status colour — the one saturated thing
        // on a deliberately desaturated basemap.
        map.addLayer({
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
          map.setCenter([located[0].lng!, located[0].lat!]);
          map.setZoom(11);
        } else if (located.length > 1) {
          map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 0 });
        }

        map.on('click', 'clusters', (e) => {
          const feature = map!.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
          const clusterId = feature?.properties?.cluster_id;
          if (clusterId === undefined) return;
          const center = pointCoords(feature.geometry);
          if (!center) return;
          const source = map!.getSource('cases') as import('maplibre-gl').GeoJSONSource;
          source.getClusterExpansionZoom(clusterId).then((zoom) => {
            map!.easeTo({ center, zoom });
          });
        });

        map.on('click', 'case-points', (e) => {
          const feature = e.features?.[0];
          if (!feature) return;
          const p = feature.properties as Record<string, string>;
          const at = pointCoords(feature.geometry);
          if (!at) return;

          const node = document.createElement('div');
          node.className = 'fb-popup';
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
            .addTo(map!);
        });

        for (const layer of ['clusters', 'case-points']) {
          map.on('mouseenter', layer, () => {
            map!.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', layer, () => {
            map!.getCanvas().style.cursor = '';
          });
        }

        window.clearTimeout(loadTimeout);
        setStatus('ready');
      });
    }

    void boot();

    return () => {
      cancelled = true;
      timeouts.forEach((t) => window.clearTimeout(t));
      map?.remove();
      mapRef.current = null;
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
          {status === 'loading' ? ' · loading map…' : ''}
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

      {status === 'failed' && message ? (
        <div className="flex items-start gap-2 rounded-lg border border-edge-strong bg-sunken px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">The map could not be drawn</p>
            <p className="mt-0.5 text-sm text-ink-secondary">{message}</p>
          </div>
        </div>
      ) : null}

      {/*
        A failed map is a blank rectangle, which tells nobody anything. Drop the
        canvas entirely in that case and let the list below carry the data.
      */}
      {status !== 'failed' ? (
        <div
          ref={container}
          role="application"
          aria-label={`Map of ${located.length} cases`}
          className="h-[560px] w-full overflow-hidden rounded-lg border border-edge bg-sunken"
        />
      ) : null}

      {/* The map is not keyboard navigable; this is the same data, reachable.
          Open by default when there is no map to look at. */}
      <details open={status === 'failed'} className="rounded-lg border border-edge bg-raised">
        <summary className="cursor-pointer px-3 py-2 text-xs text-ink-secondary">
          {status === 'failed' ? 'Positioned cases' : 'List the positioned cases'}
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
function pointCoords(
  geometry: import('geojson').Geometry,
): [number, number] | null {
  return geometry.type === 'Point'
    ? [geometry.coordinates[0], geometry.coordinates[1]]
    : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
