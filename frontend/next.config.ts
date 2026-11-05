import type { NextConfig } from "next";

// GitHub Pages (project site) needs a static export under /StepSignal.
// Local and server deployments keep the default Next.js behaviour.
const isPages = process.env.GITHUB_PAGES === "true";
const nextConfig: NextConfig = isPages
  ? { output: "export", trailingSlash: true, basePath: "/StepSignal", assetPrefix: "/StepSignal/" }
  : {};
export default nextConfig;
