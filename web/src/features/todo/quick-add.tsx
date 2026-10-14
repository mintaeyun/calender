"use client";

import type { QuickAddFormProps } from "@/components/layout/QuickAdd";

/**
 * 빠른 추가 모달의 '할일' 탭 폼. 현재는 자리표시자다.
 * TODO: 해당 영역 세션이 목업(components/screens/QuickAdd.tsx)을 이식해 구현한다.
 * 저장에 성공하면 onClose() 를 호출한다.
 */
export function QuickAddForm({ onClose }: QuickAddFormProps) {
  return (
    <div className="flex flex-col gap-4 py-6 text-center text-fg-subtle">
      <span>할일 빠른 추가는 준비 중입니다.</span>
      <button onClick={onClose} className="mx-auto rounded-full border border-[#3a3a40] px-5 py-2 text-sm text-fg">
        닫기
      </button>
    </div>
  );
}
