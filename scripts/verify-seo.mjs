import assert from "node:assert/strict";

const base = process.env.SEO_BASE_URL || "http://localhost:3000";
const paths = ["/conseils/coiffure-au-senegal", "/conseils/tresses-africaines-au-senegal", "/conseils/maquillage-au-senegal", "/conseils/onglerie-au-senegal", "/conseils/prestations-esthetiques-au-senegal"];
for (const path of paths) {
  const response = await fetch(new URL(path, base));
  assert.equal(response.status, 200, path);
  const html = await response.text();
  assert.match(html, /<h1[^>]*>[^<]+/);
  assert.equal(html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1], `https://mata-beauty.com${path}`, `canonical ${path}`);
  assert.ok(html.includes("Voir les prestations"), `booking link ${path}`);
  const scripts = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  const breadcrumb = scripts.map(match=>JSON.parse(match[1])).find(item=>item["@type"]==="BreadcrumbList");
  assert.equal(breadcrumb?.itemListElement.at(-1).item, `https://mata-beauty.com${path}`);
}
assert.equal((await fetch(new URL("/conseils/nonexistent-audit-guide",base))).status,404);
const robots = await (await fetch(new URL("/robots.txt",base))).text();
assert.ok(robots.includes("Disallow: /commercial"));
assert.ok(!robots.includes("Disallow: /professional"));
const sitemap = await (await fetch(new URL("/sitemap.xml",base))).text();
for (const path of paths) assert.ok(sitemap.includes(`https://mata-beauty.com${path}`));
const searchHtml=await (await fetch(new URL("/?search=1&applied=1&q=audit",base))).text();
assert.match(searchHtml, /name="robots" content="noindex, follow"/);
const homeHtml=await (await fetch(new URL("/",base))).text();
assert.match(homeHtml,/Coiffure, esthétique et beauté au Sénégal/);
assert.match(homeHtml,/name="robots" content="index, follow"/);
assert.ok(homeHtml.includes('href="/conseils"'));
const homeSchemas=[...homeHtml.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap(match=>{const value=JSON.parse(match[1]);return value["@graph"]??[value];});
assert.equal(homeSchemas.find(item=>item["@type"]==="Organization")?.url,"https://mata-beauty.com/");
assert.equal(homeSchemas.find(item=>item["@type"]==="WebSite")?.publisher?.["@id"],"https://mata-beauty.com/#organization");
console.log("PASS: five server-rendered guides, canonicals, valid breadcrumb JSON, booking links, 404, robots, sitemap, home and search index directives.");
