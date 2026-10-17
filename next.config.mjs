/** @type {import('next').NextConfig} */
const config = {
  // Lint runs as its own step (`npm run lint`), not inside `next build`.
  eslint: { ignoreDuringBuilds: true },
};

export default config;
