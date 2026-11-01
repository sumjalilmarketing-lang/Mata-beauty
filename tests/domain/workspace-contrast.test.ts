import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceCss = readFileSync(
  fileURLToPath(new URL("../../app/workspace.css", import.meta.url)),
  "utf8",
);
const socialProfileCss = readFileSync(
  fileURLToPath(new URL("../../app/public-social-profile.module.css", import.meta.url)),
  "utf8",
);

function cssColor(rule: string, property: string): string {
  const value = rule.match(new RegExp(`${property}:\\s*(#[0-9a-fA-F]{3,8})`))?.[1];
  if (!value) throw new Error(`Missing ${property} in contrast rule`);
  return value;
}

function luminance(hex: string): number {
  const raw = hex.slice(1);
  const normalized = raw.length === 3 ? [...raw].map((c) => c + c).join("") : raw;
  const [r, g, b] = normalized.match(/.{2}/g)!.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...workspaceCss.matchAll(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, "g"))];
  const body = matches.at(-1)?.[1];
  if (!body) throw new Error(`Missing CSS rule ${selector}`);
  return body;
}

describe("professional workspace contrast contract", () => {
  it("keeps professional and salon panel copy readable on white surfaces", () => {
    const foreground = cssColor(
      rule(".workspace-layout:is(.workspace-pro,.workspace-salon)"),
      "--ui-text",
    );
    const muted = cssColor(
      rule(".workspace-layout:is(.workspace-pro,.workspace-salon)"),
      "--ui-muted",
    );
    expect(contrastRatio(foreground, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(muted, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the keyboard focus indicator and checkbox state distinguishable", () => {
    const focus = cssColor(
      rule(".workspace-layout:is(.workspace-pro,.workspace-salon)"),
      "--ui-focus",
    );
    const checkbox = cssColor(
      rule(".workspace-layout:is(.workspace-pro,.workspace-salon) input:is([type=\"checkbox\"],[type=\"radio\"])"),
      "accent-color",
    );
    expect(contrastRatio(focus, "#fff9fc")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(checkbox, "#ffffff")).toBeGreaterThanOrEqual(3);
  });

  it("keeps field borders and the professional primary action above AA thresholds", () => {
    const tokens = rule(".workspace-layout:is(.workspace-pro,.workspace-salon)");
    const border = cssColor(tokens, "--ui-border");
    const buttonRule = rule(".workspace-layout:is(.workspace-pro,.workspace-salon) .professional-onboarding-panel .primary-button");
    const backgroundColors = [...buttonRule.matchAll(/#[0-9a-fA-F]{3,8}/g)]
      .map(([color]) => color)
      .filter((color) => color.toLowerCase() !== "#fff" && color.toLowerCase() !== "#ffffff");
    expect(contrastRatio(border, "#ffffff")).toBeGreaterThanOrEqual(3);
    expect(backgroundColors).toHaveLength(2);
    for (const background of backgroundColors) {
      expect(contrastRatio("#ffffff", background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the completed step checkmark legible", () => {
    const completeIcon = rule(".workspace-layout:is(.workspace-pro,.workspace-salon) .professional-progress li.complete:before");
    expect(contrastRatio(cssColor(completeIcon, "color"), cssColor(completeIcon, "background"))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the public social profile primary action readable", () => {
    const profileTokens = socialProfileCss.match(/\.page\s*\{([^}]+)\}/)?.[1];
    if (!profileTokens) throw new Error("Missing public social profile color tokens");
    expect(contrastRatio("#ffffff", cssColor(profileTokens, "--pink"))).toBeGreaterThanOrEqual(4.5);
  });
});
