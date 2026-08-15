import { describe, expect, it } from "vitest";
import { authErrorMessage } from "../../lib/auth/errors";

describe("authErrorMessage", () => {
  it("maps provider errors without leaking their technical text", () => {
    expect(authErrorMessage({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe("E-mail ou mot de passe incorrect.");
    expect(authErrorMessage({ code: "email_not_confirmed", message: "Email not confirmed" })).toContain("confirmée");
    expect(authErrorMessage({ message: "private database failure: relation auth.users" })).not.toContain("database");
  });

  it("gives an actionable message for throttling and suspension", () => {
    expect(authErrorMessage({ status: 429 })).toContain("Trop de tentatives");
    expect(authErrorMessage({ code: "user_banned" })).toContain("suspendu");
  });
});
