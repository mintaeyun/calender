"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * 모달 접근성: 열릴 때 안으로 포커스 이동, Tab/Shift+Tab 을 모달 안에서 순환, Esc 로 닫기, 닫힐 때 원래 요소로 포커스 복원.
 * 사용: const ref = useFocusTrap<HTMLDivElement>(onClose); <div ref={ref} role="dialog" aria-modal tabIndex={-1}>
 * 모달이 겹쳐 열리면(예: 일정 폼 위의 범위 선택) 가장 마지막에 열린 모달만 Esc/Tab 에 반응한다.
 */
const stack: symbol[] = [];

export function useFocusTrap<T extends HTMLElement>(onClose?: () => void, active = true) {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    const id = Symbol("trap");
    stack.push(id);
    const previous = document.activeElement as HTMLElement | null;

    const items = () => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
    // 이미 안에 포커스가 있으면(autoFocus) 건드리지 않고, 없으면 첫 입력 요소(없으면 모달 자체)로 이동
    if (!root.contains(document.activeElement)) (items()[0] ?? root).focus();

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const list = items();
      if (!list.length) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const cur = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (cur === first || !root.contains(cur))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (cur === last || !root.contains(cur))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      // 열기 전에 포커스가 있던 요소로 복원 (이미 사라졌으면 무시)
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [active]);

  return ref;
}
