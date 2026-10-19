"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useCategories } from "@/features/ledger/hooks";
import { formatSigned } from "@/features/ledger/lib/money";
import { dueLabel, todayIn } from "@/features/todo/lib/due";
import { useTimezone } from "@/lib/profile";
import { dateKey, formatDateTimeKo } from "@/lib/time";
import { searchAll } from "../api";
import { addRecent, isSearchable, normalizeQuery, parseRecent, removeRecent, totalCount, visibleGroups, type SearchTab } from "../lib/search";

const RECENT_KEY = "search:recent";
const readRecent = () => { try { return parseRecent(localStorage.getItem(RECENT_KEY)); } catch { return []; } };
const writeRecent = (l: string[]) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(l)); } catch { /* 저장 불가 환경 */ } };

const GROUP_LABEL = { events: "일정", todos: "할일", txs: "거래" } as const;
const card = "flex flex-col gap-0.5 rounded-[18px] bg-surface px-5 py-4 transition-colors hover:bg-surface-2";

/** 통합 검색(SRCH-1): 일정·할일·거래를 병렬 검색해 유형별로 보여준다. `/search?q=` */
export function SearchPage() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const tz = useTimezone();
  const urlQ = params.get("q") ?? "";
  const [input, setInput] = useState(urlQ);
  const [tab, setTab] = useState<SearchTab>("all");
  const [recent, setRecent] = useState<string[]>([]);
  const cats = useCategories(undefined, true).data ?? [];
  const today = todayIn(tz);

  useEffect(() => setRecent(readRecent()), []);
  // 입력 → URL(q) 디바운스 300ms
  useEffect(() => {
    const t = setTimeout(() => {
      const n = normalizeQuery(input);
      if (n !== urlQ) router.replace(n ? `${path}?q=${encodeURIComponent(n)}` : path);
    }, 300);
    return () => clearTimeout(t);
  }, [input, urlQ, path, router]);

  const q = normalizeQuery(urlQ);
  const search = useQuery({ queryKey: ["search", q], queryFn: () => searchAll(q), enabled: isSearchable(q), staleTime: 30_000 });
  // 결과가 나온 검색어만 최근 검색에 기록
  useEffect(() => {
    if (search.isSuccess && isSearchable(q)) setRecent((r) => { const next = addRecent(r, q); writeRecent(next); return next; });
  }, [search.isSuccess, q]);

  const res = search.data?.results;
  const errors = search.data?.errors ?? {};
  const counts = useMemo(() => ({ events: res?.events.length ?? 0, todos: res?.todos.length ?? 0, txs: res?.txs.length ?? 0 }), [res]);
  const catName = (id: string | null) => cats.find((c) => c.id === id)?.name;
  const tabs: [SearchTab, string][] = [["all", `전체 ${totalCount(counts)}`], ["events", `일정 ${counts.events}`], ["todos", `할일 ${counts.todos}`], ["txs", `거래 ${counts.txs}`]];

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-[18px]">
      <form role="search" onSubmit={(e) => e.preventDefault()} className="flex items-center gap-3.5 rounded-full border border-[#3a3a40] bg-surface px-6 py-4 text-lg">
        <span aria-hidden className="h-4 w-4 shrink-0 rounded-full border-2 border-fg-muted" />
        <input
          autoFocus value={input} onChange={(e) => setInput(e.target.value)} aria-label="검색어" placeholder="일정, 할일, 거래를 검색하세요"
          className="min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-[#55555c]"
        />
        {search.isSuccess && <span className="whitespace-nowrap text-[13px] text-fg-subtle">{totalCount(counts)}개 결과</span>}
      </form>

      {!isSearchable(q) && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-fg-subtle">최근 검색</span>
          {recent.length === 0 && <span className="text-sm text-[#6c6c73]">최근 검색어가 없어요</span>}
          <div className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <span key={r} className="flex items-center rounded-full bg-surface-2 text-sm">
                <button onClick={() => setInput(r)} className="px-3.5 py-2">{r}</button>
                <button aria-label={`${r} 삭제`} onClick={() => { const n = removeRecent(recent, r); setRecent(n); writeRecent(n); }} className="py-2 pr-3 text-xs text-fg-subtle">✕</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {isSearchable(q) && (
        <>
          <div role="tablist" className="flex flex-wrap gap-2">
            {tabs.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full px-4 py-2 text-sm ${tab === k ? "bg-white font-semibold text-black" : "bg-surface-2 text-fg-muted"}`}>{label}</button>
            ))}
          </div>
          {search.isLoading && <div className="p-10 text-center text-[#6c6c73]">검색 중…</div>}
          {search.isError && <div className="text-sm text-danger" role="alert">검색하지 못했어요. {(search.error as Error).message}</div>}
          {search.isSuccess && totalCount(counts) === 0 && Object.keys(errors).length === 0 && (
            <div className="p-10 text-center text-[15px] text-[#6c6c73]">&lsquo;{q}&rsquo;에 대한 결과가 없어요</div>
          )}

          <div className="flex flex-col gap-2.5">
            {visibleGroups(tab).map((g) => {
              const count = counts[g];
              if (!count && !errors[g]) return null;
              return (
                <section key={g} className="flex flex-col gap-2.5" aria-label={GROUP_LABEL[g]}>
                  <h2 className="mt-2 text-[13px] font-normal text-fg-subtle">{GROUP_LABEL[g]}</h2>
                  {errors[g] && <span className="text-sm text-danger">{GROUP_LABEL[g]} 검색에 실패했어요</span>}
                  {g === "events" && res?.events.map((e) => {
                    const day = dateKey(e.start_at, tz);
                    return (
                      <Link key={e.id} href={`/calendar?view=day&date=${day}`} className={`${card} no-underline hover:no-underline`}>
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-[15px] font-semibold text-fg">{e.title}</span>
                          {day === today && <span className="rounded-full bg-lime px-2.5 py-[3px] text-xs font-bold text-[#0b0b0c]">오늘</span>}
                        </span>
                        <span className="text-[13px] text-fg-subtle">{e.all_day ? `${day} 종일` : formatDateTimeKo(e.start_at, tz)}{e.location ? ` · ${e.location}` : ""}{e.rrule ? " · 반복" : ""}</span>
                      </Link>
                    );
                  })}
                  {g === "todos" && res?.todos.map((t) => (
                    <Link key={t.id} href="/todos" className={`${card} no-underline hover:no-underline`}>
                      <span className={`text-[15px] font-semibold text-fg ${t.status === "done" ? "line-through opacity-60" : ""}`}>{t.title}</span>
                      <span className="text-[13px] text-fg-subtle">{t.status === "done" ? "완료" : t.due_date ? `마감 ${dueLabel(t.due_date, today)}` : "마감 없음"}</span>
                    </Link>
                  ))}
                  {g === "txs" && res?.txs.map((t) => (
                    <Link key={t.id} href={`/ledger?from=${t.date}&to=${t.date}`} className={`${card} no-underline hover:no-underline`}>
                      <span className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-[15px] font-semibold text-fg">{t.memo || (t.type === "transfer" ? "이체" : "메모 없음")}</span>
                        <span className={`whitespace-nowrap font-semibold ${t.type === "income" ? "text-lime" : "text-fg"}`}>{formatSigned(t.amount, t.type)}</span>
                      </span>
                      <span className="text-[13px] text-fg-subtle">{t.date}{t.type === "transfer" ? "" : catName(t.category_id) ? ` · ${catName(t.category_id)}` : ""}</span>
                    </Link>
                  ))}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
