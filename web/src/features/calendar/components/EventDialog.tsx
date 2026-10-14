"use client";

import type { ComponentProps } from "react";
import { EventForm } from "./EventForm";
import { Modal } from "./Dialogs";

/** 일정 등록·수정 모달. 내용은 EventForm (빠른 추가 탭과 공유). */
export function EventDialog(props: ComponentProps<typeof EventForm>) {
  return (
    <Modal onClose={props.onDone}>
      <h2 className="font-display text-[22px]">{props.instance ? "일정 수정" : "새 일정"}</h2>
      <EventForm {...props} />
    </Modal>
  );
}
