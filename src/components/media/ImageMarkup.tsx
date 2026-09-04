'use client';

import * as React from 'react';
import {
  ArrowUpRight,
  Circle,
  Eye,
  EyeOff,
  MousePointer2,
  Pencil,
  Square,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Mark-up on a case photograph.
 *
 * Shapes are drawn over the image as SVG and stored beside it, never burned in.
 * The uploaded file stays byte-for-byte what was uploaded — an exhibit does not
 * get quietly replaced by an edited copy of itself — and the mark-up stays
 * reversible: correct it, remove it, or turn it off to see the original.
 *
 * Coordinates are fractions of the image's own dimensions, so the same shapes
 * land in the same places on a thumbnail, on a full-size view and in print.
 */

export type Shape =
  | { id: string; kind: 'rect'; color: string; stroke: number; x: number; y: number; w: number; h: number }
  | { id: string; kind: 'ellipse'; color: string; stroke: number; x: number; y: number; w: number; h: number }
  | { id: string; kind: 'arrow'; color: string; stroke: number; x1: number; y1: number; x2: number; y2: number }
  | { id: string; kind: 'free'; color: string; stroke: number; pts: number[] }
  | { id: string; kind: 'text'; color: string; x: number; y: number; size: number; text: string };

type Tool = 'select' | 'rect' | 'ellipse' | 'arrow' | 'free' | 'text';

const COLORS = ['#e5484d', '#f5a524', '#30a46c', '#0091ff', '#ffffff', '#11181c'];

const TOOLS: [Tool, string, React.ComponentType<{ className?: string }>][] = [
  ['select', 'Select and remove', MousePointer2],
  ['arrow', 'Arrow', ArrowUpRight],
  ['rect', 'Box', Square],
  ['ellipse', 'Ellipse', Circle],
  ['free', 'Freehand', Pencil],
  ['text', 'Label', Type],
];

const uid = () => Math.random().toString(36).slice(2, 10);

/** Read-only overlay. Used in the gallery, the detail view and the printed log. */
export function MarkupOverlay({
  shapes,
  className,
}: {
  shapes: Shape[];
  className?: string;
}) {
  if (shapes.length === 0) return null;
  return (
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
    >
      {shapes.map((s) => (
        <ShapeNode key={s.id} shape={s} />
      ))}
    </svg>
  );
}

/**
 * One shape. Rendered into a 1000x1000 viewBox stretched over the image, so a
 * fraction of the width becomes a coordinate by multiplying by 1000.
 *
 * Stroke widths are divided by the aspect distortion nowhere — a stretched
 * viewBox would skew them — so `vector-effect: non-scaling-stroke` keeps every
 * line the same weight whatever shape the image is.
 */
function ShapeNode({ shape }: { shape: Shape }) {
  const K = 1000;
  const common = {
    stroke: shape.kind === 'text' ? undefined : shape.color,
    strokeWidth: shape.kind === 'text' ? undefined : shape.stroke,
    fill: 'none',
    vectorEffect: 'non-scaling-stroke' as const,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (shape.kind) {
    case 'rect':
      return (
        <rect
          {...common}
          x={Math.min(shape.x, shape.x + shape.w) * K}
          y={Math.min(shape.y, shape.y + shape.h) * K}
          width={Math.abs(shape.w) * K}
          height={Math.abs(shape.h) * K}
        />
      );
    case 'ellipse':
      return (
        <ellipse
          {...common}
          cx={(shape.x + shape.w / 2) * K}
          cy={(shape.y + shape.h / 2) * K}
          rx={Math.abs(shape.w / 2) * K}
          ry={Math.abs(shape.h / 2) * K}
        />
      );
    case 'arrow': {
      const head = `arrowhead-${shape.id}`;
      return (
        <g>
          <defs>
            <marker
              id={head}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
              markerUnits="strokeWidth"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={shape.color} />
            </marker>
          </defs>
          <line
            {...common}
            x1={shape.x1 * K}
            y1={shape.y1 * K}
            x2={shape.x2 * K}
            y2={shape.y2 * K}
            markerEnd={`url(#${head})`}
          />
        </g>
      );
    }
    case 'free': {
      const d = shape.pts.reduce(
        (acc, v, i) =>
          i % 2 === 0 ? `${acc}${i === 0 ? 'M' : 'L'}${v * K} ` : `${acc}${v * K} `,
        '',
      );
      return <path {...common} d={d.trim()} />;
    }
    case 'text':
      return (
        <text
          x={shape.x * K}
          y={shape.y * K}
          fill={shape.color}
          fontSize={shape.size * K}
          fontWeight={600}
          stroke="rgba(0,0,0,0.55)"
          strokeWidth={0.5}
          paintOrder="stroke"
          vectorEffect="non-scaling-stroke"
          style={{ fontFamily: 'var(--font-sans), system-ui, sans-serif' }}
        >
          {shape.text}
        </text>
      );
  }
}

export function ImageMarkup({
  src,
  alt,
  shapes,
  canEdit,
  onChange,
}: {
  src: string;
  alt: string;
  shapes: Shape[];
  canEdit: boolean;
  onChange: (next: Shape[]) => void;
}) {
  const [tool, setTool] = React.useState<Tool>('arrow');
  const [color, setColor] = React.useState(COLORS[0]);
  const [stroke, setStroke] = React.useState(3);
  const [draft, setDraft] = React.useState<Shape | null>(null);
  const [visible, setVisible] = React.useState(true);
  const [selected, setSelected] = React.useState<string | null>(null);
  const surfaceRef = React.useRef<HTMLDivElement>(null);

  // Where a pointer is, as a fraction of the image box.
  function at(e: React.PointerEvent): { x: number; y: number } {
    const box = surfaceRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!canEdit || !visible) return;
    const p = at(e);

    if (tool === 'select') {
      setSelected(null);
      return;
    }

    if (tool === 'text') {
      const text = window.prompt('Label text');
      if (!text?.trim()) return;
      onChange([
        ...shapes,
        { id: uid(), kind: 'text', color, x: p.x, y: p.y, size: 0.045, text: text.trim() },
      ]);
      return;
    }

    (e.target as Element).setPointerCapture?.(e.pointerId);

    if (tool === 'free') {
      setDraft({ id: uid(), kind: 'free', color, stroke, pts: [p.x, p.y] });
    } else if (tool === 'arrow') {
      setDraft({ id: uid(), kind: 'arrow', color, stroke, x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    } else {
      setDraft({ id: uid(), kind: tool, color, stroke, x: p.x, y: p.y, w: 0, h: 0 });
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!draft) return;
    const p = at(e);
    setDraft((d) => {
      if (!d) return d;
      if (d.kind === 'free') return { ...d, pts: [...d.pts, p.x, p.y] };
      if (d.kind === 'arrow') return { ...d, x2: p.x, y2: p.y };
      if (d.kind === 'rect' || d.kind === 'ellipse') return { ...d, w: p.x - d.x, h: p.y - d.y };
      return d;
    });
  }

  function onPointerUp() {
    if (!draft) return;
    // A click that never moved is not a shape — it would leave an invisible
    // zero-size artefact that only shows up as a stray entry in the count.
    const tiny =
      (draft.kind === 'rect' || draft.kind === 'ellipse') &&
      Math.abs(draft.w) < 0.01 &&
      Math.abs(draft.h) < 0.01;
    const stub = draft.kind === 'free' && draft.pts.length < 6;
    const dot =
      draft.kind === 'arrow' &&
      Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) < 0.02;

    if (!tiny && !stub && !dot) onChange([...shapes, draft]);
    setDraft(null);
  }

  const shown = visible ? shapes : [];

  return (
    <div className="space-y-2">
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded border border-edge bg-sunken px-2 py-1.5">
          <div role="radiogroup" aria-label="Mark-up tool" className="flex items-center gap-0.5">
            {TOOLS.map(([key, label, Glyph]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={tool === key}
                title={label}
                aria-label={label}
                disabled={!visible}
                onClick={() => setTool(key)}
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded transition-colors duration-150',
                  visible ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
                  tool === key
                    ? 'bg-chrome text-ink-inverse'
                    : 'text-ink-secondary hover:bg-raised hover:text-ink',
                )}
              >
                <Glyph className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>

          <span className="mx-0.5 h-4 w-px bg-edge" aria-hidden="true" />

          <div role="radiogroup" aria-label="Colour" className="flex items-center gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={`Colour ${c}`}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={cn(
                  'h-4 w-4 cursor-pointer rounded-full border transition-transform duration-150',
                  color === c
                    ? 'scale-125 border-ink'
                    : 'border-edge-strong hover:scale-110',
                )}
              />
            ))}
          </div>

          <span className="mx-0.5 h-4 w-px bg-edge" aria-hidden="true" />

          <label className="flex items-center gap-1.5 text-2xs text-ink-secondary">
            Weight
            <input
              type="range"
              min={1}
              max={8}
              value={stroke}
              onChange={(e) => setStroke(Number(e.target.value))}
              className="h-1 w-16 cursor-pointer accent-[color:var(--accent)]"
              aria-label="Line weight"
            />
          </label>

          <div className="ml-auto flex items-center gap-0.5">
            <IconButton
              label={visible ? 'Hide mark-up' : 'Show mark-up'}
              onClick={() => setVisible((v) => !v)}
            >
              {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </IconButton>
            <IconButton
              label="Undo last"
              disabled={shapes.length === 0}
              onClick={() => onChange(shapes.slice(0, -1))}
            >
              <Undo2 className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              label="Remove all mark-up"
              disabled={shapes.length === 0}
              onClick={() => {
                if (window.confirm('Remove every mark on this photograph?')) onChange([]);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        </div>
      ) : null}

      <div
        ref={surfaceRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn(
          'relative select-none overflow-hidden rounded border border-edge bg-sunken',
          canEdit && visible && tool !== 'select' && 'cursor-crosshair',
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
        <img src={src} alt={alt} draggable={false} className="block max-h-96 w-full object-contain" />
        <MarkupOverlay shapes={draft ? [...shown, draft] : shown} />

        {canEdit && tool === 'select' && visible ? (
          <svg
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            {shapes.map((s) => (
              <HitTarget
                key={s.id}
                shape={s}
                selected={selected === s.id}
                onPick={() => setSelected(s.id === selected ? null : s.id)}
              />
            ))}
          </svg>
        ) : null}
      </div>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2 text-2xs text-ink-muted">
          <span>
            {shapes.length === 0
              ? 'Nothing marked yet.'
              : `${shapes.length} mark${shapes.length === 1 ? '' : 's'}.`}{' '}
            The photograph itself is never altered — marks are stored separately and can be removed.
          </span>
          {selected ? (
            <button
              type="button"
              onClick={() => {
                onChange(shapes.filter((s) => s.id !== selected));
                setSelected(null);
              }}
              className="cursor-pointer font-medium text-danger underline underline-offset-2"
            >
              Delete the selected mark
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** A fat invisible stroke over each shape, so thin lines are still clickable. */
function HitTarget({
  shape,
  selected,
  onPick,
}: {
  shape: Shape;
  selected: boolean;
  onPick: () => void;
}) {
  const K = 1000;
  const hit = {
    stroke: selected ? 'var(--accent)' : 'transparent',
    strokeWidth: selected ? 3 : 14,
    fill: 'none',
    vectorEffect: 'non-scaling-stroke' as const,
    className: 'cursor-pointer',
    onClick: onPick,
  };

  if (shape.kind === 'rect' || shape.kind === 'ellipse') {
    return (
      <rect
        {...hit}
        x={Math.min(shape.x, shape.x + shape.w) * K}
        y={Math.min(shape.y, shape.y + shape.h) * K}
        width={Math.abs(shape.w) * K}
        height={Math.abs(shape.h) * K}
      />
    );
  }
  if (shape.kind === 'arrow') {
    return <line {...hit} x1={shape.x1 * K} y1={shape.y1 * K} x2={shape.x2 * K} y2={shape.y2 * K} />;
  }
  if (shape.kind === 'free') {
    const d = shape.pts.reduce(
      (acc, v, i) => (i % 2 === 0 ? `${acc}${i === 0 ? 'M' : 'L'}${v * K} ` : `${acc}${v * K} `),
      '',
    );
    return <path {...hit} d={d.trim()} />;
  }
  return (
    <rect
      {...hit}
      x={shape.x * K - 10}
      y={shape.y * K - shape.size * K}
      width={shape.text.length * shape.size * K * 0.6 + 20}
      height={shape.size * K * 1.4}
    />
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-ink-secondary transition-colors duration-150 hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
