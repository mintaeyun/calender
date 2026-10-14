// weather 함수와 notify 함수가 함께 쓰는 의존성 조립(제공처 선택, DB 캐시 저장소). Deno.serve 를 호출하지 않는다.
import { adminClient } from "../_shared/supabase.ts";
import { OpenMeteoProvider, type NormalizedForecast, type WeatherProvider } from "./provider.ts";
import type { CacheStore } from "./service.ts";

export function createProvider(): WeatherProvider {
  const name = Deno.env.get("WEATHER_PROVIDER") ?? "open-meteo";
  switch (name) {
    case "open-meteo":
      return new OpenMeteoProvider();
    default:
      // 기상청 등은 WeatherProvider 구현체를 추가하고 여기에 등록한다.
      throw new Error(`지원하지 않는 WEATHER_PROVIDER: ${name}`);
  }
}

/** weather_cache 읽기/쓰기. 쓰기는 service role 만 가능하다(RLS). */
export function dbCacheStore(): CacheStore {
  const db = adminClient();
  return {
    async get(key) {
      const { data, error } = await db.from("weather_cache").select("payload, fetched_at").eq("location_key", key).maybeSingle();
      if (error) throw error;
      return data ? { payload: data.payload as unknown as NormalizedForecast, fetched_at: data.fetched_at } : null;
    },
    async put(key, payload, fetchedAt) {
      const { error } = await db
        .from("weather_cache")
        .upsert({ location_key: key, payload: payload as never, fetched_at: fetchedAt }, { onConflict: "location_key" });
      if (error) throw error;
    },
  };
}
