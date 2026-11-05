import { expect, it, vi, afterEach } from "vitest";
import { shouldOfferAppUpdate } from "../../lib/domain/app-version";
import { GET } from "../../app/api/app-version/route";
afterEach(()=>vi.unstubAllEnvs());
it("offers a refresh only for different valid deployed versions",()=>{
 const current="a".repeat(40), next="b".repeat(40);
 expect(shouldOfferAppUpdate(current,next)).toBe(true);
 for(const incoming of [current,undefined,null,"local","https://other.example"]) expect(shouldOfferAppUpdate(current,incoming)).toBe(false);
 expect(shouldOfferAppUpdate("local",next)).toBe(false);
});
it("serves the current deployment version without caching or account information",async()=>{
 vi.stubEnv("VERCEL_GIT_COMMIT_SHA","b".repeat(40));
 const response=GET();expect(response.headers.get("cache-control")).toContain("no-store");expect(await response.json()).toEqual({version:"b".repeat(40)});
});
it("automatically applies updates only on an idle visible screen",async()=>{
 const {canAutoApplyAppUpdate}=await import("../../lib/domain/app-version");
 const safe={visible:true,online:true,hasUnsavedChanges:false,hasFocusedEditor:false,hasActiveMedia:false};
 expect(canAutoApplyAppUpdate(safe)).toBe(true);
 for(const state of [{visible:false},{online:false},{hasUnsavedChanges:true},{hasFocusedEditor:true},{hasActiveMedia:true}]) expect(canAutoApplyAppUpdate({...safe,...state})).toBe(false);
});
