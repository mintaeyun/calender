// 거래 CSV 가져오기: 열 매핑 → 행 검증 → 중복 감지. 순수 로직(저장은 api.ts 가 한 번의 insert 로 한다).
import { parseAmount, validateTransfer, type TxType } from "@/features/ledger/lib/money";

export type Field = "date" | "type" | "amount" | "category" | "account" | "toAccount" | "memo";
export const FIELDS: Field[] = ["date", "type", "amount", "category", "account", "toAccount", "memo"];
export const FIELD_LABEL: Record<Field, string> = { date: "날짜", type: "구분", amount: "금액", category: "카테고리", account: "계좌", toAccount: "받는 계좌", memo: "메모" };
export const REQUIRED: Field[] = ["date", "amount"];
export const MAX_IMPORT_ROWS = 1000;

const ALIASES: Record<Field, string[]> = {
  date: ["날짜", "일자", "거래일", "거래일자", "date"],
  type: ["구분", "유형", "종류", "type"],
  amount: ["금액", "거래금액", "amount"],
  category: ["카테고리", "분류", "category"],
  account: ["계좌", "결제수단", "자산", "account"],
  toAccount: ["받는계좌", "입금계좌", "toaccount", "to_account"],
  memo: ["메모", "내용", "적요", "비고", "memo"],
};

const norm = (s: string) => s.replace(/[\s_]/g, "").toLowerCase();

export type Mapping = Partial<Record<Field, number>>;

/** 헤더 이름으로 열을 자동 매핑한다. 한 열은 한 필드에만 쓴다. */
export function autoMap(header: string[]): Mapping {
  const map: Mapping = {};
  const used = new Set<number>();
  for (const f of FIELDS) {
    const i = header.findIndex((h, idx) => !used.has(idx) && ALIASES[f].some((a) => norm(a) === norm(h)));
    if (i >= 0) { map[f] = i; used.add(i); }
  }
  return map;
}

export const missingRequired = (m: Mapping): Field[] => REQUIRED.filter((f) => m[f] === undefined);

/** 'YYYY-MM-DD' 로 정규화. 지원: 2026-10-14, 2026/10/14, 2026.10.14, 20261014, 뒤에 시간이 붙은 형태. 존재하지 않는 날짜는 null. */
export function normalizeDate(raw: string): string | null {
  const s = raw.trim().replace(/[ T].*$/, "");
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\.?$/.exec(s) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseTxType(raw: string): TxType | null {
  const s = norm(raw);
  if (["지출", "출금", "expense", "exp"].includes(s)) return "expense";
  if (["수입", "입금", "income", "inc"].includes(s)) return "income";
  if (["이체", "transfer", "tr"].includes(s)) return "transfer";
  return null;
}

export type Lookups = {
  categories: { id: string; name: string; kind: "income" | "expense" }[];
  accounts: { id: string; name: string }[];
  defaultAccountId: string | null;
};

export type ImportTx = { date: string; type: TxType; amount: number; category_id: string | null; account_id: string; to_account_id: string | null; memo: string | null };
export type RowResult =
  | { line: number; ok: true; tx: ImportTx; key: string }
  | { line: number; ok: false; errors: string[] };

export const dupKey = (t: { date: string; amount: number; type: string; memo: string | null }) => `${t.date}|${t.type}|${t.amount}|${(t.memo ?? "").trim()}`;

/**
 * 데이터 행을 검증한다. records 는 헤더를 뺀 행들, line 은 원본 파일의 줄 번호(헤더가 1줄이면 첫 데이터 행은 2).
 * 오류가 있는 행은 모든 오류를 모아 돌려준다. 금액은 양의 정수만(음수·소수 거부), 이름은 대소문자·공백 무시로 매칭한다.
 */
export function validateRows(records: string[][], map: Mapping, lk: Lookups, firstLine = 2): RowResult[] {
  const cell = (r: string[], f: Field) => (map[f] === undefined ? "" : (r[map[f]!] ?? "").trim());
  const findCat = (name: string, kind: "income" | "expense") => lk.categories.find((c) => c.kind === kind && norm(c.name) === norm(name));
  const findAcc = (name: string) => lk.accounts.find((a) => norm(a.name) === norm(name));

  return records.map((r, i): RowResult => {
    const line = firstLine + i;
    const errors: string[] = [];

    const date = normalizeDate(cell(r, "date"));
    if (!date) errors.push(`날짜 형식을 읽을 수 없어요 ('${cell(r, "date")}')`);

    let type: TxType = "expense";
    if (map.type !== undefined && cell(r, "type") !== "") {
      const t = parseTxType(cell(r, "type"));
      if (!t) errors.push(`구분은 지출/수입/이체 중 하나여야 해요 ('${cell(r, "type")}')`); else type = t;
    }

    const a = parseAmount(cell(r, "amount"));
    let amount = 0;
    if (!a.ok) errors.push(a.error.includes("음수") ? "음수 금액은 가져올 수 없어요 (구분 열로 지출/수입을 표시하세요)" : `금액: ${a.error}`); else amount = a.value;

    let account_id = "";
    const accName = cell(r, "account");
    if (accName) {
      const acc = findAcc(accName);
      if (!acc) errors.push(`계좌 '${accName}'을(를) 찾을 수 없어요`); else account_id = acc.id;
    } else if (lk.defaultAccountId) account_id = lk.defaultAccountId;
    else errors.push("계좌가 비어 있어요");

    let category_id: string | null = null;
    let to_account_id: string | null = null;
    if (type === "transfer") {
      const toName = cell(r, "toAccount");
      const to = toName ? findAcc(toName) : undefined;
      if (!toName) errors.push("이체는 받는 계좌가 필요해요");
      else if (!to) errors.push(`받는 계좌 '${toName}'을(를) 찾을 수 없어요`);
      else {
        to_account_id = to.id;
        const e = account_id ? validateTransfer(account_id, to.id) : null;
        if (e) errors.push(e);
      }
    } else {
      const catName = cell(r, "category");
      if (catName) {
        const c = findCat(catName, type);
        if (!c) errors.push(`${type === "income" ? "수입" : "지출"} 카테고리 '${catName}'을(를) 찾을 수 없어요`); else category_id = c.id;
      }
    }

    const memoRaw = cell(r, "memo");
    if (memoRaw.length > 200) errors.push("메모는 200자 이하여야 해요");

    if (errors.length || !date) return { line, ok: false, errors };
    const tx: ImportTx = { date, type, amount, category_id, account_id, to_account_id, memo: memoRaw || null };
    return { line, ok: true, tx, key: dupKey(tx) };
  });
}

export type Checked = { line: number; tx: ImportTx; duplicate: "none" | "existing" | "in-file" };

/** 유효한 행에 중복 표시를 붙인다. 기존 거래와 같으면 'existing', 파일 안에서 먼저 나온 행과 같으면 'in-file'(두 번째부터). */
export function markDuplicates(results: RowResult[], existingKeys: Set<string>): Checked[] {
  const seen = new Set<string>();
  const out: Checked[] = [];
  for (const r of results) {
    if (!r.ok) continue;
    const duplicate = existingKeys.has(r.key) ? "existing" : seen.has(r.key) ? "in-file" : "none";
    seen.add(r.key);
    out.push({ line: r.line, tx: r.tx, duplicate });
  }
  return out;
}

/** 파일 안의 날짜 범위(기존 거래 조회용). 유효한 행이 없으면 null. */
export function dateSpan(results: RowResult[]): { from: string; to: string } | null {
  const dates = results.flatMap((r) => (r.ok ? [r.tx.date] : [])).sort();
  return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
}
