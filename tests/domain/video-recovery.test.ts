import { describe, expect, it, vi } from "vitest";
import { createVideoRefreshQueue, reloadVideoSource, playFeedVideo, feedVideoPreload } from "@/lib/domain/video-recovery";

describe("stalled video recovery", () => {
  it("restarts fetching even when signing returns the exact same URL", () => {
    const video = { src: "https://media.example.test/video.mp4", load: vi.fn() };
    reloadVideoSource(video, video.src);
    expect(video.load).toHaveBeenCalledOnce();
    expect(video.src).toBe("https://media.example.test/video.mp4");
  });
  it("restores a detached source and reloads a renewed source", () => {
    const video = { src: "", load: vi.fn() };
    reloadVideoSource(video, "https://media.example.test/video.mp4?renewed=1");
    expect(video.src).toContain("renewed=1");
    expect(video.load).toHaveBeenCalledOnce();
  });
  it("shares simultaneous timeout and media-error recovery instead of failing a duplicate", async () => {
    const queue = createVideoRefreshQueue<boolean>();
    let finish!: (value: boolean) => void;
    const refresh = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    const first = queue.run("post-a", refresh);
    const second = queue.run("post-a", refresh);
    expect(first).toBe(second);
    expect(queue.isPending("post-a")).toBe(true);
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledOnce();
    finish(true);
    await expect(second).resolves.toBe(true);
    expect(queue.isPending("post-a")).toBe(false);
  });
  it("allows independent posts and a later retry after a failure", async () => {
    const queue = createVideoRefreshQueue<boolean>();
    const a = queue.run("post-a", async () => { throw new Error("network"); });
    await expect(queue.run("post-b", async () => true)).resolves.toBe(true);
    await expect(a).rejects.toThrow("network");
    expect(queue.isPending("post-a")).toBe(false);
    await expect(queue.run("post-a", async () => true)).resolves.toBe(true);
  });
});

it('restores the watched position after renewing a signed URL',()=>{
 const events=new EventTarget();const video={src:'https://media.example.test/old.mp4',currentTime:12,duration:90,addEventListener:events.addEventListener.bind(events),load:()=>{video.currentTime=0;}};
 reloadVideoSource(video,'https://media.example.test/new.mp4');expect(video.currentTime).toBe(0);events.dispatchEvent(new Event('loadedmetadata'));expect(video.currentTime).toBe(12);
});
it('clamps recovery to the new duration',()=>{
 const events=new EventTarget();const video={src:'old',currentTime:50,duration:20,addEventListener:events.addEventListener.bind(events),load:()=>{video.currentTime=0;}};
 reloadVideoSource(video,'new');events.dispatchEvent(new Event('loadedmetadata'));expect(video.currentTime).toBeCloseTo(19.95);
});
it('retries blocked sound autoplay muted, without disguising decode failures',async()=>{
 const muted=vi.fn();const video={muted:false,play:vi.fn().mockRejectedValueOnce(new DOMException('Gesture required','NotAllowedError')).mockResolvedValueOnce(undefined)};
 await playFeedVideo(video,muted);expect(video.muted).toBe(true);expect(video.play).toHaveBeenCalledTimes(2);expect(muted).toHaveBeenCalledOnce();
 const broken={muted:false,play:vi.fn().mockRejectedValue(new DOMException('Unsupported codec','NotSupportedError'))};await playFeedVideo(broken,muted);expect(broken.play).toHaveBeenCalledOnce();
});
it('warms the next video while respecting data saver',()=>{expect(feedVideoPreload(false,false)).toBe('auto');expect(feedVideoPreload(false,true)).toBe('metadata');expect(feedVideoPreload(true,true)).toBe('auto');});
