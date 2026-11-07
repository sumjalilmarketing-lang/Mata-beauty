import { loadFFmpeg } from "./ffmpeg-loader";
import { StudioUploadError } from "./video-upload-client";

/** One worker per operation; no video is sent to a third-party converter. */
export async function convertStudioVideo(file: File, onStatus: (message: string) => void, signal?: AbortSignal): Promise<File> {
  const { FFmpeg } = await loadFFmpeg();
  const ffmpeg = new FFmpeg();
  let abort: (() => void) | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        onStatus("Chargement de la préparation vidéo… Gardez le Studio ouvert.");
        await ffmpeg.load({
          classWorkerURL: "/video-converter/worker.js",
          coreURL: "/video-converter/ffmpeg-core.js",
          wasmURL: "/video-converter/ffmpeg-core.wasm",
        });
        ffmpeg.on("progress", ({ progress }) => onStatus(`Conversion de votre vidéo… ${Math.min(99, Math.max(0, Math.round(progress * 100)))} %`));
        await ffmpeg.writeFile("input", new Uint8Array(await file.arrayBuffer()));
        await ffmpeg.ffprobe(["-v", "error", "-show_entries", "stream=codec_name,codec_type,pix_fmt", "-of", "json", "-o", "probe.json", "input"]);
        // Core 0.12.10 returns -1 even after a successful ffprobe; validate its JSON instead.
        const probe = await ffmpeg.readFile("probe.json");
        const metadata = JSON.parse(typeof probe === "string" ? probe : new TextDecoder().decode(probe)) as { streams?: Array<{ codec_type: string; codec_name: string; pix_fmt?: string }> };
        const video = metadata.streams?.find(stream => stream.codec_type === "video");
        if (!video) throw new Error("No video stream");
        const audio = metadata.streams?.find(stream => stream.codec_type === "audio");
        // Preserve existing compatible video/audio bitstreams, including resolution.
        const videoOptions = video?.codec_name === "h264" && video.pix_fmt === "yuv420p"
          ? ["-c:v", "copy"]
          : ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-pix_fmt", "yuv420p"];
        const audioOptions = !audio || audio.codec_name === "aac" ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "128k"];
        const code = await ffmpeg.exec([
          "-i", "input", "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn",
          ...videoOptions, ...audioOptions, "-movflags", "+faststart", "output.mp4",
        ]);
        if (code !== 0) throw new Error("Invalid media");
        const data = await ffmpeg.readFile("output.mp4");
        if (typeof data === "string" || !data.byteLength) throw new Error("Empty media");
        if (data.byteLength > 100 * 1024 * 1024) throw new StudioUploadError("Après conversion, la vidéo dépasse 100 Mo. Votre sélection est conservée ; choisissez un fichier plus léger.");
        return new File([new Uint8Array(data)], `${file.name.replace(/\.[^.]+$/, "")}.mp4`, { type: "video/mp4" });
      })(),
      new Promise<never>((_, reject) => {
        abort = () => reject(new StudioUploadError("Préparation annulée. Votre vidéo et vos champs sont conservés."));
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
        deadline = setTimeout(() => reject(new StudioUploadError("La préparation prend trop de temps sur cet appareil. Votre vidéo et vos champs sont conservés ; réessayez sur un ordinateur.")), 15 * 60 * 1000);
      }),
    ]);
  } catch (error) {
    if (error instanceof StudioUploadError) throw error;
    throw new StudioUploadError("Cette vidéo n’a pas pu être préparée sur cet appareil (format non décodable, fichier endommagé ou mémoire insuffisante). Votre sélection et vos champs sont conservés.");
  } finally {
    clearTimeout(deadline);
    if (abort) signal?.removeEventListener("abort", abort);
    ffmpeg.terminate();
  }
}
