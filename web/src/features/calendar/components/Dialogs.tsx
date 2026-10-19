"use client";

import type { ReactNode } from "react";
import { useFocusTrap } from "@/components/layout/useFocusTrap";
import type { Scope } from "../lib/scope";

export function Modal({ children, onClose, width = 540, z = 20 }: { children: ReactNode; onClose: () => void; width?: number; z?: number }) {
  const ref = useFocusTrap<HTMLDivElement>(onClose);
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 flex items-center justify-center bg-black/70 p-5"
      style={{ zIndex: z }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] max-w-full flex-col gap-[18px] overflow-y-auto rounded-[28px] border border-surface-4 bg-surface-modal p-[26px]"
        style={{ width }}
      >
        {children}
      </div>
    </div>
  );
}

export const btnGhost = "rounded-full border border-border-strong px-5 py-[11px] text-sm text-fg disabled:opacity-50";
export const btnPrimary = "rounded-full bg-fg px-6 py-[11px] text-sm font-bold text-bg disabled:opacity-50";
export const btnDanger = "rounded-full bg-danger px-6 py-[11px] text-sm font-bold text-on-accent disabled:opacity-50";

/** 반복 일정 수정·삭제 범위 선택 (이번만 / 이후 전체 / 전체 — 이 3가지로 제한) */
export function ScopeDialog({
  kind, onPick, onCancel, busy,
}: { kind: "save" | "delete"; onPick: (s: Scope) => void; onCancel: () => void; busy?: boolean }) {
  const verb = kind === "save" ? "수정" : "삭제";
  const items: [Scope, string, string][] = [
    ["this", "이번 일정만", `선택한 날짜의 일정만 ${verb}합니다`],
    ["following", "이후 모든 일정", `선택한 날짜와 그 이후 반복 일정을 ${verb}합니다`],
    ["all", "모든 일정", `반복 일정 전체를 ${verb}합니다`],
  ];
  return (
    <Modal onClose={onCancel} width={420} z={30}>
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[22px]">반복 일정 {verb}</h2>
        <span className="text-sm text-fg-subtle">어느 범위에 적용할까요?</span>
      </div>
      <div className="flex flex-col gap-2">
        {items.map(([scope, label, hint]) => (
          <button
            key={scope}
            disabled={busy}
            onClick={() => onPick(scope)}
            className="flex flex-col gap-0.5 rounded-2xl bg-surface-3 px-4 py-3.5 text-left hover:bg-surface-4 disabled:opacity-50"
          >
            <span className="text-[15px] font-semibold">{label}</span>
            <span className="text-xs text-fg-subtle">{hint}</span>
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <button onClick={onCancel} className={btnGhost}>취소</button>
      </div>
    </Modal>
  );
}

/** 단일 일정 삭제 확인 (CAL-3). 소프트 삭제이므로 30일 보관 안내. */
export function ConfirmDelete({ title, onConfirm, onCancel, busy }: { title: string; onConfirm: () => void; onCancel: () => void; busy?: boolean }) {
  return (
    <Modal onClose={onCancel} width={400} z={30}>
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-[22px]">일정을 삭제할까요?</h2>
        <p className="text-sm text-fg-muted">&ldquo;{title}&rdquo; 일정이 삭제됩니다. 삭제한 일정은 30일 뒤에 영구 삭제됩니다.</p>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} disabled={busy} className={btnGhost}>취소</button>
        <button onClick={onConfirm} disabled={busy} className={btnDanger}>{busy ? "삭제 중…" : "삭제"}</button>
      </div>
    </Modal>
  );
}
