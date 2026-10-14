"use client";

import type { QuickAddFormProps } from "@/components/layout/QuickAdd";
import { EventForm } from "./components/EventForm";

/** 빠른 추가 모달의 '일정' 탭. 일정 모달과 같은 폼을 쓴다. */
export function QuickAddForm({ onClose }: QuickAddFormProps) {
  return <EventForm onDone={onClose} />;
}
