# Forensibus — landing page

The marketing page served at **`/`**. Plain HTML + CSS + vanilla JS with no
build step, living in `public/landing/` and mapped onto the site root by a
rewrite in `next.config.mjs`:

```js
{ source: '/', destination: '/landing/index.html' }
```

One Next project, one `next build`, one deployable. It is served as a static
file rather than a React route on purpose: that keeps the app's global
stylesheet, Tailwind preflight and font variables off it entirely. The two
designs are unrelated — the app is dense warm-paper "Ink & Brass"
(`src/app/globals.css`); this page is black and full-bleed — and they should
never share a root layout.

Because it is a static file, asset references inside it are **absolute**
(`/landing/styles.css`, `/landing/main.js`, `/landing/assets/...`). Relative
paths would resolve against `/` and 404.

```bash
npm run dev            # http://localhost:3000  ->  the landing page
npm run verify:routes  # walks / -> /login -> sign in -> /portal
```

---

## Open slots

Three things are intentionally unfinished, each because filling them in with
something invented would be worse than leaving them visibly empty.

### 1. Background clip and poster — drop-in, no code change

When the approved footage is ready, put **both** files in `public/landing/assets/` and
redeploy. `index.html` already points at these exact paths; nothing in
`main.js` or `styles.css` needs editing.

```
public/landing/assets/bg-video.mp4     the approved clip (must be rights-cleared)
public/landing/assets/bg-poster.jpg    a still frame from it, same aspect ratio
```

Use footage **you hold rights to** — licensed stock, commissioned, or
AI-generated. Do not hotlink another site's asset.

The page degrades on its own, in this order:

| Tier | Renders | When |
|---|---|---|
| 1 | the video, looping | both files present |
| 2 | the poster still | poster present; video missing, blocked, or reduced-motion |
| 3 | a CSS gradient | neither present — **what ships today** |

Tier 3 needs no binary asset at all: a dark radial wash with a faint dot grid
echoing the display face. So the page looks finished right now, and looks
better at each tier you unlock.

Reduced-motion visitors deliberately stop at tier 2 — they get the still frame
and never the motion, even once the clip is in place.

Two notes while the slots are empty:

- Each missing file costs one 404 per page load. That is the price of "drop the
  file in and it just works"; if you would rather have a silent console until
  then, comment out the `<source>` line and the `poster` attribute.
- Tier 2 depends on the `<video>` element staying in the DOM, because a poster
  only paints while its video element is rendered. `main.js` therefore probes
  the poster before hiding anything — do not "simplify" that into a blanket
  `display: none` on load failure, or the poster tier silently disappears.

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

- **`/login`** and the hero CTA resolve against the same origin, because the
  page is served by the Next app itself. Signing in lands on `/portal`.
- **Product / Solutions / Contact** have no destinations. They are `href="#"`
  with `title="Not built yet"`, and `main.js` swallows the click so the page
  neither jumps nor pushes a bare `#` into history.
- **Font Awesome** is loaded because the brief asked for it, but nothing uses it
  — the stat glyphs are DotGothic16 characters and the burger is CSS bars.
  That is ~30KB of blocking CSS for no rendered pixel; delete the `<link>` until
  an icon actually needs it.
- **`prefers-reduced-motion`** disables every entrance animation, shows the
  final state, and stops the background video from autoplaying.
