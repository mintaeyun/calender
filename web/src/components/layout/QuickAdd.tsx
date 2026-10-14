"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { QUICK_ADD_FORMS } from "./quick-add-registry";

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

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [kind, setKind] = useState<QuickKind | null>(null);
  const closeQuick = useCallback(() => setKind(null), []);
  const value = useMemo(() => ({ openQuick: setKind, closeQuick }), [closeQuick]);
  const Form = kind ? QUICK_ADD_FORMS[kind] : null;

  return (
    <QuickAddContext.Provider value={value}>
      {children}
      {kind && Form && (
        <div
          onClick={closeQuick}
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 p-5"
          role="dialog"
          aria-modal="true"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92vh] w-[540px] max-w-full flex-col gap-[18px] overflow-y-auto rounded-[28px] border border-[#2a2a2e] bg-[#161619] p-[26px]"
          >
            <div className="flex items-center justify-between">
              <div className="flex rounded-full bg-surface-3 p-[5px] text-sm">
                {TABS.map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={`rounded-full px-[18px] py-2 ${k === kind ? "bg-[#3a3a40] font-semibold text-white" : "text-fg-subtle"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={closeQuick}
                aria-label="닫기"
                className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-surface-3 text-fg-muted"
              >
                ✕
              </button>
            </div>
            <Form onClose={closeQuick} />
          </div>
        </div>
      )}
    </QuickAddContext.Provider>
  );
}
