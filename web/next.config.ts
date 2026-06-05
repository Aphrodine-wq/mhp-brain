import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Drop the per-response `x-powered-by` header — a free byte/info-leak win on every request.
  poweredByHeader: false,
  // Keep Node-native deps out of the Server Components / Route Handler bundle: they use native
  // bindings + dynamic requires that don't tree-shake or bundle cleanly. Using Node's own require
  // for them speeds up the build and avoids runtime surprises (esp. nodemailer's transports).
  serverExternalPackages: ["pg", "nodemailer"],
};

export default nextConfig;
