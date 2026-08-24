# Forensibus — landing page

Standalone marketing page. Plain HTML + CSS + vanilla JS, no build step: open
`index.html` through any static server.

```bash
cd landing && python -m http.server 4173     # http://127.0.0.1:4173
```

It is **deliberately not** styled like the application. The app uses the warm,
near-monochrome "Ink & Brass" tokens in `src/app/globals.css`; this page is
black, full-bleed and display-typeface led. Do not share tokens between them.

---

## Open slots

Three things are intentionally unfinished, each because filling them in with
something invented would be worse than leaving them visibly empty.

### 1. `assets/bg-video.mp4` — not present

Drop in footage **you hold rights to** (licensed stock, commissioned, or
AI-generated) at that exact path and it takes over with no code change. Do not
hotlink another site's asset.

Until then a CSS gradient in `.bg-fallback` renders instead — a dark radial wash
with a faint dot grid echoing the display face. It needs no binary asset, so the
page never looks broken. `main.js` detects the failed source and removes the
video element.

The empty slot costs one 404 per page load. That is the trade for "drop the file
in and it just works"; if you would rather have a silent console until then,
comment out the `<source>` line in `index.html`.

A `poster` still frame is optional — add `poster="assets/bg-poster.jpg"` to the
`<video>` tag once you have one.

### 2. Stat figures — all placeholders

Every value in `STATS` at the top of `main.js` is `null`, so the page renders an
em-dash and a "figures pending" note. Replace a `null` with a number and that
stat animates on load; replace all four and the pending note removes itself.

```js
var STATS = {
  'case-types': null,
  'compliance-coverage': null,
  'report-turnaround': null,
  'evidence-items': 12480     // <- like this
};
```

The keys must match the `data-stat` attributes in `index.html`, or the figure
silently stays a placeholder.

### 3. Trust row — built but disabled

Markup and styling are complete and switched off (`data-enabled="false"` plus
`hidden` on `.trust` in `index.html`). Turn it on when there are real customer
logos or a real figure to put in it.

---

## Also worth knowing

- **`/login`** is an absolute path. The header pill and the hero CTA both assume
  this page is served from the same origin as the Next app. If you host it
  separately, make them absolute URLs.
- **Product / Solutions / Contact** have no destinations. They are `href="#"`
  with `title="Not built yet"`, and `main.js` swallows the click so the page
  neither jumps nor pushes a bare `#` into history.
- **Font Awesome** is loaded because the brief asked for it, but nothing uses it
  — the stat glyphs are DotGothic16 characters and the burger is CSS bars.
  That is ~30KB of blocking CSS for no rendered pixel; delete the `<link>` until
  an icon actually needs it.
- **`prefers-reduced-motion`** disables every entrance animation, shows the
  final state, and stops the background video from autoplaying.
