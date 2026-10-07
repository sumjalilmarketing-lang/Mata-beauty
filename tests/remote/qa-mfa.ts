import { createHmac } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

export function qaTotp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.replace(/=/g, "")) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  return ((hash.readUInt32BE(hash[19] & 15) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
}

export async function enrollQaMfa(api: SupabaseClient) {
  const factor = await api.auth.mfa.enroll({ factorType: "totp" }); expect(factor.error).toBeNull();
  const secret = factor.data!.totp.secret;
  expect((await api.auth.mfa.challengeAndVerify({ factorId: factor.data!.id, code: qaTotp(secret) })).error).toBeNull();
  return secret;
}

export async function completeQaMfa(page: Page, existingSecret?: string) {
  await expect(page.getByRole("heading", { name: "Vérification en deux étapes" })).toBeVisible();
  let secret = existingSecret;
  if (!secret) {
    const response = page.waitForResponse(r => r.url().endsWith("/auth/v1/factors") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Préparer la vérification" }).click();
    const factor = await (await response).json() as { totp: { secret: string } }; secret = factor.totp.secret;
  } else await page.getByRole("button", { name: "Préparer la vérification" }).click();
  await page.getByLabel("Code d’authentification").fill(qaTotp(secret));
  await page.getByRole("button", { name: "Vérifier le code" }).click();
  await expect(page.getByRole("navigation", { name: "Navigation Super Admin" })).toBeVisible();
  return secret;
}
