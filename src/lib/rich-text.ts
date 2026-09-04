/**
 * The small subset of HTML that long-form case fields may hold.
 *
 * The rule this file exists to enforce: stored markup is never trusted. It is
 * sanitised on the way *out*, every time, not merely on the way in — because
 * what is already in the database was put there by an earlier version of this
 * code, or by a direct API call, and neither is a promise. Nothing anywhere
 * hands a stored string to innerHTML or dangerouslySetInnerHTML; the editor and
 * the read-only view both rebuild the document node by node from this allowlist.
 *
 * The subset is deliberately small. It covers what an investigator needs to lay
 * out a narrative — emphasis, headings, lists, the occasional link — and nothing
 * that carries behaviour or loads anything.
 */

const ALLOWED_TAGS = new Set([
  'P',
  'BR',
  'STRONG',
  'EM',
  'U',
  'S',
  'H3',
  'H4',
  'UL',
  'OL',
  'LI',
  'BLOCKQUOTE',
  'A',
]);

/** Tags whose formatting we keep by mapping them onto the canonical one. */
const TAG_ALIASES: Record<string, string> = {
  B: 'STRONG',
  I: 'EM',
  DIV: 'P',
  H1: 'H3',
  H2: 'H3',
  H5: 'H4',
  H6: 'H4',
  STRIKE: 'S',
  DEL: 'S',
  INS: 'U',
};

/** Anything here is dropped along with its text — it is not content. */
const DROP_ENTIRELY = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'HEAD']);

const SAFE_HREF = /^(https?:\/\/|mailto:|tel:)/i;

export const RICH_TEXT_MAX = 20000;

/** True when the markup carries anything a reader would see. */
export function richTextIsEmpty(html: string | null | undefined): boolean {
  return richTextToPlain(html).length === 0;
}

/**
 * Plain text from the markup, for previews, search fallbacks and completion.
 * Mirrors strip_markup() in migrations 0017 and 0019 so the client and the
 * database agree on both the words and the spacing between them.
 */
export function richTextToPlain(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<\/?(p|br|li|h3|h4|blockquote|ul|ol|div)[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Rebuild `html` as a DOM fragment containing only allowlisted nodes.
 *
 * Browser only — it needs a real parser. Parsing happens in an inert document
 * from DOMParser, so nothing loads, executes or fires while we inspect it.
 */
export function sanitizeToFragment(html: string, doc: Document = document): DocumentFragment {
  const parsed = new DOMParser().parseFromString(
    `<div id="rt-root">${html ?? ''}</div>`,
    'text/html',
  );
  const root = parsed.getElementById('rt-root');
  const out = doc.createDocumentFragment();
  if (!root) return out;

  const convert = (source: Node, target: Node | DocumentFragment): void => {
    source.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        target.appendChild(doc.createTextNode(node.nodeValue ?? ''));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const el = node as Element;
      const raw = el.tagName.toUpperCase();
      if (DROP_ENTIRELY.has(raw)) return;

      const tag = ALLOWED_TAGS.has(raw) ? raw : (TAG_ALIASES[raw] ?? null);

      // Not on the list and not aliasable: drop the wrapper, keep the words.
      if (!tag || !ALLOWED_TAGS.has(tag)) {
        convert(el, target);
        return;
      }

      const clean = doc.createElement(tag.toLowerCase());

      if (tag === 'A') {
        const href = el.getAttribute('href') ?? '';
        // javascript: and data: URLs are the whole reason this check exists.
        if (!SAFE_HREF.test(href)) {
          convert(el, target);
          return;
        }
        clean.setAttribute('href', href);
        clean.setAttribute('rel', 'noopener noreferrer nofollow');
        clean.setAttribute('target', '_blank');
      }

      convert(el, clean);
      target.appendChild(clean);
    });
  };

  convert(root, out);
  return out;
}

/** The sanitised markup as a string, for storing what the editor produced. */
export function sanitizeRichText(html: string): string {
  if (typeof document === 'undefined') return '';
  const holder = document.createElement('div');
  holder.appendChild(sanitizeToFragment(html));
  return holder.innerHTML.slice(0, RICH_TEXT_MAX);
}

/**
 * Does this value look like markup, or is it plain text typed before rich text
 * existed? Old values must keep rendering, with their line breaks intact.
 */
export function looksLikeMarkup(value: string): boolean {
  return /<(p|br|strong|em|u|s|h3|h4|ul|ol|li|blockquote|a)\b[^>]*>/i.test(value);
}

/** Plain text promoted to the markup subset, preserving paragraph breaks. */
export function plainToRichText(text: string): string {
  const escape = (t: string) =>
    t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${escape(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
