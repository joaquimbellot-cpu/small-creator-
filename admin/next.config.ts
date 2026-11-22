import type { NextConfig } from 'next';

const config: NextConfig = {
  // NEXT_DIST_DIR lets several local dev servers run side by side (each with its own folder).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  reactStrictMode: true,
  agentRules: false,
};

export default config;
