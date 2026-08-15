import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [
      { source: "/posts/:id", destination: "/video/:id", permanent: false },
      { source: "/client/:path*", destination: "/app/:path*", permanent: false },
      { source: "/provider/:path*", destination: "/pro/:path*", permanent: false },
      { source: "/super-admin/:path*", destination: "/admin/:path*", permanent: false },
      { source: "/forgot-password", destination: "/?auth=reset", permanent: false },
      { source: "/update-password", destination: "/auth/update-password", permanent: false },
    ];
  },
  async headers() {
    const developmentEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()" },
        { key: "Content-Security-Policy", value: `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self' https://app.paydunya.com; img-src 'self' data: https:; media-src 'self' blob: https://*.supabase.co; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'${developmentEval}; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://app.paydunya.com; upgrade-insecure-requests` },
      ],
    }];
  },
};

export default nextConfig;
