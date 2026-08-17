import { describe, expect, it } from "vitest";
import { MAX_VIDEO_BYTES, parseVideoHashtags, resolveVideoUploadFormat, validateVideoDuration, validateVideoUpload, videoPublishErrorMessage } from "../../lib/social/video-upload";

describe("validation des vidéos Studio", () => {
  it.each([
    ["clip.mp4", "video/mp4", "mp4", "video/mp4"],
    ["clip.MOV", "video/quicktime", "mov", "video/quicktime"],
    ["clip.webm", "video/webm; codecs=vp9", "webm", "video/webm"],
    ["capture.webm", "", "webm", "video/webm"],
    ["capture.mov", "application/octet-stream", "mov", "video/quicktime"],
    ["capture.m4v", "video/x-m4v", "mp4", "video/mp4"],
  ])("accepte %s avec le MIME %s", (name, type, extension, contentType) => {
    expect(resolveVideoUploadFormat({ name, type, size: 1 })).toEqual({ extension, contentType });
  });

  it("privilégie un MIME vidéo réel supporté à une extension trompeuse", () => {
    expect(resolveVideoUploadFormat({ name: "capture.bin", type: "video/webm", size: 1 })).toEqual({ extension: "webm", contentType: "video/webm" });
  });

  it("refuse un MIME réellement non supporté", () => {
    expect(validateVideoUpload({ name: "fausse-video.mp4", type: "text/plain", size: 1 })).toEqual({ ok: false, message: "Format vidéo non pris en charge." });
  });

  it("applique exactement la limite Storage de 100 Mo", () => {
    expect(validateVideoUpload({ name: "clip.mp4", type: "video/mp4", size: MAX_VIDEO_BYTES }).ok).toBe(true);
    expect(validateVideoUpload({ name: "clip.mp4", type: "video/mp4", size: MAX_VIDEO_BYTES + 1 })).toEqual({ ok: false, message: "Vidéo trop volumineuse. Taille maximale : 100 Mo." });
  });

  it("centralise la durée maximale à 90 secondes", () => {
    expect(validateVideoDuration(90)).toEqual({ ok: true });
    expect(validateVideoDuration(90.01)).toEqual({ ok: false, message: "La vidéo doit durer entre 1 et 90 secondes." });
  });

  it("normalise, déduplique et limite les hashtags", () => {
    expect(parseVideoHashtags("#Braids, #Dakar #braids beauté! x")).toEqual(["braids", "dakar", "beaute"]);
    expect(parseVideoHashtags(Array.from({ length: 12 }, (_, index) => `#tag_${index}`).join(" "))).toHaveLength(10);
  });
});

describe("messages publics de publication vidéo", () => {
  it.each([
    [{ status: 401 }, "Votre session a expiré. Reconnectez-vous."],
    [{ code: "42501", message: "row-level security" }, "Vous n’êtes pas autorisé à publier."],
    [{ status: 413 }, "Vidéo trop volumineuse. Taille maximale : 100 Mo."],
    [{ code: "ABORT" }, "L’envoi a été interrompu. Vérifiez votre connexion et réessayez."],
    [{ message: "invalid mime type" }, "Format vidéo non pris en charge."],
    [{ message: "La durée de la vidéo ne peut pas être déterminée." }, "Impossible de lire la durée ou les dimensions de cette vidéo."],
    [{ message: "Fichier vidéo Storage invalide" }, "Impossible d’envoyer la vidéo. Réessayez."],
    [{ message: "duplicate key violates constraint" }, "Un envoi identique existe déjà. Réessayez."],
  ])("traduit une erreur technique sans détail SQL", (error, expected) => {
    expect(videoPublishErrorMessage(error)).toBe(expected);
  });
});
