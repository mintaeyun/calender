import { describe, expect, it } from "vitest";
import { BOM, escapeCell, parseCsv, toCsv } from "./csv";

describe("escapeCell", () => {
  it("쉼표·따옴표·줄바꿈은 감싼다", () => {
    expect(escapeCell("a,b")).toBe('"a,b"');
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCell("두 줄\n메모")).toBe('"두 줄\n메모"');
    expect(escapeCell("plain")).toBe("plain");
  });
  it("null·undefined는 빈 칸, 숫자는 그대로", () => {
    expect(escapeCell(null)).toBe("");
    expect(escapeCell(undefined)).toBe("");
    expect(escapeCell(12000)).toBe("12000");
    expect(escapeCell(-5)).toBe("-5");
  });
  it("수식으로 읽힐 문자열은 무력화 (숫자 문자열은 제외)", () => {
    expect(escapeCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(escapeCell("@cmd")).toBe("'@cmd");
    expect(escapeCell("-5")).toBe("-5");
    expect(escapeCell("+82 10")).toBe("'+82 10");
  });
});

describe("toCsv / parseCsv 왕복", () => {
  const header = ["날짜", "메모", "금액"];
  const rows = [["2026-10-14", '점심, "맛집"', 12000], ["2026-10-13", "두 줄\n메모", 5500], ["2026-10-12", "", 100]];
  it("BOM 포함 CRLF 출력", () => {
    const out = toCsv(header, rows);
    expect(out.startsWith(BOM)).toBe(true);
    expect(out.split("\r\n")).toHaveLength(5); // 헤더 + 3행 + 끝의 빈 문자열
  });
  it("그대로 다시 읽힌다", () => {
    expect(parseCsv(toCsv(header, rows))).toEqual([header, ["2026-10-14", '점심, "맛집"', "12000"], ["2026-10-13", "두 줄\n메모", "5500"], ["2026-10-12", "", "100"]]);
  });
});

describe("parseCsv", () => {
  it("LF·CR·CRLF 줄바꿈과 빈 줄 건너뛰기", () => {
    expect(parseCsv("a,b\n1,2\r\n\r\n3,4\r5,6")).toEqual([["a", "b"], ["1", "2"], ["3", "4"], ["5", "6"]]);
  });
  it("끝에 줄바꿈이 없어도 마지막 행을 읽는다", () => expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]));
  it("빈 칸 유지", () => expect(parseCsv("a,,c\n,,")).toEqual([["a", "", "c"], ["", "", ""]]));
  it("닫히지 않은 따옴표는 오류", () => expect(() => parseCsv('a,"b\nc')).toThrow("따옴표"));
  it("빈 입력", () => expect(parseCsv("")).toEqual([]));
});
