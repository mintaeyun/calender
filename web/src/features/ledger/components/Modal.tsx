"use client";

import { useEffect, type ReactNode } from "react";

/** 가계부용 간단한 모달. 바깥 클릭·Esc로 닫는다. */
export function Modal({ title, onClose, children, width = 540 }: { title?: string; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div onClick={onClose} className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-5" role="dialog" aria-modal="true" aria-label={title}>
      <div onClick={(e) => e.stopPropagation()} style={{ width }} className="flex max-h-[92vh] max-w-full flex-col gap-[18px] overflow-y-auto rounded-[28px] border border-[#2a2a2e] bg-[#161619] p-[26px]">
        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold">{title}</span>
          <button onClick={onClose} aria-label="닫기" className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-surface-3 text-fg-muted">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
