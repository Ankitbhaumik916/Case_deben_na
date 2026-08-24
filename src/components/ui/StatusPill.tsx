import { cn } from '@/lib/utils';

/**
 * The one place a case status is drawn.
 *
 * The colour comes from case_statuses.color, which an admin picks in the
 * builder — so it is arbitrary at render time and cannot be trusted to contrast
 * with anything. Rather than colouring the text and hoping, the label stays in
 * the normal ink and the colour is carried by a solid dot plus a faint tint.
 * That reads at a glance, survives any hex an admin chooses, and keeps the pill
 * legible in the middle of a dense table.
 *
 * Using this everywhere is what makes a status look the same in the list, on
 * the kanban board and in the case header.
 */
export function StatusPill({
  label,
  color,
  size = 'md',
  className,
}: {
  label: string | null;
  color: string | null;
  size?: 'sm' | 'md';
  className?: string;
}) {
  if (!label) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-edge-strong" />
        No status
      </span>
    );
  }

  const tint = color ?? 'var(--text-muted)';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium text-ink',
        size === 'sm' ? 'px-1.5 py-0.5 text-2xs' : 'px-2 py-0.5 text-xs',
        className,
      )}
      style={{
        borderColor: `color-mix(in srgb, ${tint} 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${tint} 10%, transparent)`,
      }}
    >
      <span
        aria-hidden="true"
        className={cn('shrink-0 rounded-full', size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2')}
        style={{ backgroundColor: tint }}
      />
      {label}
    </span>
  );
}
