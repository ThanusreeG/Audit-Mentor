/** @type {import('next').NextConfig} */
const isStaticExport = process.env.NEXT_STATIC_EXPORT === "true";
const basePath = process.env.PAGES_BASE_PATH || "";

const nextConfig = {
  ...(isStaticExport
    ? {
        output: "export",
        trailingSlash: true,
        images: { unoptimized: true },
        ...(basePath ? { basePath, assetPrefix: `${basePath}/` } : {})
      }
    : {})
};

export default nextConfig;
