import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    '/api/messages/media': [
      'node_modules/sharp/**/*',
      'node_modules/@img/sharp-linux-x64/**/*',
      'node_modules/@img/sharp-libvips-linux-x64/**/*',
    ],
    '/api/stories': [
      'node_modules/sharp/**/*',
      'node_modules/@img/sharp-linux-x64/**/*',
      'node_modules/@img/sharp-libvips-linux-x64/**/*',
    ],
  },
  env: {
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
  },
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
    const upgradeInsecureRequests = process.env.NODE_ENV === "production" ? "; upgrade-insecure-requests" : "";
    const documentFrameSource = process.env.NEXT_PUBLIC_SUPABASE_URL ? `${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin}/storage/v1/object/sign/provider-documents/` : "'none'";
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()" },
        { key: "Content-Security-Policy", value: `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; frame-src ${documentFrameSource}; object-src 'none'; form-action 'self' https://app.paydunya.com; img-src 'self' data: blob: https:; media-src 'self' blob: https://*.supabase.co; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'${developmentEval}; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://app.paydunya.com${upgradeInsecureRequests}` },
      ],
    }, {
      source: "/images/categories/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
    }];
  },
};

export default nextConfig;
