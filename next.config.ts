import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Sprite sheets are content-hashed by scripts/build-sprites.mjs (the
        // filename changes if the content does), so it's safe to cache them
        // forever — a regenerated sprite gets a new URL automatically.
        source: "/sprites/:path*.png",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
