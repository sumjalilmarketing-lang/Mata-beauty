import { describe, expect, it } from "vitest";
import { orderCommentThreads } from "../../lib/domain/comment-threads";
import { parseVideoResume } from "../../lib/domain/video-resume";

describe("video comment threads", () => {
  it("keeps nested replies with their parent even when the server page is out of order", () => {
    const rows = [
      { id: "reply2", parent_id: "root", created_at: "2026-10-11T12:02:00Z" },
      { id: "other", parent_id: null, created_at: "2026-10-11T12:03:00Z" },
      { id: "root", parent_id: null, created_at: "2026-10-11T12:00:00Z" },
      { id: "nested", parent_id: "reply1", created_at: "2026-10-11T12:04:00Z" },
      { id: "reply1", parent_id: "root", created_at: "2026-10-11T12:01:00Z" },
    ];
    const ordered = orderCommentThreads(rows);
    expect(ordered.map(row => [row.comment.id, row.depth])).toEqual([["other", 0], ["root", 0], ["reply1", 1], ["nested", 2], ["reply2", 1]]);
    expect(rows[0].id).toBe("reply2");
  });
  it("does not drop visible replies when the parent is hidden or in another page", () => {
    expect(orderCommentThreads([{ id: "reply", parent_id: "not-loaded", created_at: "2026-10-11" }]).map(row => row.comment.id)).toEqual(["reply"]);
  });
  it("renders each legacy cyclic comment once instead of recursing forever", () => {
    const result = orderCommentThreads([{ id: "a", parent_id: "b", created_at: "2026-10-11" }, { id: "b", parent_id: "a", created_at: "2026-10-11" }]);
    expect(result.map(row => row.comment.id)).toEqual(["a", "b"]);
  });
});

describe("video navigation resume", () => {
  it("retains playback position and explicit user pause", () => {
    expect(parseVideoResume(JSON.stringify({ time: 12.5, paused: true, savedAt: 1000 }), 60, 2000)).toEqual({ time: 12.5, paused: true, savedAt: 1000 });
  });
  it("discards corrupt, stale and future snapshots", () => {
    for (const value of ["invalid", "{}", JSON.stringify({ time: -1, paused: false, savedAt: 1000 }), JSON.stringify({ time: 10, paused: false, savedAt: 0 }), JSON.stringify({ time: 10, paused: false, savedAt: 9_000_000 })]) expect(parseVideoResume(value, 60, 4_000_000)).toBeNull();
  });
  it("restarts a changed short asset instead of seeking beyond its duration", () => {
    expect(parseVideoResume(JSON.stringify({ time: 65, paused: false, savedAt: 1000 }), 30, 2000)?.time).toBe(0);
  });
});
