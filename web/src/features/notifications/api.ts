// 알림함·알림 설정 supabase 호출. RLS(user_id = auth.uid())가 보호한다.
import { createClient } from "@/lib/supabase/client";
import type { Tables, TablesUpdate } from "@/lib/supabase/database.types";

export type AppNotification = Tables<"notifications">;
export type NotificationSettingsRow = Tables<"notification_settings">;

const must = <T>(r: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (r.error) throw new Error(r.error.message);
  return r.data as NonNullable<T>;
};

/** 알림 시각이 지난 알림만(예약된 미래 알림은 숨김). 최신순. */
export async function listNotifications(limit = 100): Promise<AppNotification[]> {
  return must(
    await createClient().from("notifications").select("*").lte("scheduled_at", new Date().toISOString()).order("scheduled_at", { ascending: false }).limit(limit),
  );
}

export async function unreadCount(): Promise<number> {
  const { count, error } = await createClient().from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).lte("scheduled_at", new Date().toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markRead(id: string): Promise<void> {
  must(await createClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null).select("id"));
}
export async function markAllRead(): Promise<void> {
  must(await createClient().from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null).select("id"));
}
export async function deleteNotification(id: string): Promise<void> {
  must(await createClient().from("notifications").delete().eq("id", id).select("id"));
}

export async function getSettings(): Promise<NotificationSettingsRow> {
  return must(await createClient().from("notification_settings").select("*").single());
}
export async function updateSettings(userId: string, patch: TablesUpdate<"notification_settings">): Promise<NotificationSettingsRow> {
  return must(await createClient().from("notification_settings").update(patch).eq("user_id", userId).select().single());
}
