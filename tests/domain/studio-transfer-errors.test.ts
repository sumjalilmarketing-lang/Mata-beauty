import { expect, it, vi } from "vitest";
import { studioTransferMessage } from "@/lib/media/video-upload-client";
import { logStudioFailure } from "@/lib/media/studio-logging";
it("distinguishes server refusals, quotas, expired sessions and transport failures",()=>{
 expect(studioTransferMessage(401)).toContain("session a expiré");
 expect(studioTransferMessage(403)).toContain("serveur a refusé");
 expect(studioTransferMessage(403)).not.toContain("vérifiez la connexion");
 expect(studioTransferMessage(413)).toContain("taille autorisée");
 expect(studioTransferMessage(429)).toContain("limite d’envois");
 expect(studioTransferMessage(503)).toContain("momentanément indisponible");
 expect(studioTransferMessage(0)).toContain("connexion");
});
it("logs fixed operation and stage labels without user or transport details",()=>{
 const log=vi.spyOn(console,"error").mockImplementation(()=>{});
 try {
  logStudioFailure("prepare-video",new Error("Output upload unavailable"));
  logStudioFailure("validate-video",new Error("https://secret/path?token=private"));
  expect(log.mock.calls.map(call=>call[0])).toEqual([
   JSON.stringify({event:"studio_failure",operation:"prepare-video",stage:"Output upload unavailable",code:"STUDIO_SERVICE_UNAVAILABLE"}),
   JSON.stringify({event:"studio_failure",operation:"validate-video",stage:"unexpected_failure",code:"STUDIO_SERVICE_UNAVAILABLE"}),
  ]);
 }finally{log.mockRestore();}
});
