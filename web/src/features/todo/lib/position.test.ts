import { describe, expect, it } from "vitest";
import { needsRebalance, positionBetween, positionForAppend } from "./position";

describe("positionBetween", () => {
  it("빈 열 / 맨 앞 / 맨 뒤 / 사이", () => {
    expect(positionBetween(null, null)).toBe(1024);
    expect(positionBetween(null, 10)).toBeLessThan(10);
    expect(positionBetween(10, null)).toBeGreaterThan(10);
    expect(positionBetween(10, 20)).toBe(15);
  });
  it("반복해서 쪼개도 순서가 유지된다", () => {
    let hi = 2;
    for (let i = 0; i < 30; i++) {
      const p = positionBetween(1, hi);
      expect(p).toBeGreaterThan(1);
      expect(p).toBeLessThan(hi);
      hi = p;
    }
  });
  it("재정렬 필요 판정", () => {
    expect(needsRebalance(1, 1 + 1e-9)).toBe(true);
    expect(needsRebalance(1, 2)).toBe(false);
  });
});

describe("positionForAppend", () => {
  it("끝에 붙인다", () => {
    expect(positionForAppend([])).toBe(1024);
    expect(positionForAppend([5, 100, 7])).toBe(1124);
  });
});
