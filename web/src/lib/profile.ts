"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Tables, TablesUpdate } from "@/lib/supabase/database.types";
import { DEFAULT_TIMEZONE } from "@/lib/time";

export type Profile = Tables<"profiles">;
export const PROFILE_KEY = ["profile", "me"] as const;

/** 현재 사용자의 프로필(시간대·테마·주 시작 요일 등). 쿼리 키: ['profile','me'] */
export function useProfile() {
  return useQuery({
    queryKey: PROFILE_KEY,
    queryFn: async (): Promise<Profile> => {
      const supabase = createClient();
      const { data, error } = await supabase.from("profiles").select("*").single();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

/** 사용자 시간대. 프로필이 로드되기 전에는 기본값(Asia/Seoul). */
export function useTimezone(): string {
  return useProfile().data?.timezone ?? DEFAULT_TIMEZONE;
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return async (patch: TablesUpdate<"profiles">) => {
    const supabase = createClient();
    const { data, error } = await supabase.from("profiles").update(patch).select().single();
    if (error) throw error;
    qc.setQueryData(PROFILE_KEY, data);
    return data;
  };
}
