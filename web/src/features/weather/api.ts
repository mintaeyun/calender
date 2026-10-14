// `weather` Edge Function 호출. 외부 날씨 API는 브라우저에서 직접 부르지 않는다.
import { createClient } from "@/lib/supabase/client";
import type { GeocodeResult, WeatherData } from "./types";

async function call<T>(query: string): Promise<T> {
  const { data, error } = await createClient().functions.invoke(`weather?${query}`, { method: "GET" });
  if (error) {
    // 서버가 { error: { code, message } } 를 돌려준 경우 그 문구를 쓴다.
    const ctx = (error as { context?: Response }).context;
    const body = ctx ? await ctx.json().catch(() => null) : null;
    throw new Error(body?.error?.message ?? "날씨 정보를 가져오지 못했어요");
  }
  return data as T;
}

export const fetchWeather = (lat: number, lon: number) => call<WeatherData>(`lat=${lat}&lon=${lon}`);

export async function searchCities(q: string): Promise<GeocodeResult[]> {
  const r = await call<{ results: GeocodeResult[] }>(`action=geocode&q=${encodeURIComponent(q)}`);
  return r.results;
}
