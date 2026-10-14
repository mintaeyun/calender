import type { QuickAddForm, QuickKind } from "./QuickAdd";
import { QuickAddForm as LedgerQuickAdd } from "@/features/ledger/quick-add";
import { QuickAddForm as CalendarQuickAdd } from "@/features/calendar/quick-add";
import { QuickAddForm as TodoQuickAdd } from "@/features/todo/quick-add";

/**
 * 빠른 추가 모달의 탭별 폼 레지스트리.
 * 각 영역 세션은 자기 `features/<영역>/quick-add.tsx` 의 `QuickAddForm` 만 구현한다(이 파일은 수정하지 않는다).
 * 폼은 `{ onClose }` props 를 받고, 저장에 성공하면 onClose() 를 호출한다.
 */
export const QUICK_ADD_FORMS: Record<QuickKind, QuickAddForm> = {
  tx: LedgerQuickAdd,
  ev: CalendarQuickAdd,
  todo: TodoQuickAdd,
};
