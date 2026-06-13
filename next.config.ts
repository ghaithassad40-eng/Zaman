import type { NextConfig } from "next";

/** Per-request security headers. Strict by default; relaxed only where the app
 *  actually needs cross-origin loads (Supabase, gstatic fonts for PDF/print,
 *  Google Maps preview if ever added). */
const securityHeaders = [
  // Disallow framing the entire app to prevent clickjacking. Login pages and
  // financial dashboards should never be embedded by another origin.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Stop MIME sniffing — browsers must respect the Content-Type we send.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak the full URL to third parties when users click outbound links.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Cut off Flash / legacy plugin attack surfaces.
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  // Lock down what fancy browser features the page can request.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // Force https with HSTS preload eligibility. 2 years, includes subdomains.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Content Security Policy — tight defaults with explicit allowlists for the
  // 3rd parties this app actually loads: Supabase (data + storage), gstatic
  // (Amiri Arabic font fallback in PDFs), wa.me (WhatsApp links).
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js inlines hydration scripts → need 'unsafe-inline' for now.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      // Allow product images from Supabase Storage + any https for shop covers
      // (admins may paste URLs from Shein, etc).
      "img-src 'self' data: blob: https:",
      // API + Realtime: Supabase REST (https) + Realtime WebSocket (wss) +
      // the FX provider configured in .env. The wss entry is required for
      // notifications/banner — without it the channel never reaches
      // subscribed state and downstream code throws.
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://open.er-api.com",
      // No frames embedded at all.
      "frame-src 'none'",
      "frame-ancestors 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  images: {
    // Allow product images served from Supabase Storage.
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
  async headers() {
    return [
      {
        // Apply to every route except Next internals.
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
