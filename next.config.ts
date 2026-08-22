import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The project lives inside a OneDrive folder that sits above the git root, which
  // makes Turbopack guess the wrong workspace root. Pin it to this directory.
  turbopack: {
    root: path.join(import.meta.dirname),
  },

  // Duequity handles sensitive legal, identity and property records. These headers are
  // the application-level baseline. Transport security and a full Content Security
  // Policy are finalised at the host/edge layer before any production deployment.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), payment=()",
          },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
      {
        // Authenticated surfaces must never be retained by shared caches.
        source: "/portal/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/pro/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
