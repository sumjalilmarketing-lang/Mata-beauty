import { describe, expect, it, vi } from "vitest";
import { createVideoRefreshQueue, reloadVideoSource } from "@/lib/domain/video-recovery";

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
