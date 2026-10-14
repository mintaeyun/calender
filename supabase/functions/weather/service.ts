// 날씨 캐시·장애 폴백 로직. 저장소(store)와 제공처(provider)를 주입받아 Deno 없이도 테스트할 수 있다.
import { isFresh, locationKey, type NormalizedForecast, type WeatherProvider } from "./provider.ts";

export type CacheRow = { payload: NormalizedForecast; fetched_at: string };
export interface CacheStore {
  get(key: string): Promise<CacheRow | null>;
  put(key: string, payload: NormalizedForecast, fetchedAt: string): Promise<void>;
}

export type ForecastResponse = NormalizedForecast & {
  /** 제공처에서 받아온 시각(ISO). 캐시를 쓴 경우 캐시 생성 시각. */
  fetched_at: string;
  /** 외부 호출에 실패해 오래된 캐시를 대신 돌려줬으면 true (WX-7) */
  stale: boolean;
  location_key: string;
};

export class WeatherUnavailable extends Error {
  code = "WEATHER_UNAVAILABLE";
  constructor() {
    super("날씨 정보를 가져올 수 없습니다.");
  }
}

// 같은 인스턴스에서 같은 지역의 동시 요청이 몰릴 때 외부 호출을 한 번으로 합친다.
const inflight = new Map<string, Promise<ForecastResponse>>();

/**
 * 1) 30분 이내 캐시가 있으면 그대로 반환(외부 호출 없음)
 * 2) 없거나 오래됐으면 제공처 호출 → 캐시 저장
 * 3) 호출이 실패하면 마지막 캐시를 stale:true 로 반환, 캐시도 없으면 WeatherUnavailable
 */
export function getForecast(
  deps: { provider: WeatherProvider; store: CacheStore; now?: () => number },
  lat: number,
  lon: number,
): Promise<ForecastResponse> {
  const key = locationKey(lat, lon);
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = load(deps, key, lat, lon).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function load(
  { provider, store, now = Date.now }: { provider: WeatherProvider; store: CacheStore; now?: () => number },
  key: string,
  lat: number,
  lon: number,
): Promise<ForecastResponse> {
  const cached = await store.get(key).catch(() => null);
  if (cached && isFresh(cached.fetched_at, now())) {
    return { ...cached.payload, fetched_at: cached.fetched_at, stale: false, location_key: key };
  }
  try {
    const fresh = await provider.getForecast({ lat, lon });
    const fetchedAt = new Date(now()).toISOString();
    await store.put(key, fresh, fetchedAt).catch((e) => console.error("weather cache write failed", e));
    return { ...fresh, fetched_at: fetchedAt, stale: false, location_key: key };
  } catch (e) {
    console.error("weather provider failed", e instanceof Error ? e.message : e);
    if (cached) return { ...cached.payload, fetched_at: cached.fetched_at, stale: true, location_key: key };
    throw new WeatherUnavailable();
  }
}
