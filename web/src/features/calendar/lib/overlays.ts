// 캘린더 오버레이(CAL-8): 고정지출 결제일 계산.

export type PaymentRule = { cycle: "monthly" | "yearly"; pay_day: number; pay_month: number | null };

/** [startKey, endKey] (포함) 안의 결제 예정일. 말일보다 큰 결제일은 말일로 당긴다. */
export function paymentDatesInRange(p: PaymentRule, startKey: string, endKey: string): string[] {
  const out: string[] = [];
  let [y, m] = startKey.split("-").map(Number);
  const [ey, em] = endKey.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    if (p.cycle === "monthly" || p.pay_month === m) {
      const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const key = `${y}-${String(m).padStart(2, "0")}-${String(Math.min(p.pay_day, dim)).padStart(2, "0")}`;
      if (key >= startKey && key <= endKey) out.push(key);
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
