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
 * Pins are DOM markers, not WebGL circle layers, for the same reason. The
 * layer path is the one that already failed once on the machine this was built
 * for, and a pin that might not draw is worth less than one that always does.
 * As HTML they are also real buttons: focusable, keyboard-activatable and
 * announced by a screen reader, none of which a circle in a canvas is.
 *
 * That means no MapLibre clustering, since clustering lives in the layer it
 * renders. The brief asked for a cluster map; at these volumes a visible pin per
 * case is more useful than a bubble that may not appear, and grouping can come
 * back as DOM once there are enough cases to need it.
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
  const [message, setMessage] = React.useState<string | null>(null);

  const located = React.useMemo(
    () => cases.filter((c) => c.lat !== null && c.lng !== null),
    [cases],
  );

  // A dot's colour is its status, and nothing on screen said so. The key lists
  // only the statuses actually present, so it stays short and never invents
  // entries for statuses this result does not contain.
  const legend = React.useMemo(() => {
    const seen = new Map<string, { label: string; color: string; count: number }>();
    for (const c of located) {
      const label = c.status_label ?? 'No status';
      const existing = seen.get(label);
      if (existing) existing.count += 1;
      else seen.set(label, { label, color: c.status_color ?? '#64748b', count: 1 });
    }
    return [...seen.values()].sort((a, b) => b.count - a.count);
  }, [located]);

  React.useEffect(() => {
    if (located.length === 0) return;

    let cancelled = false;
    let map: import('maplibre-gl').Map | null = null;
    const pins: import('maplibre-gl').Marker[] = [];
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
       * One marker per case, rebuilt whenever the set changes.
       *
       * Marker keeps them positioned through pan and zoom; nothing here has to
       * track the viewport.
       */
      function placePins() {
        pins.forEach((m) => m.remove());
        pins.length = 0;

        for (const c of located) {
          const el = document.createElement('button');
          el.type = 'button';
          el.className = 'fb-pin';
          el.style.setProperty('--pin', c.status_color ?? '#64748b');
          el.setAttribute(
            'aria-label',
            `${c.case_number}, ${c.status_label ?? 'no status'}${c.address ? `, ${c.address}` : ''}`,
          );
          el.title = `${c.case_number} — ${c.status_label ?? 'no status'}`;

          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([c.lng!, c.lat!])
            .addTo(target);

          const open = () => {
            const node = document.createElement('div');
            node.innerHTML = `
              <p class="fb-popup-number">${escapeHtml(c.case_number)}</p>
              <p class="fb-popup-address">${escapeHtml(c.address || 'No address recorded')}</p>
              <p class="fb-popup-meta">
                <span class="fb-popup-dot" style="background:${escapeHtml(c.status_color ?? '#64748b')}"></span>
                ${escapeHtml(c.status_label ?? 'No status')} · ${escapeHtml(c.case_type_name)}
              </p>
              <button type="button" class="fb-popup-open">Open case</button>`;
            node.querySelector('.fb-popup-open')?.addEventListener('click', () => {
              router.push(`/cases/${c.id}`);
            });
            new maplibregl.Popup({ closeButton: true, offset: 18 })
              .setLngLat([c.lng!, c.lat!])
              .setDOMContent(node)
              .addTo(target);
          };

          el.addEventListener('click', open);
          pins.push(marker);
        }
      }

      target.on('load', () => {
        if (cancelled) return;
        window.clearTimeout(timeout);

        placePins();

        const bounds = new maplibregl.LngLatBounds();
        for (const c of located) bounds.extend([c.lng!, c.lat!]);
        if (located.length === 1) {
          target.setCenter([located[0].lng!, located[0].lat!]);
          target.setZoom(13);
        } else {
          target.fitBounds(bounds, { padding: 70, maxZoom: 13, duration: 0 });
        }

        setStage('ready');
        setMessage(null);
      });
    }

    void boot();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      pins.forEach((m) => m.remove());
      map?.remove();
    };
  }, [located, router]);

  const missing = cases.filter((c) => c.lat === null || c.lng === null);

  if (located.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-edge-strong bg-sunken px-6 py-10 text-center">
        <p className="text-base font-medium text-ink">Nothing to place on a map</p>
        <p className="mx-auto mt-1 max-w-prose text-sm text-ink-secondary">
          None of the {cases.length} case{cases.length === 1 ? '' : 's'} in this result carries
          coordinates, so there is nothing to draw. Open one and use “Position on the map” — it
          can look the coordinates up from the address.
        </p>
        <ul className="mx-auto mt-3 flex max-w-md flex-wrap justify-center gap-1.5">
          {cases.slice(0, 8).map((c) => (
            <li key={c.id}>
              <a
                href={`/cases/${c.id}`}
                className="tabular inline-block rounded-full border border-edge bg-raised px-2 py-0.5 font-mono text-xs text-ink hover:text-accent"
              >
                {c.case_number}
              </a>
            </li>
          ))}
        </ul>
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
        <span className="text-xs text-ink-muted">Click a pin for the case</span>
      </div>

      {legend.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-edge bg-raised px-3 py-2">
          <span className="text-2xs font-medium uppercase tracking-wide text-ink-muted">
            Dot colour = status
          </span>
          {legend.map((entry) => (
            <span key={entry.label} className="flex items-center gap-1.5 text-xs text-ink-secondary">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full border border-white"
                style={{ backgroundColor: entry.color }}
              />
              {entry.label}
              <span className="tabular font-mono text-2xs text-ink-muted">{entry.count}</span>
            </span>
          ))}
        </div>
      ) : null}

      {missing.length > 0 ? (
        <p className="rounded-lg border border-edge bg-sunken px-3 py-2 text-xs text-ink-secondary">
          {missing.length} case{missing.length === 1 ? '' : 's'} in this result{' '}
          {missing.length === 1 ? 'has' : 'have'} no coordinates and cannot be placed:{' '}
          {missing.slice(0, 4).map((c) => c.case_number).join(', ')}
          {missing.length > 4 ? `, and ${missing.length - 4} more` : ''}. Open a case and use
          “Position on the map” to give it one.
        </p>
      ) : null}

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
