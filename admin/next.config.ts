import type { NextConfig } from 'next';

const config: NextConfig = {
  // NEXT_DIST_DIR lets several local dev servers run side by side (each with its own folder).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  reactStrictMode: true,
  agentRules: false,
  // The public website is built into public/ (see "site" in package.json); its home page is public/index.html.
  async rewrites() {
    return { beforeFiles: [{ source: '/', destination: '/index.html' }], afterFiles: [], fallback: [] };
  },
};

export default config;
