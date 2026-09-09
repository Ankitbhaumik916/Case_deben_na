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
 * reversible: correct it, move it, remove it, or turn it off to see the
 * original.
 *
 * Coordinates are fractions of the image's own dimensions, so the same shapes
 * land in the same places on a thumbnail, on a full-size view and in print.
 *
 * Two coordinate systems, on purpose. Shapes live in an SVG whose viewBox is
 * stretched over the image with preserveAspectRatio="none", which is what keeps
 * a mark in the same spot at any display size — but it also means anything
 * drawn in that space is squashed with it. So the drag handles are HTML,
 * positioned in percentages, which keeps them square whatever shape the
 * photograph is.
 */

export type Shape =
  | { id: string; kind: 'rect'; color: string; stroke: number; x: number; y: number; w: number; h: number }
  | { id: string; kind: 'ellipse'; color: string; stroke: number; x: number; y: number; w: number; h: number }
  | { id: string; kind: 'arrow'; color: string; stroke: number; x1: number; y1: number; x2: number; y2: number }
  | { id: string; kind: 'free'; color: string; stroke: number; pts: number[] }
  | { id: string; kind: 'text'; color: string; x: number; y: number; size: number; text: string };

type Tool = 'select' | 'rect' | 'ellipse' | 'arrow' | 'free' | 'text';

/** What a drag is doing to the selected shape. */
type Grip = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'p1' | 'p2';

const COLORS = ['#e5484d', '#f5a524', '#30a46c', '#0091ff', '#ffffff', '#11181c'];

const TOOLS: [Tool, string, React.ComponentType<{ className?: string }>][] = [
  ['select', 'Select, move and resize', MousePointer2],
  ['arrow', 'Arrow', ArrowUpRight],
  ['rect', 'Box', Square],
  ['ellipse', 'Ellipse', Circle],
  ['free', 'Freehand', Pencil],
  ['text', 'Label', Type],
];

const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** Read-only overlay. Used in the gallery, the detail view and the printed log. */
export function MarkupOverlay({ shapes, className }: { shapes: Shape[]; className?: string }) {
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

const K = 1000;

function ShapeNode({ shape }: { shape: Shape }) {
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
    case 'free':
      return <path {...common} d={pathOf(shape.pts)} />;
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

function pathOf(pts: number[]): string {
  let d = '';
  for (let i = 0; i < pts.length; i += 2) {
    d += `${i === 0 ? 'M' : 'L'}${pts[i] * K} ${pts[i + 1] * K} `;
  }
  return d.trim();
}

/* -------------------------------------------------------------- geometry -- */

/** The box a shape occupies, normalised so width and height are positive. */
function boundsOf(s: Shape): { x: number; y: number; w: number; h: number } {
  switch (s.kind) {
    case 'rect':
    case 'ellipse':
      return {
        x: Math.min(s.x, s.x + s.w),
        y: Math.min(s.y, s.y + s.h),
        w: Math.abs(s.w),
        h: Math.abs(s.h),
      };
    case 'arrow':
      return {
        x: Math.min(s.x1, s.x2),
        y: Math.min(s.y1, s.y2),
        w: Math.abs(s.x2 - s.x1),
        h: Math.abs(s.y2 - s.y1),
      };
    case 'free': {
      const xs = s.pts.filter((_, i) => i % 2 === 0);
      const ys = s.pts.filter((_, i) => i % 2 === 1);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    case 'text':
      // Rough, and only used to place a move handle: the text is drawn from its
      // baseline, so the box sits above the anchor.
      return {
        x: s.x,
        y: Math.max(0, s.y - s.size),
        w: Math.min(1 - s.x, s.text.length * s.size * 0.55),
        h: s.size * 1.3,
      };
  }
}

function moveShape(s: Shape, dx: number, dy: number): Shape {
  switch (s.kind) {
    case 'rect':
    case 'ellipse':
      return { ...s, x: clamp(s.x + dx), y: clamp(s.y + dy) };
    case 'arrow':
      return {
        ...s,
        x1: clamp(s.x1 + dx),
        y1: clamp(s.y1 + dy),
        x2: clamp(s.x2 + dx),
        y2: clamp(s.y2 + dy),
      };
    case 'free':
      return {
        ...s,
        pts: s.pts.map((v, i) => clamp(v + (i % 2 === 0 ? dx : dy))),
      };
    case 'text':
      return { ...s, x: clamp(s.x + dx), y: clamp(s.y + dy) };
  }
}

/** Apply a corner or endpoint drag. `origin` is the shape as it was on grab. */
function resizeShape(origin: Shape, grip: Grip, px: number, py: number): Shape {
  if (origin.kind === 'arrow') {
    if (grip === 'p1') return { ...origin, x1: clamp(px), y1: clamp(py) };
    if (grip === 'p2') return { ...origin, x2: clamp(px), y2: clamp(py) };
    return origin;
  }

  if (origin.kind === 'rect' || origin.kind === 'ellipse') {
    const b = boundsOf(origin);
    let { x, y, w, h } = b;
    const right = b.x + b.w;
    const bottom = b.y + b.h;

    if (grip === 'nw') {
      x = clamp(px);
      y = clamp(py);
      w = right - x;
      h = bottom - y;
    } else if (grip === 'ne') {
      y = clamp(py);
      w = clamp(px) - b.x;
      h = bottom - y;
    } else if (grip === 'sw') {
      x = clamp(px);
      w = right - x;
      h = clamp(py) - b.y;
    } else if (grip === 'se') {
      w = clamp(px) - b.x;
      h = clamp(py) - b.y;
    }
    return { ...origin, x, y, w, h };
  }

  // Freehand and text are moved, not resized — resizing a polyline point by
  // point is not worth the interface it would need.
  return origin;
}

/* ------------------------------------------------------------------ view -- */

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
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [live, setLive] = React.useState<Shape | null>(null);
  const [labelDraft, setLabelDraft] = React.useState<string | null>(null);
  const surfaceRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{ grip: Grip; origin: Shape; fromX: number; fromY: number } | null>(
    null,
  );

  // A shape deleted elsewhere must not stay selected.
  React.useEffect(() => {
    if (selectedId && !shapes.some((s) => s.id === selectedId)) {
      setSelectedId(null);
      setLabelDraft(null);
    }
  }, [shapes, selectedId]);

  const selected = shapes.find((s) => s.id === selectedId) ?? null;
  const rendered = shapes.map((s) => (live && live.id === s.id ? live : s));

  function at(e: React.PointerEvent | PointerEvent): { x: number; y: number } {
    const box = surfaceRef.current!.getBoundingClientRect();
    return {
      x: clamp((e.clientX - box.left) / box.width),
      y: clamp((e.clientY - box.top) / box.height),
    };
  }

  function replace(next: Shape) {
    onChange(shapes.map((s) => (s.id === next.id ? next : s)));
  }

  /* -------------------------------------------------------- drawing ------ */

  function onSurfaceDown(e: React.PointerEvent) {
    if (!canEdit || !visible) return;
    if (tool === 'select') {
      // A click on bare image clears the selection; hit targets stop propagation.
      setSelectedId(null);
      setLabelDraft(null);
      return;
    }

    const p = at(e);

    if (tool === 'text') {
      const text = window.prompt('Label text');
      if (!text?.trim()) return;
      const shape: Shape = {
        id: uid(),
        kind: 'text',
        color,
        x: p.x,
        y: p.y,
        size: 0.045,
        text: text.trim(),
      };
      onChange([...shapes, shape]);
      setTool('select');
      setSelectedId(shape.id);
      return;
    }

    (e.target as Element).setPointerCapture?.(e.pointerId);

    if (tool === 'free') setDraft({ id: uid(), kind: 'free', color, stroke, pts: [p.x, p.y] });
    else if (tool === 'arrow')
      setDraft({ id: uid(), kind: 'arrow', color, stroke, x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    else setDraft({ id: uid(), kind: tool, color, stroke, x: p.x, y: p.y, w: 0, h: 0 });
  }

  function onSurfaceMove(e: React.PointerEvent) {
    if (dragRef.current) {
      const d = dragRef.current;
      const p = at(e);
      setLive(
        d.grip === 'move'
          ? moveShape(d.origin, p.x - d.fromX, p.y - d.fromY)
          : resizeShape(d.origin, d.grip, p.x, p.y),
      );
      return;
    }

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

  function onSurfaceUp() {
    if (dragRef.current) {
      dragRef.current = null;
      if (live) replace(live);
      setLive(null);
      return;
    }

    if (!draft) return;
    // A click that never moved is not a shape — it would leave an invisible
    // zero-size artefact that only shows up as a stray entry in the count.
    const tiny =
      (draft.kind === 'rect' || draft.kind === 'ellipse') &&
      Math.abs(draft.w) < 0.01 &&
      Math.abs(draft.h) < 0.01;
    const stub = draft.kind === 'free' && draft.pts.length < 6;
    const dot =
      draft.kind === 'arrow' && Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) < 0.02;

    if (!tiny && !stub && !dot) {
      onChange([...shapes, draft]);
      // Drop straight into select so the mark just made can be adjusted, which
      // is what people try to do next.
      setTool('select');
      setSelectedId(draft.id);
    }
    setDraft(null);
  }

  /* -------------------------------------------------------- handles ------ */

  function beginDrag(e: React.PointerEvent, shape: Shape, grip: Grip) {
    if (!canEdit || !visible) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = at(e);
    dragRef.current = { grip, origin: shape, fromX: p.x, fromY: p.y };
    setSelectedId(shape.id);
    setLive(shape);
  }

  const shown = visible ? rendered : [];
  const selectedLive = live ?? selected;
  const box = selectedLive ? boundsOf(selectedLive) : null;

  return (
    <div className="space-y-2">
      {canEdit ? (
        <>
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
                  onClick={() => {
                    setColor(c);
                    // With something selected, the swatch recolours it rather
                    // than only setting what the next mark will be.
                    if (selected) replace({ ...selected, color: c });
                  }}
                  style={{ backgroundColor: c }}
                  className={cn(
                    'h-4 w-4 cursor-pointer rounded-full border transition-transform duration-150',
                    color === c ? 'scale-125 border-ink' : 'border-edge-strong hover:scale-110',
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
                value={selected && selected.kind !== 'text' ? selected.stroke : stroke}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setStroke(v);
                  if (selected && selected.kind !== 'text') replace({ ...selected, stroke: v });
                }}
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
                onClick={() => {
                  setSelectedId(null);
                  onChange(shapes.slice(0, -1));
                }}
              >
                <Undo2 className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label="Remove all mark-up"
                disabled={shapes.length === 0}
                onClick={() => {
                  if (window.confirm('Remove every mark on this photograph?')) {
                    setSelectedId(null);
                    onChange([]);
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          </div>

          {/* The selected mark's own controls, so editing is not guesswork. */}
          {selected ? (
            <div className="flex flex-wrap items-center gap-2 rounded border border-accent bg-accent-subtle px-2.5 py-1.5 text-xs">
              <span className="font-medium text-ink">
                {selected.kind === 'text' ? 'Label' : KIND_LABEL[selected.kind]} selected
              </span>

              {selected.kind === 'text' ? (
                labelDraft === null ? (
                  <button
                    type="button"
                    onClick={() => setLabelDraft(selected.text)}
                    className="cursor-pointer font-medium text-accent underline underline-offset-2"
                  >
                    Edit text
                  </button>
                ) : (
                  <span className="flex flex-1 items-center gap-1.5">
                    <input
                      autoFocus
                      value={labelDraft}
                      onChange={(e) => setLabelDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (labelDraft.trim()) replace({ ...selected, text: labelDraft.trim() });
                          setLabelDraft(null);
                        }
                        if (e.key === 'Escape') setLabelDraft(null);
                      }}
                      aria-label="Label text"
                      className="h-7 min-w-40 flex-1 rounded border border-edge-strong bg-raised px-2 text-xs text-ink"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (labelDraft.trim()) replace({ ...selected, text: labelDraft.trim() });
                        setLabelDraft(null);
                      }}
                      className="h-7 cursor-pointer rounded bg-chrome px-2 text-xs font-medium text-ink-inverse"
                    >
                      Save
                    </button>
                  </span>
                )
              ) : null}

              {selected.kind === 'text' ? (
                <label className="flex items-center gap-1.5 text-2xs text-ink-secondary">
                  Size
                  <input
                    type="range"
                    min={20}
                    max={140}
                    value={Math.round(selected.size * 1000)}
                    onChange={(e) => replace({ ...selected, size: Number(e.target.value) / 1000 })}
                    className="h-1 w-20 cursor-pointer accent-[color:var(--accent)]"
                    aria-label="Label size"
                  />
                </label>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  onChange(shapes.filter((s) => s.id !== selected.id));
                  setSelectedId(null);
                }}
                className="ml-auto cursor-pointer font-medium text-danger underline underline-offset-2"
              >
                Delete this mark
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      <div
        ref={surfaceRef}
        onPointerDown={onSurfaceDown}
        onPointerMove={onSurfaceMove}
        onPointerUp={onSurfaceUp}
        onPointerCancel={onSurfaceUp}
        className={cn(
          'relative select-none overflow-hidden rounded border border-edge bg-sunken',
          canEdit && visible && tool !== 'select' && 'cursor-crosshair',
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
        <img src={src} alt={alt} draggable={false} className="block max-h-96 w-full object-contain" />
        <MarkupOverlay shapes={draft ? [...shown, draft] : shown} />

        {/* Selection targets: a fat invisible stroke, so a thin line is still
            clickable and a shape can be picked up anywhere along it. */}
        {canEdit && tool === 'select' && visible ? (
          <svg
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            {rendered.map((s) => (
              <HitTarget
                key={s.id}
                shape={s}
                selected={selectedId === s.id}
                onGrab={(e) => beginDrag(e, s, 'move')}
              />
            ))}
          </svg>
        ) : null}

        {/* Handles are HTML so they stay square however the image is shaped. */}
        {canEdit && tool === 'select' && visible && selectedLive && box ? (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute border border-dashed border-[color:var(--accent)]"
              style={{
                left: `${box.x * 100}%`,
                top: `${box.y * 100}%`,
                width: `${box.w * 100}%`,
                height: `${box.h * 100}%`,
              }}
            />
            {gripsFor(selectedLive).map(([grip, gx, gy]) => (
              <button
                key={grip}
                type="button"
                aria-label={GRIP_LABEL[grip]}
                title={GRIP_LABEL[grip]}
                onPointerDown={(e) => beginDrag(e, selectedLive, grip)}
                style={{ left: `${gx * 100}%`, top: `${gy * 100}%` }}
                className={cn(
                  'absolute z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm',
                  'border border-white bg-[color:var(--accent)] shadow-sm',
                  grip === 'move' ? 'cursor-move rounded-full' : 'cursor-nwse-resize',
                )}
              />
            ))}
          </>
        ) : null}
      </div>

      {canEdit ? (
        <p className="text-2xs text-ink-muted">
          {shapes.length === 0
            ? 'Nothing marked yet.'
            : `${shapes.length} mark${shapes.length === 1 ? '' : 's'}.`}{' '}
          Pick the arrow tool to select a mark, then drag it to move or use its handles to resize.
          The photograph itself is never altered — marks are stored separately and can be removed.
        </p>
      ) : null}
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  rect: 'Box',
  ellipse: 'Ellipse',
  arrow: 'Arrow',
  free: 'Freehand',
  text: 'Label',
};

const GRIP_LABEL: Record<Grip, string> = {
  move: 'Move this mark',
  nw: 'Resize from the top left',
  ne: 'Resize from the top right',
  sw: 'Resize from the bottom left',
  se: 'Resize from the bottom right',
  p1: 'Move the tail',
  p2: 'Move the head',
};

/** Where the handles sit, in image fractions. */
function gripsFor(s: Shape): [Grip, number, number][] {
  if (s.kind === 'arrow') {
    return [
      ['p1', s.x1, s.y1],
      ['p2', s.x2, s.y2],
    ];
  }
  const b = boundsOf(s);
  if (s.kind === 'rect' || s.kind === 'ellipse') {
    return [
      ['nw', b.x, b.y],
      ['ne', b.x + b.w, b.y],
      ['sw', b.x, b.y + b.h],
      ['se', b.x + b.w, b.y + b.h],
    ];
  }
  // Freehand and labels move as a whole.
  return [['move', b.x + b.w / 2, b.y + b.h / 2]];
}

function HitTarget({
  shape,
  selected,
  onGrab,
}: {
  shape: Shape;
  selected: boolean;
  onGrab: (e: React.PointerEvent) => void;
}) {
  const hit = {
    stroke: selected ? 'transparent' : 'transparent',
    strokeWidth: 16,
    fill: 'none',
    vectorEffect: 'non-scaling-stroke' as const,
    className: 'cursor-move',
    onPointerDown: onGrab,
  };

  if (shape.kind === 'rect' || shape.kind === 'ellipse') {
    const b = boundsOf(shape);
    return <rect {...hit} x={b.x * K} y={b.y * K} width={b.w * K} height={b.h * K} />;
  }
  if (shape.kind === 'arrow') {
    return (
      <line {...hit} x1={shape.x1 * K} y1={shape.y1 * K} x2={shape.x2 * K} y2={shape.y2 * K} />
    );
  }
  if (shape.kind === 'free') {
    return <path {...hit} d={pathOf(shape.pts)} />;
  }
  const b = boundsOf(shape);
  return (
    <rect
      {...hit}
      strokeWidth={0}
      fill="transparent"
      x={b.x * K}
      y={b.y * K}
      width={Math.max(b.w, 0.05) * K}
      height={Math.max(b.h, 0.05) * K}
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
