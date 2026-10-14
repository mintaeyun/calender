// Edge Function `weather`: 외부 날씨 API는 서버(여기)에서만 호출한다.
//   GET  ?lat=&lon=            → 정규화 예보(캐시 30분, 장애 시 stale 캐시)
//   GET  ?action=geocode&q=    → 도시 검색 후보
// 인증: 로그인 사용자 JWT 필수. 캐시 쓰기는 service role(weather_cache는 일반 사용자 쓰기 불가).
// 제공처는 환경변수 WEATHER_PROVIDER(기본 open-meteo). 비밀값이 필요한 제공처로 바뀌면 Edge secrets에만 둔다.
import { requireUser } from "../_shared/auth.ts";
import { handleCors, json } from "../_shared/cors.ts";
import { badRequest, errorResponse, HttpError } from "../_shared/errors.ts";
import { adminClient } from "../_shared/supabase.ts";
import { OpenMeteoProvider, type NormalizedForecast, type WeatherProvider } from "./provider.ts";
import { getForecast, WeatherUnavailable, type CacheStore } from "./service.ts";

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

const num = (v: string | null, min: number, max: number, name: string) => {
  const n = Number(v);
  if (v === null || v === "" || !Number.isFinite(n) || n < min || n > max) throw badRequest(`${name} 값이 올바르지 않습니다.`);
  return n;
};

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  try {
    await requireUser(req);
    const url = new URL(req.url);
    const provider = createProvider();

    if (url.searchParams.get("action") === "geocode") {
      const q = (url.searchParams.get("q") ?? "").trim();
      if (q.length < 1 || q.length > 50) throw badRequest("검색어는 1~50자여야 합니다.");
      return json({ results: await provider.geocode(q) });
    }

    const lat = num(url.searchParams.get("lat"), -90, 90, "lat");
    const lon = num(url.searchParams.get("lon"), -180, 180, "lon");
    return json(await getForecast({ provider, store: dbCacheStore() }, lat, lon));
  } catch (e) {
    if (e instanceof WeatherUnavailable) {
      return errorResponse(new HttpError(503, e.code, e.message));
    }
    return errorResponse(e);
  }
});
