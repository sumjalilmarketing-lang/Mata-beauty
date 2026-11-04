import { describe, it, expect } from "vitest";
import { shouldResumeSalonInvitation } from "../../lib/domain/salon-invitation";
describe("explicit invitation acceptance after authentication", () => {
    const token = "a".repeat(43);
    it("resumes only the exact invitation previously accepted", () => { expect(shouldResumeSalonInvitation(token, token)).toBe(true); });
    it("does not accept on opening an invitation", () => { expect(shouldResumeSalonInvitation(token, null)).toBe(false); });
    it("cannot reuse consent from another salon invitation", () => { expect(shouldResumeSalonInvitation(token, "b".repeat(43))).toBe(false); });
    it("rejects missing and malformed invitation tokens", () => { expect(shouldResumeSalonInvitation(null, null)).toBe(false); expect(shouldResumeSalonInvitation("bad", "bad")).toBe(false); });
});
