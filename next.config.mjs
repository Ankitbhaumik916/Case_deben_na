/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },

  async rewrites() {
    return [
      // The marketing page is plain static HTML in public/landing. Serving it
      // through a rewrite rather than a React route keeps it byte-for-byte
      // static and, more importantly, keeps the app's global stylesheet and
      // font variables off it — the two designs are deliberately unrelated and
      // should not share a root layout.
      //
      // This runs after filesystem routes, so it only applies because no app
      // route owns "/" any more (the portal moved to /portal).
      { source: '/', destination: '/landing/index.html' },
    ];
  },
};

export default nextConfig;
