import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Allow product images served from Supabase Storage.
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
};

export default nextConfig;
