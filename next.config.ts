import type { NextConfig } from "next";
import { contentSecurityPolicy } from "./lib/security/content-security-policy";

const nextConfig: NextConfig = {
  ...(process.env.MATA_E2E_NEXT_DIST_DIR ? { distDir: process.env.MATA_E2E_NEXT_DIST_DIR } : {}),
  ...(process.env.MATA_E2E_TSCONFIG ? { typescript: { tsconfigPath: process.env.MATA_E2E_TSCONFIG } } : {}),
  poweredByHeader: false,
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: { "/api/studio/validate-video": ["./node_modules/ffmpeg-static/ffmpeg"] },
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  turbopack: { root: process.cwd() },
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
    const noIndexHeaders = ["/app/:path*", "/admin/:path*", "/commercial/:path*", "/auth/:path*", "/finance/:path*", "/moderation/:path*", "/onboarding/:path*", "/operations/:path*", "/pro/:path*", "/salon/:path*", "/staff/:path*", "/support-agent/:path*"].map(source => ({
      source,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
    }));
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()" },
        { key: "Content-Security-Policy", value: contentSecurityPolicy(process.env) },
        // Static public HTML keeps its current enforcement until a hash-based
        // policy can be validated. This stricter candidate reports in browsers.
        { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy(process.env, undefined, true) },
      ],
    }, {
      source: "/images/categories/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
    }, { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, max-age=0, must-revalidate" }] }, ...noIndexHeaders];
  },
};

export default nextConfig;
