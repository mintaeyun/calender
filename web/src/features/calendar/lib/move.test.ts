import { describe, expect, it } from "vitest";
import { moveRange, resizeRange, snap } from "./move";

const TZ = "Asia/Seoul";
describe("move", () => {
  it("하루 뒤 + 30분", () => {
    const r = moveRange(new Date("2026-10-14T00:30:00Z"), new Date("2026-10-14T01:30:00Z"), 1, 30, TZ);
    expect(r).toEqual({ start_at: "2026-10-15T01:00:00.000Z", end_at: "2026-10-15T02:00:00.000Z" });
  });
  it("종일 일정(여러 날)을 하루 이동", () => {
    const r = moveRange(new Date("2026-10-16T15:00:00Z"), new Date("2026-10-18T15:00:00Z"), 1, 0, TZ);
    expect(r).toEqual({ start_at: "2026-10-17T15:00:00.000Z", end_at: "2026-10-19T15:00:00.000Z" });
  });
  it("크기 조절은 최소 15분", () => {
    const s = new Date("2026-10-14T00:00:00Z");
    expect(resizeRange(s, new Date("2026-10-14T01:00:00Z"), -120).end_at).toBe("2026-10-14T00:15:00.000Z");
    expect(resizeRange(s, new Date("2026-10-14T01:00:00Z"), 45).end_at).toBe("2026-10-14T01:45:00.000Z");
  });
  it("15분 스냅", () => {
    expect(snap(7)).toBe(0);
    expect(snap(8)).toBe(15);
    expect(snap(-22)).toBe(-15);
  });
});
