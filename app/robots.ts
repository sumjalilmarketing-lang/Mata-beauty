import type { MetadataRoute } from "next";

const siteUrl = "https://mata-beauty.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/app",
        "/auth",
        "/finance",
        "/messaging-v2-demo",
        "/moderation",
        "/onboarding",
        "/operations",
        "/pro/",
        "/pro$",
        "/quotes",
        "/salon/",
        "/salon$",
        "/staff",
        "/support-agent",
        "/api/",
        "/api$",
        "/offline",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
