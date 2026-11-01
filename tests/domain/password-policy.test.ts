import { describe, expect, it } from "vitest";
import { meetsPasswordPolicy } from "../../lib/auth/password-policy";

describe("native password policy alignment", () => {
  it.each(["Short1!", "alllowercase123!", "ALLUPPERCASE123!", "NoDigitsInThis!", "NoSymbolsHere123", "WhitespaceOnly12 "])("rejects a missing length or character requirement", password => {
    expect(meetsPasswordPolicy(password)).toBe(false);
  });
  it("allows long passwords with the native character groups", () => {
    expect(meetsPasswordPolicy("Correct-Horse-42!battery")).toBe(true);
    expect(meetsPasswordPolicy("  Long-Unique-42!  ")).toBe(true);
  });
});
