import { describe, expect, it, vi } from "vitest";
import type { NormalizedForecast, WeatherProvider } from "./provider";
import { getForecast, WeatherUnavailable, type CacheRow, type CacheStore } from "./service";

const fc = (temp: number): NormalizedForecast => ({
  current: { temp, feelsLike: temp, condition: { icon: "clear", label: "맑음" } },
  hourly: [],
  daily: [],
});
const NOW = Date.parse("2026-10-14T13:00:00Z");

function setup(opts: { cached?: CacheRow | null; fail?: boolean } = {}) {
  const rows = new Map<string, CacheRow>();
  if (opts.cached) rows.set("37.57,126.98", opts.cached);
  const store: CacheStore = {
    get: async (k) => rows.get(k) ?? null,
    put: async (k, payload, fetched_at) => void rows.set(k, { payload, fetched_at }),
  };
  const getFc = vi.fn(async () => {
    if (opts.fail) throw new Error("boom");
    return fc(20);
  });
  const provider: WeatherProvider = { getForecast: getFc, geocode: async () => [] };
  return { store, provider, getFc, rows, deps: { provider, store, now: () => NOW } };
}

describe("getForecast", () => {
  it("신선한 캐시(30분 이내)는 외부 호출 없이 반환", async () => {
    const s = setup({ cached: { payload: fc(10), fetched_at: "2026-10-14T12:45:00Z" } });
    const r = await getForecast(s.deps, 37.5665, 126.978);
    expect(s.getFc).not.toHaveBeenCalled();
    expect(r).toMatchObject({ stale: false, fetched_at: "2026-10-14T12:45:00Z", location_key: "37.57,126.98" });
    expect(r.current.temp).toBe(10);
  });

  it("캐시 미스면 호출하고 저장한다", async () => {
    const s = setup();
    const r = await getForecast(s.deps, 37.5665, 126.978);
    expect(s.getFc).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ stale: false, fetched_at: new Date(NOW).toISOString() });
    expect(s.rows.get("37.57,126.98")?.payload.current.temp).toBe(20);
  });

  it("오래된 캐시 + 외부 장애 → stale:true 로 마지막 캐시와 업데이트 시각 반환 (WX-7)", async () => {
    const s = setup({ cached: { payload: fc(10), fetched_at: "2026-10-14T10:00:00Z" }, fail: true });
    const r = await getForecast(s.deps, 37.5665, 126.978);
    expect(r).toMatchObject({ stale: true, fetched_at: "2026-10-14T10:00:00Z" });
    expect(r.current.temp).toBe(10);
  });

  it("캐시도 없고 장애면 WEATHER_UNAVAILABLE", async () => {
    const s = setup({ fail: true });
    await expect(getForecast(s.deps, 37.5665, 126.978)).rejects.toBeInstanceOf(WeatherUnavailable);
  });

  it("같은 지역 동시 요청은 외부 호출 1번으로 합친다", async () => {
    const s = setup();
    await Promise.all([getForecast(s.deps, 37.5665, 126.978), getForecast(s.deps, 37.5701, 126.9801), getForecast(s.deps, 37.57, 126.98)]);
    expect(s.getFc).toHaveBeenCalledTimes(1);
  });
});
