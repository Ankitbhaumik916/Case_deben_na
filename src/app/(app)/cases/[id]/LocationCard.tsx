'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, MapPin, Search } from 'lucide-react';
import { geocodeCase, saveLocation } from '@/lib/actions/case-location';
import { Button } from '@/components/ui';

/**
 * The coordinates that decide whether a case appears on the map.
 *
 * A looked-up position is shown as a suggestion with the address the geocoder
 * matched, and is not written until someone accepts it. Getting the wrong
 * street silently pinned to a case file is worse than having no pin.
 */
export function LocationCard({
  caseId,
  address,
  lat,
  lng,
  canWrite,
}: {
  caseId: string;
  address: string;
  lat: number | null;
  lng: number | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [latText, setLatText] = React.useState(lat === null ? '' : String(lat));
  const [lngText, setLngText] = React.useState(lng === null ? '' : String(lng));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [suggestion, setSuggestion] = React.useState<{
    lat: number;
    lng: number;
    label: string;
    matchedOn: string;
    exact: boolean;
  } | null>(null);

  const placed = lat !== null && lng !== null;

  async function lookUp() {
    setError(null);
    setSuggestion(null);
    setBusy(true);
    const result = await geocodeCase(caseId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuggestion({
      lat: result.lat!,
      lng: result.lng!,
      label: result.label ?? '',
      matchedOn: result.matchedOn ?? '',
      exact: result.exact ?? true,
    });
  }

  async function commit(nextLat: number | null, nextLng: number | null) {
    setError(null);
    setBusy(true);
    const result = await saveLocation({ caseId, lat: nextLat, lng: nextLng });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuggestion(null);
    setSaved(true);
    setLatText(result.lat === null ? '' : String(result.lat));
    setLngText(result.lng === null ? '' : String(result.lng));
    window.setTimeout(() => setSaved(false), 3000);
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-edge bg-raised p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <MapPin className="h-4 w-4 text-ink-secondary" aria-hidden="true" />
          Position on the map
        </h2>
        {saved ? (
          <span className="flex items-center gap-1 text-xs text-[color:var(--success)]" role="status">
            <Check className="h-3 w-3" aria-hidden="true" />
            Saved
          </span>
        ) : (
          <span className="text-xs text-ink-muted">
            {placed ? 'Shown on the map' : 'Not on the map yet'}
          </span>
        )}
      </div>

      {!placed ? (
        <p className="mb-2 text-xs text-ink-secondary">
          A case only appears in the map view once it has coordinates. Look them up from the
          address, or type them in.
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="lat" className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-muted">
            Latitude
          </label>
          <input
            id="lat"
            inputMode="decimal"
            disabled={!canWrite || busy}
            value={latText}
            onChange={(e) => setLatText(e.target.value)}
            placeholder="13.0837"
            className="tabular h-9 w-32 rounded border border-edge-strong bg-raised px-2.5 font-mono text-sm text-ink placeholder:text-ink-muted disabled:bg-sunken"
          />
        </div>
        <div>
          <label htmlFor="lng" className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-muted">
            Longitude
          </label>
          <input
            id="lng"
            inputMode="decimal"
            disabled={!canWrite || busy}
            value={lngText}
            onChange={(e) => setLngText(e.target.value)}
            placeholder="80.2702"
            className="tabular h-9 w-32 rounded border border-edge-strong bg-raised px-2.5 font-mono text-sm text-ink placeholder:text-ink-muted disabled:bg-sunken"
          />
        </div>

        {canWrite ? (
          <>
            <Button
              size="md"
              loading={busy}
              onClick={() => {
                const nextLat = latText.trim() === '' ? null : Number(latText);
                const nextLng = lngText.trim() === '' ? null : Number(lngText);
                if ((nextLat === null) !== (nextLng === null)) {
                  setError('Give both a latitude and a longitude, or clear both.');
                  return;
                }
                if (nextLat !== null && (Number.isNaN(nextLat) || Number.isNaN(nextLng!))) {
                  setError('Those are not numbers.');
                  return;
                }
                void commit(nextLat, nextLng);
              }}
            >
              Save position
            </Button>

            <Button size="md" variant="secondary" onClick={lookUp} disabled={busy}>
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              Find from address
            </Button>

            {placed ? (
              <Button size="md" variant="ghost" onClick={() => void commit(null, null)} disabled={busy}>
                Remove from map
              </Button>
            ) : null}
          </>
        ) : (
          <span className="text-xs text-ink-muted">Read-only</span>
        )}
      </div>

      {address ? (
        <p className="mt-2 text-xs text-ink-muted">Looking up: {address}</p>
      ) : (
        <p className="mt-2 text-xs text-ink-muted">
          No address recorded, so a lookup has nothing to work from.
        </p>
      )}

      {suggestion ? (
        <div className="mt-2 rounded border border-edge bg-sunken p-2.5">
          <p className="text-xs text-ink-secondary">The geocoder matched:</p>
          <p className="mt-0.5 text-sm text-ink">{suggestion.label}</p>
          <p className="tabular mt-0.5 font-mono text-xs text-ink-muted">
            {suggestion.lat.toFixed(5)}, {suggestion.lng.toFixed(5)}
          </p>
          {!suggestion.exact ? (
            <p className="mt-1.5 rounded border border-edge-strong bg-raised px-2 py-1.5 text-xs text-ink-secondary">
              The full address did not match, so it fell back to{' '}
              <span className="font-medium text-ink">{suggestion.matchedOn}</span>. That is an
              area, not a doorstep — check it before accepting, or type exact coordinates.
            </p>
          ) : null}
          <div className="mt-2 flex gap-2">
            <Button size="sm" loading={busy} onClick={() => void commit(suggestion.lat, suggestion.lng)}>
              Use this
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setSuggestion(null)}>
              Discard
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-2 flex items-start gap-2 rounded border border-danger bg-danger-subtle px-2.5 py-2 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </section>
  );
}
