import { describe, expect, it } from "vitest";
import { autoMap, dateSpan, dupKey, markDuplicates, missingRequired, normalizeDate, parseTxType, validateRows, type Lookups } from "./importTx";
import { TX_HEADER } from "./rows";

const lk: Lookups = {
  categories: [{ id: "c-food", name: "식비", kind: "expense" }, { id: "c-pay", name: "급여", kind: "income" }],
  accounts: [{ id: "a-card", name: "신한카드" }, { id: "a-cash", name: "현금" }],
  defaultAccountId: "a-cash",
};
const map = autoMap(TX_HEADER);

describe("autoMap", () => {
  it("내보내기 헤더는 전부 매핑된다", () => {
    expect(map).toEqual({ date: 0, type: 1, amount: 2, category: 3, account: 4, toAccount: 5, memo: 6 });
    expect(missingRequired(map)).toEqual([]);
  });
  it("영문·은행식 헤더, 필수 열 누락 보고", () => {
    const m = autoMap(["거래일자", "적요", "Amount"]);
    expect(m).toEqual({ date: 0, memo: 1, amount: 2 });
    expect(missingRequired(autoMap(["메모"]))).toEqual(["date", "amount"]);
  });
});

describe("normalizeDate", () => {
  it("여러 형식", () => {
    for (const s of ["2026-10-14", "2026/10/14", "2026.10.14", "20261014", "2026-10-14 13:20", "2026-10-14T00:00:00", "2026-1-4"])
      expect(normalizeDate(s)).toBe(s === "2026-1-4" ? "2026-01-04" : "2026-10-14");
  });
  it("존재하지 않는 날짜·이상한 형식은 null", () => {
    for (const s of ["2026-02-30", "2026-13-01", "10/14/2026", "", "어제"]) expect(normalizeDate(s)).toBeNull();
    expect(normalizeDate("2028-02-29")).toBe("2028-02-29");
  });
});

describe("parseTxType", () => {
  it("한국어·영문", () => {
    expect(parseTxType("지출")).toBe("expense");
    expect(parseTxType(" 입금 ")).toBe("income");
    expect(parseTxType("Transfer")).toBe("transfer");
    expect(parseTxType("기타")).toBeNull();
  });
});

describe("validateRows", () => {
  const row = (o: Partial<Record<string, string>> = {}) => [o.date ?? "2026-10-14", o.type ?? "지출", o.amount ?? "12,000", o.cat ?? "식비", o.acc ?? "신한카드", o.to ?? "", o.memo ?? "점심"];
  it("정상 행: 이름 → id 매칭, 쉼표 금액", () => {
    const [r] = validateRows([row()], map, lk);
    expect(r).toMatchObject({ ok: true, line: 2, tx: { date: "2026-10-14", type: "expense", amount: 12000, category_id: "c-food", account_id: "a-card", to_account_id: null, memo: "점심" } });
  });
  it("대소문자·공백 무시, 계좌 비면 기본 계좌", () => {
    const [r] = validateRows([row({ acc: "", cat: " 식비 " })], map, lk);
    expect(r).toMatchObject({ ok: true, tx: { account_id: "a-cash", category_id: "c-food" } });
  });
  it("수입은 수입 카테고리만 매칭", () => {
    expect(validateRows([row({ type: "수입", cat: "급여", amount: "350000" })], map, lk)[0]).toMatchObject({ ok: true, tx: { category_id: "c-pay" } });
    const bad = validateRows([row({ type: "수입", cat: "식비" })], map, lk)[0];
    expect(bad.ok).toBe(false);
  });
  it("오류는 모두 모아 보고 (날짜·금액·카테고리·계좌)", () => {
    const [r] = validateRows([row({ date: "어제", amount: "-100", cat: "식빙", acc: "없는계좌" })], map, lk, 5);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.line).toBe(5);
      expect(r.errors).toHaveLength(4);
      expect(r.errors.join("|")).toContain("음수 금액");
      expect(r.errors.join("|")).toContain("'식빙'");
    }
  });
  it("0원·소수·문자 금액 거부", () => {
    for (const amount of ["0", "12.5", "abc", ""]) expect(validateRows([row({ amount })], map, lk)[0].ok).toBe(false);
  });
  it("이체: 받는 계좌 필수, 같은 계좌 거부, 카테고리 무시", () => {
    expect(validateRows([row({ type: "이체", acc: "현금", to: "신한카드" })], map, lk)[0]).toMatchObject({ ok: true, tx: { type: "transfer", account_id: "a-cash", to_account_id: "a-card", category_id: null } });
    expect(validateRows([row({ type: "이체", to: "" })], map, lk)[0].ok).toBe(false);
    expect(validateRows([row({ type: "이체", acc: "현금", to: "현금" })], map, lk)[0].ok).toBe(false);
  });
  it("구분 열이 없으면 지출로 본다", () => {
    const m = autoMap(["날짜", "금액"]);
    expect(validateRows([["2026-10-14", "5500"]], m, lk)[0]).toMatchObject({ ok: true, tx: { type: "expense", account_id: "a-cash" } });
  });
  it("기본 계좌도 없고 계좌 열도 비면 오류", () => {
    expect(validateRows([row({ acc: "" })], map, { ...lk, defaultAccountId: null })[0].ok).toBe(false);
  });
});

describe("중복 감지", () => {
  const results = validateRows(
    [["2026-10-14", "지출", "12000", "식비", "신한카드", "", "점심"], ["2026-10-14", "지출", "12000", "식비", "신한카드", "", "점심"], ["2026-10-13", "지출", "5500", "", "", "", "커피"], ["bad", "지출", "1", "", "", "", ""]],
    map, lk,
  );
  it("기존 거래와 같으면 existing, 파일 안 두 번째부터 in-file, 오류 행은 제외", () => {
    const existing = new Set([dupKey({ date: "2026-10-13", type: "expense", amount: 5500, memo: "커피" })]);
    const c = markDuplicates(results, existing);
    expect(c.map((x) => x.duplicate)).toEqual(["none", "in-file", "existing"]);
    expect(c).toHaveLength(3);
  });
  it("날짜 범위", () => {
    expect(dateSpan(results)).toEqual({ from: "2026-10-13", to: "2026-10-14" });
    expect(dateSpan([])).toBeNull();
  });
});
