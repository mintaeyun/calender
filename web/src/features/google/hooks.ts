"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  disconnectGoogle, getConnection, listGoogleCalendars, refreshCalendarList, setCalendarEnabled, setSyncDirection, startConnect, syncNow,
  type GoogleConnection,
} from "./api";
import { isTargetCalendar, shouldAutoSync } from "./lib/errors";

export const connectionKey = ["google", "connection"] as const;
export const calendarsKey = ["google", "calendars"] as const;

/** 연결 상태(이메일·마지막 동기화·오류). 연결이 없으면 data 가 null. */
export function useGoogleConnection() {
  return useQuery({ queryKey: connectionKey, queryFn: getConnection, staleTime: 30_000 });
}

export function useGoogleCalendars(enabled = true) {
  return useQuery({
    queryKey: calendarsKey,
    // mycal 외의 캘린더(이전에 저장된 것 포함)는 화면에서 숨긴다
    queryFn: async () => (await listGoogleCalendars()).filter((c) => isTargetCalendar(c.name)),
    enabled,
    staleTime: 30_000,
  });
}

export function useGoogleActions() {
  const qc = useQueryClient();
  const refreshAll = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: connectionKey }),
      qc.invalidateQueries({ queryKey: calendarsKey }),
      qc.invalidateQueries({ queryKey: ["events"] }), // 캘린더 화면 갱신
    ]);
  };
  return {
    connect: useMutation({ mutationFn: startConnect, onSuccess: (url) => window.location.assign(url) }),
    sync: useMutation({ mutationFn: syncNow, onSettled: refreshAll }),
    refreshList: useMutation({
      mutationFn: refreshCalendarList,
      onSuccess: () => qc.invalidateQueries({ queryKey: calendarsKey }),
    }),
    disconnect: useMutation({ mutationFn: (deleteEvents: boolean) => disconnectGoogle(deleteEvents), onSettled: refreshAll }),
    toggleCalendar: useMutation({
      mutationFn: (v: { id: string; enabled: boolean }) => setCalendarEnabled(v.id, v.enabled),
      onSuccess: () => qc.invalidateQueries({ queryKey: calendarsKey }),
    }),
    setDirection: useMutation({
      mutationFn: (d: GoogleConnection["sync_direction"]) => setSyncDirection(d),
      onSuccess: () => qc.invalidateQueries({ queryKey: connectionKey }),
    }),
  };
}

/**
 * 앱 진입 시 자동 동기화(GCAL-8). 연결이 있고 마지막 동기화가 5분 넘었으면 한 번만 백그라운드로 실행한다.
 * 앱 셸(AppShell)에 마운트한다. 재연결이 필요한 오류 상태에서는 호출하지 않는다.
 */
export function useGoogleAutoSync() {
  const { data: conn } = useGoogleConnection();
  const { sync } = useGoogleActions();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !conn) return;
    if (shouldAutoSync(conn, new Date())) {
      done.current = true;
      sync.mutate();
    }
  }, [conn, sync]);
}
