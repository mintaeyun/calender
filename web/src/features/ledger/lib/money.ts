// 금액 입력 파서·표시. 금액은 양의 정수 원 단위이며 부호는 거래 구분(type)이 정한다.

export type TxType = "income" | "expense" | "transfer";

export type ParseResult = { ok: true; value: number } | { ok: false; error: string };

/** "12,000원", " 5 500 " 같은 입력을 정수 원으로 바꾼다. 0·음수·소수·숫자 외 문자는 거부. */
export function parseAmount(input: string): ParseResult {
  const s = input.replace(/[,\s]/g, "").replace(/원$/, "");
  if (s === "") return { ok: false, error: "금액을 입력하세요" };
  if (s.startsWith("-")) return { ok: false, error: "음수는 입력할 수 없어요" };
  if (/^\d*\.\d+$/.test(s)) return { ok: false, error: "소수점은 입력할 수 없어요" };
  if (!/^\d+$/.test(s)) return { ok: false, error: "숫자만 입력하세요" };
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return { ok: false, error: "금액이 너무 커요" };
  if (n <= 0) return { ok: false, error: "0원보다 커야 해요" };
  return { ok: true, value: n };
}

export const formatWon = (n: number) => n.toLocaleString("ko-KR");

const SIGN: Record<TxType, string> = { expense: "−", income: "+", transfer: "⇄" };

/** 목업 표기: 지출 −12,000 / 수입 +350,000 / 이체 ⇄100,000 */
export const formatSigned = (amount: number, type: TxType) => `${SIGN[type]}${formatWon(amount)}`;

/** 계좌 잔액 = 초기잔액 + 수입 − 지출 − 출금이체 + 입금이체. 저장하지 않고 계산에만 쓴다. */
export function balanceOf(
  accountId: string,
  initial: number,
  txs: { type: TxType; amount: number; account_id: string; to_account_id: string | null }[],
): number {
  let b = initial;
  for (const t of txs) {
    if (t.type === "income" && t.account_id === accountId) b += t.amount;
    else if (t.type === "expense" && t.account_id === accountId) b -= t.amount;
    else if (t.type === "transfer") {
      if (t.account_id === accountId) b -= t.amount;
      if (t.to_account_id === accountId) b += t.amount;
    }
  }
  return b;
}

/** 이체 검증: 도착 계좌 필수, 같은 계좌 간 이체 거부. 오류 메시지 또는 null. */
export function validateTransfer(from: string | null, to: string | null): string | null {
  if (!to) return "받는 계좌를 선택하세요";
  if (from === to) return "같은 계좌로는 이체할 수 없어요";
  return null;
}
