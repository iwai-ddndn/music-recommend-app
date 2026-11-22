import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E 用の dev サーバーを通常の dev サーバーと並行して動かせるよう出力先を分けられるようにする
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
