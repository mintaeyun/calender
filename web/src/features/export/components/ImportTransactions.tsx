"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatSigned } from "@/features/ledger/lib/money";
import { existingTransactionKeys, importTransactions, loadLookups } from "../api";
import { parseCsv } from "../lib/csv";
import { decodeCsvBytes } from "../lib/decode";
import { autoMap, dateSpan, FIELD_LABEL, FIELDS, markDuplicates, MAX_IMPORT_ROWS, missingRequired, REQUIRED, validateRows, type Field, type Mapping } from "../lib/importTx";

const sel = "rounded-xl bg-surface-3 px-3 py-2 text-sm outline-none";

/** 거래 CSV 가져오기: 파일 선택 → 열 매핑 미리보기 → 검증(오류·중복 보고) → 확정 시 한 번의 INSERT(전부 성공 또는 전부 취소). 파일은 서버에 저장하지 않는다. */
export function ImportTransactions() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<string[][] | null>(null);
  const [map, setMap] = useState<Mapping>({});
  const [defaultAccount, setDefaultAccount] = useState("");
  const [includeDup, setIncludeDup] = useState(false);
  const [skipErrors, setSkipErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const lookups = useQuery({ queryKey: ["export", "lookups"], queryFn: loadLookups, staleTime: 60_000 });
  const header = table?.[0] ?? [];
  const records = useMemo(() => table?.slice(1) ?? [], [table]);

  const results = useMemo(() => {
    if (!lookups.data || missingRequired(map).length) return [];
    return validateRows(records, map, { ...lookups.data, defaultAccountId: defaultAccount || lookups.data.accounts[0]?.id || null });
  }, [records, map, lookups.data, defaultAccount]);
  const span = useMemo(() => dateSpan(results), [results]);
  const existing = useQuery({ queryKey: ["export", "existing", span?.from, span?.to], queryFn: () => existingTransactionKeys(span!), enabled: !!span });
  const checked = useMemo(() => markDuplicates(results, existing.data ?? new Set()), [results, existing.data]);

  const errors = results.filter((r) => !r.ok);
  const dups = checked.filter((c) => c.duplicate !== "none");
  const toImport = checked.filter((c) => includeDup || c.duplicate === "none");
  const tooMany = records.length > MAX_IMPORT_ROWS;
  const canImport = toImport.length > 0 && !tooMany && (errors.length === 0 || skipErrors) && !busy && !existing.isLoading;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setMsg(null); setTable(null);
    try {
      const rows = parseCsv(decodeCsvBytes(await file.arrayBuffer()));
      if (rows.length < 2) { setMsg({ ok: false, text: "데이터 행이 없어요 (첫 줄은 열 이름이어야 해요)" }); return; }
      setFileName(file.name); setTable(rows); setMap(autoMap(rows[0])); setIncludeDup(false); setSkipErrors(false);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };

  const run = async () => {
    setBusy(true); setMsg(null);
    try {
      const n = await importTransactions(toImport.map((c) => c.tx));
      await qc.invalidateQueries({ queryKey: ["ledger"] });
      setMsg({ ok: true, text: `${n}건을 가져왔어요` });
      setTable(null); setFileName("");
      if (input.current) input.current.value = "";
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-3">
      <span className="text-base font-semibold">거래 가져오기 (CSV)</span>
      <span className="text-xs text-fg-subtle">첫 줄은 열 이름이어야 해요. 금액은 양의 정수, 지출/수입은 &lsquo;구분&rsquo; 열로 표시해요. 파일은 이 브라우저에서만 읽고 서버에 저장하지 않아요. 내보낸 거래 파일을 그대로 다시 가져올 수 있어요. (한 번에 최대 {MAX_IMPORT_ROWS}건)</span>
      <div className="flex items-center gap-3">
        <button onClick={() => input.current?.click()} className="rounded-full border border-[color:var(--border-strong,#3a3a40)] px-4 py-2 text-sm">CSV 파일 선택</button>
        <span className="truncate text-sm text-fg-subtle">{fileName}</span>
        <input ref={input} type="file" accept=".csv,text/csv" className="hidden" aria-label="CSV 파일" onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>

      {table && (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {FIELDS.map((f: Field) => (
              <label key={f} className="flex items-center justify-between gap-2 text-sm">
                <span>{FIELD_LABEL[f]}{REQUIRED.includes(f) && <span className="text-danger"> *</span>}</span>
                <select value={map[f] ?? ""} onChange={(e) => setMap({ ...map, [f]: e.target.value === "" ? undefined : Number(e.target.value) })} className={sel}>
                  <option value="">(사용 안 함)</option>
                  {header.map((h, i) => <option key={i} value={i}>{h || `열 ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
          <label className="flex items-center justify-between gap-2 text-sm">
            <span>계좌 열이 없거나 비어 있을 때 쓸 계좌</span>
            <select value={defaultAccount} onChange={(e) => setDefaultAccount(e.target.value)} className={sel}>
              {(lookups.data?.accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>

          {missingRequired(map).length > 0 ? (
            <span className="text-sm text-danger" role="alert">필수 열을 지정해 주세요: {missingRequired(map).map((f) => FIELD_LABEL[f]).join(", ")}</span>
          ) : (
            <div className="flex flex-col gap-2 rounded-2xl bg-surface-3 p-4 text-sm" aria-live="polite">
              <span>전체 {records.length}행 · 정상 <b className="text-lime">{checked.length}</b> · 오류 <b className={errors.length ? "text-danger" : ""}>{errors.length}</b> · 중복 의심 <b>{dups.length}</b></span>
              {tooMany && <span className="text-danger">{MAX_IMPORT_ROWS}행을 넘어요. 파일을 나눠서 가져와 주세요.</span>}
              {errors.length > 0 && (
                <ul className="max-h-40 overflow-y-auto text-xs text-danger">
                  {errors.slice(0, 50).map((r) => !r.ok && <li key={r.line}>{r.line}번째 줄: {r.errors.join(" / ")}</li>)}
                  {errors.length > 50 && <li>… 외 {errors.length - 50}건</li>}
                </ul>
              )}
              {dups.length > 0 && (
                <label className="flex items-center gap-2 text-xs text-fg-muted">
                  <input type="checkbox" checked={includeDup} onChange={(e) => setIncludeDup(e.target.checked)} />
                  같은 날짜·구분·금액·메모의 중복 {dups.length}건도 가져오기 (기존 거래와 같거나 파일 안에서 반복된 행)
                </label>
              )}
              {errors.length > 0 && (
                <label className="flex items-center gap-2 text-xs text-fg-muted">
                  <input type="checkbox" checked={skipErrors} onChange={(e) => setSkipErrors(e.target.checked)} />
                  오류 행은 건너뛰고 나머지만 가져오기
                </label>
              )}
              {checked.length > 0 && (
                <ul className="text-xs text-fg-subtle">
                  {checked.slice(0, 5).map((c) => <li key={c.line}>{c.tx.date} · {formatSigned(c.tx.amount, c.tx.type)} · {c.tx.memo ?? ""}{c.duplicate !== "none" ? " (중복 의심)" : ""}</li>)}
                  {checked.length > 5 && <li>… 미리보기는 5건까지</li>}
                </ul>
              )}
            </div>
          )}

          <button onClick={() => void run()} disabled={!canImport} className="w-fit rounded-full bg-lime px-5 py-2.5 text-sm font-bold text-[color:var(--on-accent,#0b0b0c)] disabled:opacity-40">
            {busy ? "가져오는 중…" : `${toImport.length}건 가져오기`}
          </button>
        </>
      )}
      {msg && <span className={`text-sm ${msg.ok ? "text-lime" : "text-danger"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</span>}
    </div>
  );
}
