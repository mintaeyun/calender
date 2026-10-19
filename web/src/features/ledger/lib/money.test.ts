import { describe, expect, it } from "vitest";
import { balanceOf, compactWon, formatSigned, parseAmount, validateTransfer } from "./money";

describe("parseAmount", () => {
  it("쉼표·원·공백을 제거한다", () => {
    expect(parseAmount("12,000원")).toEqual({ ok: true, value: 12000 });
    expect(parseAmount(" 5 500 ")).toEqual({ ok: true, value: 5500 });
    expect(parseAmount("350000")).toEqual({ ok: true, value: 350000 });
  });
  it("0·음수·소수·문자·빈 값 거부", () => {
    for (const bad of ["0", "-100", "12.5", "abc", "", "1e3", "원"]) expect(parseAmount(bad).ok).toBe(false);
  });
  it("안전 정수 범위를 넘으면 거부", () => {
    expect(parseAmount("99999999999999999999").ok).toBe(false);
  });
});

describe("formatSigned", () => {
  it("구분별 부호", () => {
    expect(formatSigned(12000, "expense")).toBe("−12,000");
    expect(formatSigned(350000, "income")).toBe("+350,000");
    expect(formatSigned(100000, "transfer")).toBe("⇄100,000");
  });
});

describe("balanceOf", () => {
  const txs = [
    { type: "income" as const, amount: 350000, account_id: "kb", to_account_id: null },
    { type: "expense" as const, amount: 1550, account_id: "kb", to_account_id: null },
    { type: "expense" as const, amount: 46200, account_id: "card", to_account_id: null },
    { type: "transfer" as const, amount: 100000, account_id: "kb", to_account_id: "cash" },
  ];
  it("초기잔액 + 거래 합계", () => {
    expect(balanceOf("kb", 1000000, txs)).toBe(1000000 + 350000 - 1550 - 100000);
    expect(balanceOf("cash", 0, txs)).toBe(100000);
    expect(balanceOf("card", 0, txs)).toBe(-46200);
  });
});

describe("validateTransfer", () => {
  it("도착 계좌 필수, 동일 계좌 거부", () => {
    expect(validateTransfer("a", null)).not.toBeNull();
    expect(validateTransfer("a", "a")).not.toBeNull();
    expect(validateTransfer("a", "b")).toBeNull();
  });
});

describe("compactWon", () => {
  it("만 단위 축약", () => {
    expect(compactWon(5500)).toBe("5,500");
    expect(compactWon(12000)).toBe("1.2만");
    expect(compactWon(350000)).toBe("35만");
    expect(compactWon(1642300)).toBe("164.2만");
    expect(compactWon(10000)).toBe("1만");
  });
});
