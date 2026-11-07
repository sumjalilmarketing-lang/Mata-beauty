/** Keep the self-hosted worker module out of Next's worker URL transformation. */
export async function loadFFmpeg(): Promise<typeof import("@ffmpeg/ffmpeg")> {
  const moduleURL = "/video-converter/index.js";
  return import(/* webpackIgnore: true */ moduleURL);
}
