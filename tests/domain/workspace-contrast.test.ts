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

it("keeps the profile shortcuts readable on professional and salon settings", () => {
 const normal=rule(".workspace-layout:is(.workspace-pro,.workspace-salon) .profile-shortcuts a");
 const hover=rule(".workspace-layout:is(.workspace-pro,.workspace-salon) .profile-shortcuts a:hover");
 expect(contrastRatio(cssColor(normal,"color"),cssColor(normal,"background"))).toBeGreaterThanOrEqual(4.5);
 expect(contrastRatio(cssColor(hover,"color"),cssColor(hover,"background"))).toBeGreaterThanOrEqual(4.5);
});

const readabilityCss = readFileSync(fileURLToPath(new URL("../../app/readability.css", import.meta.url)), "utf8");

it("keeps Studio actions and navigation initials readable at every gradient stop", () => {
 for (const selector of [".workspace-layout .workspace-brand>span", ".workspace-layout:is(.workspace-pro,.workspace-salon) .studio-hero>button"]) {
  const body = rule(selector);
  const foreground = cssColor(body, "color");
  const background = body.match(/background:([^;]+)/)?.[1] ?? "";
  const stops = [...background.matchAll(/#[0-9a-fA-F]{6}/g)].map(match => match[0]);
  expect(stops).toHaveLength(2);
  for (const stop of stops) expect(contrastRatio(foreground, stop)).toBeGreaterThanOrEqual(4.5);
 }
});

it("keeps both Studio publication step labels above AA on their light badge", () => {
 const body = rule(".workspace-layout:is(.workspace-pro,.workspace-salon) .creator-studio .role-pill");
 expect(contrastRatio(cssColor(body,"color"),cssColor(body,"background"))).toBeGreaterThanOrEqual(4.5);
});

it("keeps internal list reset links and light-field placeholders readable", () => {
 const darkLink = cssColor(rule(".workspace-layout:not(.workspace-pro):not(.workspace-salon) .workspace-list-search a"), "color");
 for (const panel of ["#090910", "#15151e"]) expect(contrastRatio(darkLink,panel)).toBeGreaterThanOrEqual(4.5);
 const placeholder = cssColor(rule(".workspace-layout .workspace-list-search input::placeholder"), "color");
 expect(contrastRatio(placeholder,"#ffffff")).toBeGreaterThanOrEqual(4.5);
});

it("keeps internal form boundaries distinguishable from white panels", () => {
 const border = readabilityCss.match(/\.department-workspace :is\(input,select,textarea\),\s*\.crm-workspace :is\(input:not\(\[type=checkbox\]\),select,textarea\)\s*\{\s*border-color:(#[0-9a-fA-F]{6})/)?.[1];
 expect(border).toBeDefined();
 for (const surface of ["#ffffff", "#fff7fb"]) expect(contrastRatio(border!,surface)).toBeGreaterThanOrEqual(3);
});

it("keeps administrative panel palettes readable in both OS themes", () => {
 const paletteRules = [...readabilityCss.matchAll(/--ui-surface:\s*(#[\da-f]+);([\s\S]*?)--ui-focus:\s*(#[\da-f]+);/gi)];
 expect(paletteRules).toHaveLength(2);
 for (const match of paletteRules) {
  const body = match[0];
  for (const foreground of ["--ui-text", "--ui-muted", "--ui-accent", "--ui-success", "--ui-danger"])
   for (const surface of ["--ui-surface", "--ui-field"])
    expect(contrastRatio(cssColor(body,foreground),cssColor(body,surface))).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(cssColor(body,"--ui-border"),cssColor(body,"--ui-field"))).toBeGreaterThanOrEqual(3);
 }
 expect(readabilityCss).toContain('.super-admin-shell:not(.admin-auth-shell) { --text:var(--ui-text); --muted:var(--ui-muted); --line:var(--ui-border); --bg:#160d14; }');
 expect(readabilityCss).toContain('.admin-topbar,.admin-table-wrap,.admin-search-results,.admin-data-table,.admin-data-table th,.admin-search-results button,.admin-global-search,.admin-inline-search');
});

it("keeps video captions and action labels readable even over a white frame", () => {
 const background = readabilityCss.match(/\.social-video-card \.social-caption \{ padding:8px 10px; border-radius:12px; background:(#[0-9a-f]{8}); \}/)?.[1];
 expect(background).toBeDefined();
 const hex=background!.slice(1); const alpha=Number.parseInt(hex.slice(6),16)/255;
 const composite='#'+[0,2,4].map(offset=>Math.round(Number.parseInt(hex.slice(offset,offset+2),16)*alpha+255*(1-alpha)).toString(16).padStart(2,'0')).join('');
 for (const foreground of ["#ffffff", "#d8cfda", "#f353a2"]) expect(contrastRatio(foreground,composite)).toBeGreaterThanOrEqual(4.5);
 expect(readabilityCss).toContain('.social-video-card .feed-options>summary { background:#090712e6; }');
});
