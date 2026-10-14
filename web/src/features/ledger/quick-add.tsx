"use client";

import type { QuickAddFormProps } from "@/components/layout/QuickAdd";
import { TxForm } from "./components/TxForm";

/** 빠른 추가 모달의 지출 탭(수입·이체 토글 포함). 저장에 성공하면 onClose(). */
export function QuickAddForm({ onClose }: QuickAddFormProps) {
  return <TxForm onDone={onClose} />;
}
