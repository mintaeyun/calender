"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import * as api from "./api";

export const notiKeys = {
  all: ["notifications"] as const,
  list: ["notifications", "list"] as const,
  unread: ["notifications", "unread"] as const,
  settings: ["notifications", "settings"] as const,
};

export const useNotifications = () => useQuery({ queryKey: notiKeys.list, queryFn: () => api.listNotifications(), refetchInterval: 60_000 });
export const useNotificationSettings = () => useQuery({ queryKey: notiKeys.settings, queryFn: api.getSettings });

/**
 * 헤더 배지용 안 읽은 알림 수. Supabase Realtime 으로 notifications 변경을 구독해 즉시 갱신하고,
 * 예약 시각이 지나며 보이게 되는 알림을 위해 1분마다도 다시 불러온다.
 */
export function useUnreadCount(): number {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: notiKeys.unread, queryFn: api.unreadCount, refetchInterval: 60_000, retry: false });
  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
    try {
      const supabase = createClient();
      channel = supabase
        .channel("notifications-changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => qc.invalidateQueries({ queryKey: notiKeys.all }))
        .subscribe();
      return () => { void supabase.removeChannel(channel!); };
    } catch {
      return undefined; // 환경변수 없음 등: 폴링만 사용
    }
  }, [qc]);
  return q.data ?? 0;
}

function useNotiMutation<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: notiKeys.all }) });
}
export const useMarkRead = () => useNotiMutation(api.markRead);
export const useMarkAllRead = () => useNotiMutation(() => api.markAllRead());
export const useDeleteNotification = () => useNotiMutation(api.deleteNotification);
export const useUpdateNotificationSettings = () =>
  useNotiMutation(({ userId, patch }: { userId: string; patch: Parameters<typeof api.updateSettings>[1] }) => api.updateSettings(userId, patch));
