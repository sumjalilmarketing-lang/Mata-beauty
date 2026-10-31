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

  it("explains unavailable email delivery without exposing provider details", () => {
    for (const code of ["email_address_not_authorized", "email_address_invalid"]) {
      const message = authErrorMessage({ code, message: "private recipient and SMTP configuration" });
      expect(message).toContain("adresse e-mail");
      expect(message).not.toContain("private");
    }
    expect(authErrorMessage({ code: "unexpected_failure", message: "Error sending confirmation email: private SMTP host" })).toContain("n’a pas pu être envoyé");
  });

  it("explains unusable email sessions and password policy errors safely", () => {
    expect(authErrorMessage({ name: "AuthSessionMissingError" })).toContain("nouveau lien");
    expect(authErrorMessage({ code: "otp_expired", message: "private token" })).not.toContain("private token");
    expect(authErrorMessage({ code: "same_password" })).toContain("différent");
    expect(authErrorMessage({ code: "weak_password" })).toContain("faible");
  });
});
