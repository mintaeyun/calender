"use client";

import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 가계부용 모달. 바깥 클릭·Esc로 닫고, 열릴 때 첫 입력으로 포커스를 옮기고 Tab 이 모달 안에서만 돌게 하며(포커스 트랩),
 * 닫히면 열기 전에 있던 요소로 포커스를 돌려준다.
 */
export function Modal({ title, onClose, children, width = 540 }: { title?: string; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const box = ref.current;
    const first = box?.querySelector<HTMLElement>("input, select, textarea") ?? box?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? box)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onCloseRef.current(); return; }
      if (e.key !== "Tab" || !box) return;
      const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) { e.preventDefault(); return; }
      const [a, z] = [items[0], items[items.length - 1]];
      if (e.shiftKey && (document.activeElement === a || document.activeElement === box)) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div onClick={onClose} className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-3 sm:p-5">
      <div
        ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        onClick={(e) => e.stopPropagation()} style={{ width }}
        className="flex max-h-[92vh] max-w-full flex-col gap-[18px] overflow-y-auto rounded-[28px] border border-border bg-surface-modal p-5 outline-none sm:p-[26px]"
      >
        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold">{title}</span>
          <button onClick={onClose} aria-label="닫기" className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-surface-3 text-fg-muted">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
