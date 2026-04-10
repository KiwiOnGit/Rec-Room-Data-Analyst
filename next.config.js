/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',          // static export for GitHub Pages / Vercel
  images: { unoptimized: true },
  trailingSlash: true,
};
module.exports = nextConfig;
