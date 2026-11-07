import { beforeEach, expect, it, vi } from "vitest";
const worker = vi.hoisted(() => ({ load: vi.fn(), on: vi.fn(), writeFile: vi.fn(), exec: vi.fn(), ffprobe: vi.fn(), readFile: vi.fn(), terminate: vi.fn() }));
vi.mock("../../lib/media/ffmpeg-loader", () => ({ loadFFmpeg: async () => ({ FFmpeg: class { constructor() { return worker; } } }) }));
import { convertStudioVideo } from "../../lib/media/video-conversion-client";
beforeEach(() => { vi.clearAllMocks(); worker.load.mockResolvedValue(true); worker.exec.mockResolvedValue(0); worker.ffprobe.mockResolvedValue(-1); worker.readFile.mockImplementation(async (path: string) => path === "probe.json" ? JSON.stringify({streams:[{codec_type:"video",codec_name:"hevc"}]}) : new Uint8Array([1,2,3])); });
it("converts to MP4 with a video stream, optional audio, no duration cap and releases the worker", async () => {
 const result = await convertStudioVideo(new File(["video"], "camera.MOV", {type:"video/quicktime"}), vi.fn());
 expect(result.name).toBe("camera.mp4"); expect(result.type).toBe("video/mp4");
 expect(worker.exec.mock.calls[0][0]).toContain("0:a:0?"); expect(worker.exec.mock.calls[0][0]).not.toContain("-t");
 expect(worker.load.mock.calls[0][0].classWorkerURL).toBe("/video-converter/worker.js");
 expect(worker.terminate).toHaveBeenCalledOnce();
});
it("refuses malformed media before upload and releases the worker", async () => {
 worker.exec.mockResolvedValue(1);
 await expect(convertStudioVideo(new File(["broken"], "clip.avi"), vi.fn())).rejects.toThrow("sélection");
 expect(worker.readFile).not.toHaveBeenCalledWith("output.mp4"); expect(worker.terminate).toHaveBeenCalledOnce();
});
it("cancels stalled preparation and releases memory", async () => {
 worker.load.mockReturnValue(new Promise(() => {}));
 const controller = new AbortController();
 const pending = convertStudioVideo(new File(["video"], "clip.mkv"), vi.fn(), controller.signal);
 controller.abort();
 await expect(pending).rejects.toThrow("annulée"); expect(worker.terminate).toHaveBeenCalledOnce();
});

it("remuxes compatible H264/AAC without reencoding", async () => {
 worker.readFile.mockImplementation(async (path: string) => path === "probe.json" ? JSON.stringify({streams:[{codec_type:"video",codec_name:"h264",pix_fmt:"yuv420p"},{codec_type:"audio",codec_name:"aac"}]}) : new Uint8Array([1]));
 await convertStudioVideo(new File(["video"], "clip.mp4"), vi.fn());
 expect(worker.exec.mock.calls[0][0]).not.toContain("libx264"); expect(worker.exec.mock.calls[0][0]).toContain("copy");
});
