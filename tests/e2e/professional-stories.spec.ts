import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { qaLogin, qaSession } from "./helpers/qa-session";

const api = process.env.MATA_SUPABASE_FIXTURE_ORIGIN;
const ownerId = qaSession("provider").user.id;
const fakeImage = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const fakeId = "00000000-0000-4000-8000-000000009701";
const fakePath = `${ownerId}/00000000-0000-4000-8000-000000009701.png`;

type FixtureStory = {
  id: string;
  providerId: string;
  name: string;
  avatar: null;
  city: string;
  countryCode: string;
  mediaType: "photo";
  caption: string;
  createdAt: string;
  expiresAt: string;
  url: string;
};

function story(expiresAt = new Date(Date.now() + 86400000).toISOString()): FixtureStory {
  return {
    id: fakeId, providerId: ownerId, name: "Salon fictif QA",
    avatar: null, city: "Dakar", countryCode: "SN", mediaType: "photo",
    caption: "Photo fictive de recette", createdAt: new Date().toISOString(),
    expiresAt, url: fakeImage,
  };
}

async function mockStories(page: Page, stories: FixtureStory[], options: { rejectUpload?: boolean } = {}) {
  await page.route("**/api/public/stories", route => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ stories }),
  }));
  await page.route(`${api}/storage/v1/object/professional-stories/**`, route => {
    if (options.rejectUpload) return route.fulfill({ status: 403, json: { message: "Approval required" } });
    return route.fulfill({ status: 200, json: { Key: fakePath } });
  });
  await page.route(`${api}/storage/v1/object/remove`, route => route.fulfill({ status: 200, json: [] }));
  await page.route(`${api}/rest/v1/professional_stories**`, route => {
    const method = route.request().method();
    if (method === "POST") {
      stories.push(story());
      return route.fulfill({ status: 201, json: [] });
    }
    if (method === "GET") {
      return route.fulfill({ status: 200, json: { media_path: fakePath } });
    }
    if (method === "DELETE") {
      stories.splice(0, stories.length);
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({ status: 405, body: "" });
  });
}

test("approved professional publishes via avatar, views and deletes synthetic media", async ({ page, context }) => {
  await qaLogin(context, "provider");
  const posts: FixtureStory[] = [];
  await mockStories(page, posts);
  await page.goto("/");
  const add = page.getByRole("button", { name: "Publier un statut" });
  await expect(add).toBeVisible();
  const image = await sharp({ create: { width: 10, height: 10, channels: 4, background: "#eda3ad" } }).png().toBuffer();
  await page.getByLabel("Choisir une photo ou vidéo pour votre statut").setInputFiles({
    name: "photo-fictive.png", mimeType: "image/png", buffer: image,
  });
  const draft = page.getByRole("dialog", { name: "Publier mon statut" });
  await expect(draft).toBeVisible();
  await draft.getByRole("button", { name: "Publier · 24 h" }).click();
  await expect(draft).toHaveCount(0);
  const bubble = page.getByRole("button", { name: "Voir le statut de Salon fictif QA" });
  await expect(bubble).toBeVisible();
  await bubble.click();
  const viewer = page.getByRole("dialog", { name: "Statut de Salon fictif QA" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText("Photo fictive de recette")).toBeVisible();
  await viewer.getByRole("button", { name: "Supprimer mon statut" }).click();
  await expect(viewer).toHaveCount(0);
  await expect(bubble).toHaveCount(0);
  expect(posts).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("unapproved synthetic professional cannot upload a status", async ({ page, context }) => {
  await qaLogin(context, "provider");
  const posts: FixtureStory[] = [];
  await mockStories(page, posts, { rejectUpload: true });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Publier un statut" })).toBeVisible();
  const image = await sharp({ create: { width: 10, height: 10, channels: 4, background: "#f4b5b5" } }).png().toBuffer();
  await page.getByLabel("Choisir une photo ou vidéo pour votre statut").setInputFiles({
    name: "profil-non-approuve.png", mimeType: "image/png", buffer: image,
  });
  const draft = page.getByRole("dialog", { name: "Publier mon statut" });
  await draft.getByRole("button", { name: "Publier · 24 h" }).click();
  await expect(draft.getByRole("alert")).toContainText("téléversement a échoué");
  expect(posts).toHaveLength(0);
});

test("expired statuses are hidden and open viewers close when 24 hours elapse", async ({ page }) => {
  const posts: FixtureStory[] = [story(new Date(Date.now() + 4000).toISOString())];
  await mockStories(page, posts);
  await page.goto("/");
  const bubble = page.getByRole("button", { name: "Voir le statut de Salon fictif QA" });
  await expect(bubble).toBeVisible();
  await bubble.click();
  await expect(page.getByRole("dialog", { name: "Statut de Salon fictif QA" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Statut de Salon fictif QA" })).toHaveCount(0, { timeout: 12000 });
  await expect(bubble).toHaveCount(0);
});
