import * as React from 'react';

/**
 * The panel beside the sign-in and registration forms.
 *
 * It plays a short ambient loop behind the copy. Two things about that:
 *
 * The clip is light — a teal ink wash on cream paper — and this panel's text is
 * near-white, so the artwork cannot sit bare behind it the way it would on a
 * page designed around it. A scrim carries the contrast. It is a gradient
 * rather than a flat wash so the top of the frame still reads as picture.
 *
 * The poster is painted on the container, not just handed to <video>, so it
 * covers every way the clip can fail to arrive: a blocked host, a slow start,
 * or a viewer who has asked for less motion (see globals.css).
 */

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260901_122529_931c22c8-8d2d-47c0-ad51-b97f56a91e42.mp4';

const POSTER_SRC =
  'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/4f690bd1-881a-4192-82f2-d714d34c8fb9.png';

const SCRIM =
  'linear-gradient(to top,' +
  ' color-mix(in srgb, var(--surface-chrome) 94%, transparent) 0%,' +
  ' color-mix(in srgb, var(--surface-chrome) 78%, transparent) 52%,' +
  ' color-mix(in srgb, var(--surface-chrome) 55%, transparent) 100%)';

export function AuthAside({
  headline,
  children,
}: {
  headline: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative hidden flex-1 overflow-hidden bg-chrome bg-cover bg-center lg:block"
      style={{ backgroundImage: `url(${POSTER_SRC})` }}
    >
      <video
        className="auth-aside-video absolute inset-0 h-full w-full object-cover"
        poster={POSTER_SRC}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
      >
        <source src={VIDEO_SRC} type="video/mp4" />
      </video>

      <div className="absolute inset-0" style={{ background: SCRIM }} aria-hidden="true" />

      <div className="relative flex h-full flex-col justify-between p-12">
        <div />
        <div className="max-w-lg">
          <p className="text-2xl font-semibold leading-snug tracking-tight text-ink-inverse">
            {headline}
          </p>
          <div className="mt-4 text-base leading-relaxed text-ink-inverse-muted">{children}</div>
        </div>
        <p className="font-mono text-2xs uppercase tracking-widest text-ink-inverse-muted">
          Access controlled · Fully audited
        </p>
      </div>
    </div>
  );
}
