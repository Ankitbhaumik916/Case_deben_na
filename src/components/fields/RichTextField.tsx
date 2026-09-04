'use client';

import * as React from 'react';
import {
  Bold,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  RemoveFormatting,
  Strikethrough,
  Underline,
} from 'lucide-react';
import {
  looksLikeMarkup,
  plainToRichText,
  richTextIsEmpty,
  richTextToPlain,
  sanitizeRichText,
  sanitizeToFragment,
} from '@/lib/rich-text';
import { cn } from '@/lib/utils';

/**
 * A long-form field with the formatting a written narrative actually needs.
 *
 * contenteditable with a small toolbar rather than a framework editor: the
 * whole feature is a fixed subset of HTML, and pulling in an editor library
 * would add a bundle, a schema and a migration path for something a few
 * commands already do.
 *
 * Two things worth knowing:
 *
 * The stored value is loaded by rebuilding it node by node through the
 * allowlist in lib/rich-text — never by assigning innerHTML. What comes back
 * from the database is treated as hostile every time it is read.
 *
 * The editable div is deliberately uncontrolled. Rewriting its contents on each
 * render would move the caret to the start on every keystroke, so React sets it
 * once and hands it over; the value is read back out on blur, which is also
 * when the workspace commits.
 */

const PLACEHOLDER_CLASS =
  'before:pointer-events-none before:absolute before:text-ink-muted before:content-[attr(data-placeholder)]';

export function RichTextField({
  id,
  value,
  placeholder,
  disabled,
  describedBy,
  onCommit,
}: {
  id: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  describedBy?: string;
  onCommit: (html: string) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = React.useState(() => richTextIsEmpty(value));
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState('');
  const savedRange = React.useRef<Range | null>(null);

  // Load once, and again only when the value changes underneath us — a revalidate
  // from elsewhere on the page, say — and never while this field has focus.
  const loaded = React.useRef<string | null>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (loaded.current === value) return;
    if (document.activeElement === el) return;

    const markup = looksLikeMarkup(value) ? value : plainToRichText(value ?? '');
    el.replaceChildren(sanitizeToFragment(markup));
    loaded.current = value;
    setEmpty(richTextIsEmpty(value));
  }, [value]);

  function exec(command: string, arg?: string) {
    if (disabled) return;
    ref.current?.focus();
    // execCommand is deprecated and still the only cross-browser way to apply
    // formatting to a selection inside contenteditable. The output is sanitised
    // on the way out, so what it produces does not have to be trusted.
    document.execCommand(command, false, arg);
    setEmpty(richTextIsEmpty(ref.current?.innerHTML ?? ''));
  }

  function commit() {
    const el = ref.current;
    if (!el) return;
    const clean = sanitizeRichText(el.innerHTML);
    loaded.current = clean;
    onCommit(clean);
  }

  // Paste as our subset, not as whatever the clipboard is carrying. Word and
  // browsers put a great deal of markup on the clipboard, and none of it belongs
  // in a case file.
  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (disabled) return;
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    const fragment = sanitizeToFragment(html ? html : plainToRichText(text));
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(fragment);
    selection.collapseToEnd();
    setEmpty(richTextIsEmpty(ref.current?.innerHTML ?? ''));
  }

  function applyLink() {
    const url = linkUrl.trim();
    setLinkOpen(false);
    setLinkUrl('');
    if (!url) return;
    const href = /^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}`;
    if (savedRange.current) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(savedRange.current);
    }
    exec('createLink', href);
    commit();
  }

  const tools: [string, string, React.ComponentType<{ className?: string }>, string?][] = [
    ['bold', 'Bold', Bold, 'Ctrl+B'],
    ['italic', 'Italic', Italic, 'Ctrl+I'],
    ['underline', 'Underline', Underline, 'Ctrl+U'],
    ['strikeThrough', 'Strikethrough', Strikethrough],
    ['insertUnorderedList', 'Bulleted list', List],
    ['insertOrderedList', 'Numbered list', ListOrdered],
  ];

  return (
    <div
      className={cn(
        'rounded border border-edge-strong bg-raised transition-colors duration-150',
        'focus-within:border-accent',
        disabled && 'bg-sunken',
      )}
    >
      {!disabled ? (
        <div
          role="toolbar"
          aria-label="Formatting"
          aria-controls={id}
          className="flex flex-wrap items-center gap-0.5 border-b border-edge px-1 py-1"
        >
          {tools.map(([command, label, Glyph, hint]) => (
            <ToolButton
              key={command}
              label={hint ? `${label} (${hint})` : label}
              onClick={() => {
                exec(command);
                commit();
              }}
            >
              <Glyph className="h-3.5 w-3.5" />
            </ToolButton>
          ))}

          <span className="mx-0.5 h-4 w-px bg-edge" aria-hidden="true" />

          <ToolButton
            label="Heading"
            onClick={() => {
              exec('formatBlock', 'h3');
              commit();
            }}
          >
            <Heading3 className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton
            label="Quote"
            onClick={() => {
              exec('formatBlock', 'blockquote');
              commit();
            }}
          >
            <Quote className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton
            label="Add link"
            onClick={() => {
              const selection = window.getSelection();
              savedRange.current =
                selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
              setLinkOpen((v) => !v);
            }}
          >
            <Link2 className="h-3.5 w-3.5" />
          </ToolButton>

          <span className="mx-0.5 h-4 w-px bg-edge" aria-hidden="true" />

          <ToolButton
            label="Clear formatting"
            onClick={() => {
              exec('removeFormat');
              exec('unlink');
              commit();
            }}
          >
            <RemoveFormatting className="h-3.5 w-3.5" />
          </ToolButton>
        </div>
      ) : null}

      {linkOpen && !disabled ? (
        <div className="flex items-center gap-1.5 border-b border-edge bg-sunken px-2 py-1.5">
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink();
              }
              if (e.key === 'Escape') setLinkOpen(false);
            }}
            placeholder="https://…"
            aria-label="Link address"
            className="h-7 flex-1 rounded border border-edge-strong bg-raised px-2 text-xs text-ink"
          />
          <button
            type="button"
            onClick={applyLink}
            className="h-7 cursor-pointer rounded bg-chrome px-2 text-xs font-medium text-ink-inverse"
          >
            Add
          </button>
        </div>
      ) : null}

      <div
        id={id}
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-describedby={describedBy}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={empty ? (placeholder ?? '') : ''}
        onInput={() => setEmpty(richTextIsEmpty(ref.current?.innerHTML ?? ''))}
        onPaste={onPaste}
        onBlur={commit}
        className={cn(
          'fb-rich relative min-h-24 px-2.5 py-2 text-sm text-ink outline-none',
          empty && placeholder && PLACEHOLDER_CLASS,
          disabled && 'cursor-not-allowed text-ink-secondary',
        )}
      >
        {/*
          The words, server-rendered as plain text, so what is recorded on the
          case is in the HTML rather than appearing only once JavaScript has
          run. React escapes this, so no markup goes live here; the effect above
          replaces it with the formatted version on mount. Both sides render the
          same string, so hydration matches.
        */}
        {richTextToPlain(value)}
      </div>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      // Keep the selection: a button that takes focus first would collapse it,
      // and the command would apply to nothing.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-ink-secondary transition-colors duration-150 hover:bg-sunken hover:text-ink"
    >
      {children}
    </button>
  );
}

/** The same markup, read-only — for accounts that may look but not edit. */
export function RichTextView({ value, className }: { value: string; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const markup = looksLikeMarkup(value) ? value : plainToRichText(value ?? '');
    el.replaceChildren(sanitizeToFragment(markup));
  }, [value]);

  return (
    <div ref={ref} className={cn('fb-rich text-sm text-ink', className)}>
      {richTextToPlain(value)}
    </div>
  );
}
