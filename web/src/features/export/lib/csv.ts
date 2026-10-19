// CSV 읽기/쓰기 (RFC 4180). 브라우저에서만 처리하고 서버에 저장하지 않는다.

export const BOM = "﻿"; // Excel 이 UTF-8 한글을 깨뜨리지 않도록 파일 맨 앞에 붙인다

/** 한 칸을 CSV 규칙에 맞게 감싼다. 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싸고 " 는 "" 로. */
export function escapeCell(v: string | number | boolean | null | undefined): string {
  let s = v === null || v === undefined ? "" : String(v);
  // 스프레드시트 수식 주입 방지: = + - @ 로 시작하는 문자열 칸은 앞에 ' 를 붙인다. 단, 숫자(음수 포함)는 그대로.
  if (typeof v === "string" && /^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: (string | number | boolean | null | undefined)[][], withBom = true): string {
  const lines = [header, ...rows].map((r) => r.map(escapeCell).join(","));
  return (withBom ? BOM : "") + lines.join("\r\n") + "\r\n";
}

/**
 * CSV 텍스트 → 행 배열. 따옴표 안의 쉼표/줄바꿈/"" 처리, CRLF·LF·CR 모두 지원, 앞의 BOM 제거.
 * 완전히 빈 줄은 건너뛴다. 따옴표가 닫히지 않으면 오류.
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let sawAny = false;

  const endCell = () => { row.push(cell); cell = ""; };
  const endRow = () => {
    endCell();
    if (sawAny && !(row.length === 1 && row[0] === "")) rows.push(row);
    row = []; sawAny = false;
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += c;
      continue;
    }
    if (c === '"' && cell === "") { inQuotes = true; sawAny = true; }
    else if (c === ",") { endCell(); sawAny = true; }
    else if (c === "\r") { if (src[i + 1] === "\n") i++; endRow(); }
    else if (c === "\n") endRow();
    else { cell += c; sawAny = true; }
  }
  if (inQuotes) throw new Error("CSV 형식이 올바르지 않아요 (닫히지 않은 따옴표)");
  if (sawAny || cell !== "" || row.length) endRow();
  return rows;
}
