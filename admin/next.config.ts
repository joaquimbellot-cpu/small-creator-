import type { NextConfig } from 'next';
import { SITE_PAGES } from './lib/site-pages';

const config: NextConfig = {
  // NEXT_DIST_DIR lets several local dev servers run side by side (each with its own folder).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  reactStrictMode: true,
  agentRules: false,
  // The public website is built into public/ (see "site" in package.json); its home page is public/index.html.
  // Each page also answers without ".html" (/how-it-works), because Netlify drops ".html" from addresses.
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/', destination: '/index.html' },
        ...SITE_PAGES.map((p) => ({ source: `/${p}`, destination: `/${p}.html` })),
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default config;
