'use client';

import * as React from 'react';
import { Paperclip, PenLine } from 'lucide-react';
import { looksLikeMarkup, richTextIsEmpty } from '@/lib/rich-text';
import { cn } from '@/lib/utils';
import { FieldUploader } from './FieldUploader';
import { RichTextField } from './RichTextField';

/**
 * One component, every field type.
 *
 * This is the switch that makes the product no-code: a case type defines its
 * fields as rows, and this renders whatever those rows say. Adding a discipline
 * never touches this file. Adding a new KIND of question is the only reason to,
 * and then it is one case here plus one value in the field_type enum.
 *
 * Values are jsonb, so a scalar is stored as a scalar, a multiselect as an
 * array, and a file reference as an object. The renderer owns the mapping in
 * both directions.
 */

export interface FieldDef {
  id: string;
  key: string;
  label: string;
  fieldType: string;
  helpText: string | null;
  placeholder: string | null;
  width: string;
  required: boolean;
  choices: { value: string; label: string }[];
  options: Record<string, unknown>;
}

export interface PersonOption {
  id: string;
  fullName: string;
  role: string;
}

export function DynamicField({
  field,
  value,
  people,
  disabled,
  libraryHref,
  caseId,
  sectionId,
  attached = 0,
  onAttached,
  onChange,
  onCommit,
}: {
  field: FieldDef;
  value: unknown;
  people: PersonOption[];
  disabled?: boolean;
  /** Where files for this case actually live, when there is a case. */
  libraryHref?: string;
  caseId?: string;
  sectionId?: string;
  /** Library files already pointing at this field. */
  attached?: number;
  onAttached?: () => void;
  /** Local edit — cheap, every keystroke. */
  onChange: (value: unknown) => void;
  /** Persist — on blur, or immediately for controls with no meaningful blur. */
  onCommit: (value: unknown) => void;
}) {
  const id = `field-${field.id}`;
  const describedBy = field.helpText ? `${id}-help` : undefined;

  const base =
    'w-full rounded border border-edge-strong bg-raised px-3 text-base text-ink placeholder:text-ink-muted disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-muted';

  function control() {
    switch (field.fieldType) {
      // Long-form fields carry a narrative, so they get the formatting a
      // narrative needs. Values typed before this existed are plain text and
      // still load — the editor promotes them, keeping their line breaks.
      case 'textarea':
        return (
          <RichTextField
            id={id}
            value={asText(value)}
            placeholder={field.placeholder ?? undefined}
            disabled={disabled}
            describedBy={describedBy}
            onCommit={(html) => {
              onChange(html);
              onCommit(html);
            }}
          />
        );

      case 'number':
        return (
          <input
            id={id}
            type="number"
            disabled={disabled}
            value={value === null || value === undefined ? '' : String(value)}
            placeholder={field.placeholder ?? undefined}
            step={(field.options.step as number | undefined) ?? undefined}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            onBlur={(e) => onCommit(e.target.value === '' ? null : Number(e.target.value))}
            className={cn(base, 'tabular h-9 font-mono')}
          />
        );

      case 'date':
        return (
          <input
            id={id}
            type="date"
            disabled={disabled}
            value={asText(value).slice(0, 10)}
            aria-describedby={describedBy}
            // A date picker has no useful blur: commit the moment it changes.
            onChange={(e) => {
              onChange(e.target.value || null);
              onCommit(e.target.value || null);
            }}
            className={cn(base, 'h-9 w-48')}
          />
        );

      case 'boolean':
        return (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              id={id}
              type="checkbox"
              disabled={disabled}
              checked={value === true}
              aria-describedby={describedBy}
              onChange={(e) => {
                onChange(e.target.checked);
                onCommit(e.target.checked);
              }}
              className="h-4 w-4 cursor-pointer accent-[color:var(--accent)]"
            />
            {value === true ? 'Yes' : 'No'}
          </label>
        );

      case 'select':
        return (
          <select
            id={id}
            disabled={disabled}
            value={asText(value)}
            aria-describedby={describedBy}
            onChange={(e) => {
              const next = e.target.value || null;
              onChange(next);
              onCommit(next);
            }}
            className={cn(base, 'h-9')}
          >
            <option value="">Not recorded</option>
            {field.choices.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        );

      case 'multiselect': {
        const selected = Array.isArray(value) ? (value as string[]) : [];
        return (
          <div
            role="group"
            aria-labelledby={`${id}-label`}
            aria-describedby={describedBy}
            className="flex flex-wrap gap-x-4 gap-y-1.5"
          >
            {field.choices.map((c) => (
              <label
                key={c.value}
                className={cn(
                  'flex items-center gap-1.5 text-sm text-ink-secondary',
                  disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                )}
              >
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={selected.includes(c.value)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...selected, c.value]
                      : selected.filter((v) => v !== c.value);
                    onChange(next);
                    onCommit(next);
                  }}
                  className="h-3.5 w-3.5 cursor-pointer accent-[color:var(--accent)]"
                />
                {c.label}
              </label>
            ))}
            {field.choices.length === 0 ? (
              <p className="text-sm text-ink-muted">
                No choices configured — an administrator sets these on the case type.
              </p>
            ) : null}
          </div>
        );
      }

      case 'person_ref':
        return (
          <select
            id={id}
            disabled={disabled}
            value={asText(value)}
            aria-describedby={describedBy}
            onChange={(e) => {
              const next = e.target.value || null;
              onChange(next);
              onCommit(next);
            }}
            className={cn(base, 'h-9')}
          >
            <option value="">Not recorded</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName} ({p.role})
              </option>
            ))}
            {people.length === 0 ? <option disabled>No people on this case yet</option> : null}
          </select>
        );

      case 'computed':
        return (
          <p className="flex h-9 items-center text-sm italic text-ink-muted">
            {isFilled(value) ? asText(value) : 'Calculated automatically'}
          </p>
        );

      /*
       * Storage-backed types.
       *
       * Files belong to the case, not to one field: the same scene photograph
       * gets referenced from several places and printed in a media log, and a
       * per-field uploader would scatter copies. So these point at the library
       * instead of holding their own upload control. media_files carries
       * section_id and field_id for the day a field wants to claim a subset.
       *
       * Signature capture is genuinely absent — it needs a drawing surface,
       * not a file picker — and says so rather than pretending.
       */
      case 'photo':
      case 'file':
        // Outside a case — the builder's preview, for instance — there is
        // nowhere to upload to, so say what the field is instead of offering a
        // control that cannot work.
        if (!caseId || !sectionId) {
          return (
            <div className="flex flex-wrap items-center gap-2 rounded border border-dashed border-edge-strong bg-sunken px-3 py-2.5 text-sm text-ink-muted">
              <Paperclip className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {field.fieldType === 'photo' ? 'Photographs' : 'Files'} attach to this field on a
                real case.
              </span>
            </div>
          );
        }
        return (
          <FieldUploader
            caseId={caseId}
            sectionId={sectionId}
            fieldId={field.id}
            label={field.label}
            kind={field.fieldType === 'photo' ? 'photo' : 'file'}
            attached={attached}
            disabled={disabled}
            libraryHref={libraryHref}
            onAttached={onAttached}
          />
        );

      case 'signature':
        return (
          <div className="flex items-center gap-2 rounded border border-dashed border-edge-strong bg-sunken px-3 py-2.5 text-sm text-ink-muted">
            <PenLine className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Signature capture is not built yet.
              {isFilled(value) ? ' Something is already recorded against this field.' : ''}
            </span>
          </div>
        );

      default:
        return (
          <input
            id={id}
            type="text"
            disabled={disabled}
            value={asText(value)}
            placeholder={field.placeholder ?? undefined}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => onCommit(e.target.value)}
            className={cn(base, 'h-9')}
          />
        );
    }
  }

  const usesLabelElement = !['multiselect', 'boolean'].includes(field.fieldType);

  return (
    <div
      className={cn(
        field.width === 'half' && 'sm:col-span-3',
        field.width === 'third' && 'sm:col-span-2',
        (!field.width || field.width === 'full') && 'sm:col-span-6',
      )}
    >
      {usesLabelElement ? (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
          {field.label}
          {field.required ? <span className="text-danger"> *</span> : null}
        </label>
      ) : (
        <p id={`${id}-label`} className="mb-1.5 block text-sm font-medium text-ink">
          {field.label}
          {field.required ? <span className="text-danger"> *</span> : null}
        </p>
      )}

      {control()}

      {field.helpText ? (
        <p id={`${id}-help`} className="mt-1 text-xs text-ink-muted">
          {field.helpText}
        </p>
      ) : null}
    </div>
  );
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return String(value);
}

/**
 * Field types whose answer is a file in the library, not a value in
 * case_field_values. Completion has to ask a different question for these.
 */
export const STORAGE_FIELD_TYPES = new Set(['photo', 'file', 'signature']);

export function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    // Clearing a rich text field rarely leaves an empty string — browsers keep
    // a stray <p> or <br> behind. Judged as raw text that reads as filled, and
    // the section would claim an answer nobody gave.
    if (looksLikeMarkup(value)) return !richTextIsEmpty(value);
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return true;
}
