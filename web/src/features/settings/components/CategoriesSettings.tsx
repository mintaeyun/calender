"use client";

import { CategoryManager } from "@/features/ledger/components/CategoryManager";
import { ProjectTagPanel } from "@/features/todo/components/ProjectTagPanel";
import { useCalendars } from "@/features/calendar/hooks";

const card = "flex flex-col gap-4 rounded-[22px] bg-surface p-6";

/** SET-2: 가계부 카테고리 · 일정 분류(캘린더) · 할일 프로젝트/태그를 한 화면에서 본다. 편집은 각 영역의 컴포넌트가 한다. */
export function CategoriesSettings() {
  const calendars = useCalendars();
  return (
    <div className="flex flex-col gap-3.5">
      <section className={card} aria-labelledby="set-cat-ledger">
        <h2 id="set-cat-ledger" className="text-lg font-semibold">가계부 카테고리</h2>
        <CategoryManager />
        <span className="text-xs text-fg-subtle">거래가 있는 카테고리는 삭제 대신 보관됩니다</span>
      </section>
      <section className={card} aria-labelledby="set-cat-todo">
        <h2 id="set-cat-todo" className="text-lg font-semibold">할일 프로젝트 · 태그</h2>
        <ProjectTagPanel />
      </section>
      <section className={card} aria-labelledby="set-cat-cal">
        <h2 id="set-cat-cal" className="text-lg font-semibold">일정 분류</h2>
        {calendars.isLoading ? (
          <span className="text-sm text-fg-subtle">불러오는 중…</span>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(calendars.data ?? []).map((c) => (
              <span key={c.id} className="flex items-center gap-[7px] rounded-full bg-surface-3 px-3.5 py-[7px] text-sm">
                <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />{c.name}{c.source === "google" && <span className="text-xs text-fg-subtle">G</span>}
              </span>
            ))}
            {!calendars.data?.length && <span className="text-sm text-fg-subtle">일정 분류가 없어요</span>}
          </div>
        )}
        {/* TODO(session-02): 캘린더 추가·수정·삭제 api(createCalendar 등)가 생기면 편집 UI 연결 — REQUESTS.md 참고 */}
        <span className="text-xs text-fg-subtle">일정 분류 편집은 준비 중이에요</span>
      </section>
    </div>
  );
}
