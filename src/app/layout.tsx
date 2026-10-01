import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

/**
 * IBM Plex: institutional and technical rather than friendly, which suits a
 * document that may be read in a deposition. Plex Mono carries every identifier
 * (case numbers, evidence item numbers, timestamps) so they align in a column
 * and never get confused with prose.
 *
 * Self-hosted rather than next/font/google, which fetches the stylesheet from
 * Google at build time and parses the URLs out of it with a regex. That regex
 * expects every file to end in a known extension, and when Google served this
 * build something it did not expect the whole build failed with
 * "Cannot read properties of null (reading '1')" — no network error, no font
 * name, nothing pointing at Google. A deploy that can fail because a third
 * party changed a response is not worth the two hundred kilobytes saved.
 *
 * The files are the latin subset only, pulled from Google's own CDN. Plex is
 * under the SIL Open Font License, which permits redistribution; see
 * fonts/OFL.txt. Sans is a variable font covering 400-700 in one file, which is
 * why there is one of it and three of Mono.
 */
const sans = localFont({
  src: [{ path: './fonts/plex-sans.woff2', weight: '400 700', style: 'normal' }],
  variable: '--font-sans',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
});

const mono = localFont({
  src: [
    { path: './fonts/plex-mono-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/plex-mono-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/plex-mono-600.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'SFMono-Regular', 'monospace'],
});

export const metadata: Metadata = {
  title: {
    default: 'Forensibus',
    template: '%s · Forensibus',
  },
  description: 'Forensic case management',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans text-base antialiased">{children}</body>
    </html>
  );
}
