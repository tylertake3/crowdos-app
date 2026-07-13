/** @type {import('next').NextConfig} */
const nextConfig = {
  // `npm run build:check` writes to .next-check so a local verification
  // build can never corrupt the running dev server's .next cache
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
