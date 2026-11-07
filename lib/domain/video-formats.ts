/** Extensions are a picker fallback, never proof that bytes are valid video. */
export const VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "mkv", "avi", "3gp", "3g2", "m4v", "mpeg", "mpg", "mts", "m2ts", "ts", "wmv", "flv", "vob", "ogv", "ogg", "hevc", "h265", "h264", "mxf", "asf", "f4v"];
export const STUDIO_MEDIA_ACCEPT = `image/jpeg,image/png,image/webp,video/*,${VIDEO_EXTENSIONS.map(extension => `.${extension}`).join(",")}`;

export function isVideoFile(file: { type: string; name?: string }): boolean {
  const type = file.type.toLowerCase().split(";")[0].trim();
  if (type.startsWith("video/")) return true;
  // Do not classify a declared image/document as video just by its filename.
  return (!type || ["application/octet-stream", "application/ogg", "application/mxf", "application/vnd.rn-realmedia"].includes(type))
    && VIDEO_EXTENSIONS.includes(file.name?.split(".").pop()?.toLowerCase() ?? "");
}
