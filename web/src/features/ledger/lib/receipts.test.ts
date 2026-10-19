import { describe, expect, it } from "vitest";
import { fitWithin, isOwnPath, MAX_RECEIPTS, receiptPath, validateReceipt } from "./receipts";

const img = { type: "image/jpeg", size: 2_000_000 };

describe("validateReceipt", () => {
  it("정상 파일", () => expect(validateReceipt(img, 0)).toBeNull());
  it("거래당 최대 3장", () => {
    expect(validateReceipt(img, MAX_RECEIPTS - 1)).toBeNull();
    expect(validateReceipt(img, MAX_RECEIPTS)).toContain("최대 3장");
  });
  it("이미지가 아니면 거부, 대소문자 무시", () => {
    expect(validateReceipt({ type: "application/pdf", size: 1000 }, 0)).toContain("이미지");
    expect(validateReceipt({ type: "IMAGE/PNG", size: 1000 }, 0)).toBeNull();
  });
  it("10MB 초과·빈 파일 거부", () => {
    expect(validateReceipt({ type: "image/png", size: 10 * 1024 * 1024 + 1 }, 0)).toContain("10MB");
    expect(validateReceipt({ type: "image/png", size: 0 }, 0)).toContain("빈 파일");
  });
});

describe("fitWithin", () => {
  it("긴 변을 1600으로, 비율 유지", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });
  it("이미 작으면 그대로", () => expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 }));
});

describe("경로", () => {
  it("user/transaction/name.jpg, 소유 판정", () => {
    const p = receiptPath("u1", "t1", "abc");
    expect(p).toBe("u1/t1/abc.jpg");
    expect(isOwnPath(p, "u1")).toBe(true);
    expect(isOwnPath(p, "u2")).toBe(false);
  });
});
