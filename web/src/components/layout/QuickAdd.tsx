"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { QUICK_ADD_FORMS } from "./quick-add-registry";
import { useFocusTrap } from "./useFocusTrap";

export type QuickKind = "tx" | "ev" | "todo";
/** 각 영역이 features/<영역>/quick-add.tsx 에서 내보내는 폼 컴포넌트의 props */
export type QuickAddFormProps = { onClose: () => void };
export type QuickAddForm = ComponentType<QuickAddFormProps>;

const TABS: [QuickKind, string][] = [["tx", "지출"], ["ev", "일정"], ["todo", "할일"]];

type Ctx = { openQuick: (kind: QuickKind) => void; closeQuick: () => void };
const QuickAddContext = createContext<Ctx | null>(null);

/** 어디서든 `const { openQuick } = useQuickAdd(); openQuick('ev')` 로 모달을 연다. */
export function useQuickAdd(): Ctx {
  const ctx = useContext(QuickAddContext);
  if (!ctx) throw new Error("useQuickAdd must be used inside <QuickAddProvider>");
  return ctx;
}

/** 열려 있는 동안만 마운트된다: 포커스 이동·Tab 순환·Esc 닫기·닫힐 때 포커스 복원은 useFocusTrap 이 맡는다. */
function QuickAddDialog({ kind, setKind, onClose }: { kind: QuickKind; setKind: (k: QuickKind) => void; onClose: () => void }) {
  const ref = useFocusTrap<HTMLDivElement>(onClose);
  const Form = QUICK_ADD_FORMS[kind];
  return (
    <div onClick={onClose} className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 p-5">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="빠른 추가"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-[540px] max-w-full flex-col gap-[18px] overflow-y-auto rounded-[28px] border border-surface-4 bg-surface-modal p-[26px] outline-none"
      >
        <div className="flex items-center justify-between">
          <div role="tablist" aria-label="추가할 항목" className="flex rounded-full bg-surface-3 p-[5px] text-sm">
            {TABS.map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={k === kind}
                onClick={() => setKind(k)}
                className={`rounded-full px-[18px] py-2 ${k === kind ? "bg-surface-5 font-semibold text-fg" : "text-fg-subtle"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-surface-3 text-fg-muted"
          >
            ✕
          </button>
        </div>
        <Form onClose={onClose} />
      </div>
    </div>
  );
}

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [kind, setKind] = useState<QuickKind | null>(null);
  const closeQuick = useCallback(() => setKind(null), []);
  const value = useMemo(() => ({ openQuick: setKind, closeQuick }), [closeQuick]);

  return (
    <QuickAddContext.Provider value={value}>
      {children}
      {kind && <QuickAddDialog kind={kind} setKind={setKind} onClose={closeQuick} />}
    </QuickAddContext.Provider>
  );
}
