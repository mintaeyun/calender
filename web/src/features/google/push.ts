"use client";

import type { QueryClient } from "@tanstack/react-query";
import { pushNow, type GoogleConnection } from "./api";

export const connectionKey = ["google", "connection"] as const;

let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * 일정을 저장·삭제·이동한 직후 호출한다. 양방향으로 연결돼 있으면 잠시 모아서(1.5초) 로컬 변경을 구글로 보낸다.
 * 실패해도 조용히 넘어간다 — 변경은 DB 에 남아 있어 다음 동기화(앱 진입·15분 주기)가 다시 보낸다.
 */
export function triggerPush(qc: QueryClient) {
  const conn = qc.getQueryData<GoogleConnection | null>(connectionKey);
  if (!conn || conn.sync_direction !== "two_way") return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    pushNow()
      .then(() => Promise.all([qc.invalidateQueries({ queryKey: ["events"] }), qc.invalidateQueries({ queryKey: connectionKey })]))
      .catch(() => undefined);
  }, 1500);
}
