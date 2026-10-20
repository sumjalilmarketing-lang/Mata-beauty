import { describe, expect, it } from "vitest";
import { isPlatformSettingKey, parsePlatformSetting, validatePlatformSetting } from "../../lib/domain/admin-platform-settings";

describe("Super Admin platform settings", () => {
  it("parses only the three setting shapes already seeded by the backend", () => {
    expect(parsePlatformSetting("application", { name: "Mata Beauty", locale: "fr-SN", country: "SN", currency: "XOF", timezone: "Africa/Dakar" })).toEqual({ name: "Mata Beauty", locale: "fr-SN", country: "SN", currency: "XOF", timezone: "Africa/Dakar" });
    expect(parsePlatformSetting("booking", { minimum_notice_minutes: 60, cancellation_window_hours: 24 })).toEqual({ minimum_notice_minutes: 60, cancellation_window_hours: 24 });
    expect(parsePlatformSetting("support", { email: "help@example.test", phone: "" })).toEqual({ email: "help@example.test", phone: "" });
    expect(parsePlatformSetting("booking", { minimum_notice_minutes: "60" })).toBeNull();
  });

  it("accepts supported values and rejects invalid ranges and contact details", () => {
    expect(validatePlatformSetting("application", { name: "Mata Beauty", locale: "fr-SN", country: "SN", currency: "XOF", timezone: "Africa/Dakar" })).toBeNull();
    expect(validatePlatformSetting("booking", { minimum_notice_minutes: 60, cancellation_window_hours: 24 })).toBeNull();
    expect(validatePlatformSetting("booking", { minimum_notice_minutes: -1, cancellation_window_hours: 24 })).toContain("préavis");
    expect(validatePlatformSetting("application", { name: "Mata Beauty", locale: "fr-SN", country: "SN", currency: "EUR", timezone: "Europe/Paris" })).toContain("n’est pas pris en charge");
    expect(validatePlatformSetting("support", { email: "invalid", phone: "" })).toContain("e-mail");
    expect(validatePlatformSetting("support", { email: "help@example.test", phone: "+221 77 123 45 67" })).toBeNull();
    expect(validatePlatformSetting("support", { email: "help@example.test", phone: "abc" })).toContain("téléphone");
  });

  it("does not allow unrecognized backend keys to be presented as editable settings", () => {
    expect(isPlatformSettingKey("application")).toBe(true);
    expect(isPlatformSettingKey("commission")).toBe(false);
    expect(isPlatformSettingKey("maintenance")).toBe(false);
  });
});
