"use client";

import { useState } from "react";
import { useTimezone } from "@/lib/profile";
import { todayKey } from "@/lib/time";
import { buildExport, KIND_LABEL, type ExportKind } from "../api";
import { downloadCsv, downloadXlsx } from "../download";
import { todayStamp } from "../lib/rows";
import { ImportTransactions } from "./ImportTransactions";

const KINDS: ExportKind[] = ["events", "todos", "transactions"];

/** 설정 → 백업 · 내보내기 탭(SET-3). 08(cal3)이 설정 탭에 배치한다. 모든 파일은 브라우저에서 만들고 서버에 저장하지 않는다. */
export function BackupSettings() {
  const tz = useTimezone();
  const today = todayKey(tz);
  const [kind, setKind] = useState<ExportKind>("transactions");
  const [format, setFormat] = useState<"csv" | "xlsx">("csv");
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const usesRange = kind !== "todos";
  const run = async () => {
    if (usesRange && from > to) { setMsg({ ok: false, text: "시작일이 종료일보다 늦어요" }); return; }
    setBusy(true); setMsg(null);
    try {
      const table = await buildExport(kind, { from, to }, tz);
      const name = `${KIND_LABEL[kind]}_${todayStamp(tz)}`;
      if (format === "csv") downloadCsv(`${name}.csv`, table); else await downloadXlsx(`${name}.xlsx`, KIND_LABEL[kind], table);
      setMsg({ ok: true, text: `${table.rows.length}건을 내려받았어요` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally { setBusy(false); }
  };

  const chip = (on: boolean) => `rounded-full px-4 py-2 text-sm ${on ? "bg-white font-semibold text-black" : "bg-surface-3 text-fg-muted"}`;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3" aria-label="내보내기">
        <span className="text-lg font-semibold">백업 · 내보내기</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="내보낼 데이터">
          {KINDS.map((k) => <button key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={chip(kind === k)}>{KIND_LABEL[k]}</button>)}
        </div>
        {usesRange ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input type="date" aria-label="시작일" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl bg-surface-3 px-3 py-2 outline-none" />
            <span>~</span>
            <input type="date" aria-label="종료일" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl bg-surface-3 px-3 py-2 outline-none" />
          </div>
        ) : <span className="text-xs text-fg-subtle">할일은 삭제하지 않은 전체를 내보내요.</span>}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-2" role="radiogroup" aria-label="파일 형식">
            {(["csv", "xlsx"] as const).map((f) => <button key={f} role="radio" aria-checked={format === f} onClick={() => setFormat(f)} className={chip(format === f)}>{f === "csv" ? "CSV" : "Excel(xlsx)"}</button>)}
          </div>
          <button onClick={() => void run()} disabled={busy} className="rounded-full bg-lime px-5 py-2.5 text-sm font-bold text-black disabled:opacity-60">{busy ? "만드는 중…" : "내려받기"}</button>
        </div>
        <span className="text-xs text-fg-subtle">파일은 이 브라우저에서 만들어지며 서버에 저장되지 않아요. CSV는 Excel에서 한글이 깨지지 않도록 UTF-8(BOM)으로 저장돼요. 반복 일정은 원본 1줄과 반복 규칙(RRULE)으로 내보내요.</span>
        {msg && <span className={`text-sm ${msg.ok ? "text-lime" : "text-danger"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</span>}
      </section>
      <section aria-label="가져오기"><ImportTransactions /></section>
    </div>
  );
}
