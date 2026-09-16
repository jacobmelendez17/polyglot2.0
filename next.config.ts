import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables `forbidden()`/`unauthorized()` from `next/navigation` (spec 11's
  // admin route guards use `forbidden()` for role-based access control).
  experimental: {
    authInterrupts: true,
  },
  // Spec 22 — the E2E server (scripts/e2e-server.ts) builds into its own
  // directory so it can run alongside a normal `next dev` session in this
  // same working directory. Next's dev-server singleton lock lives inside
  // `distDir`, so sharing the default `.next` would make the second
  // instance refuse to start rather than actually run isolated E2E traffic.
  ...(process.env.E2E_SERVER ? { distDir: ".next-e2e" } : {}),
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
