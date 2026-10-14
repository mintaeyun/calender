// 날씨 제공처 추상화. Deno/Node 어디서나 import 가능하도록 런타임 전용 API 없이 표준 fetch만 쓴다.
// 06 MCP(get_weather, get_today_overview)도 이 모듈을 재사용한다.

export type WeatherIcon = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "thunder";

export type Condition = { icon: WeatherIcon; label: string };

export type NormalizedForecast = {
  current: { temp: number; feelsLike: number; condition: Condition };
  /** 현재 시각부터 24시간. time은 제공처가 돌려준 현지 시각 'YYYY-MM-DDTHH:mm'. */
  hourly: { time: string; temp: number; precipProb: number; condition: Condition }[];
  /** 오늘부터 7일. date는 현지 날짜 'YYYY-MM-DD'. */
  daily: { date: string; tempMax: number; tempMin: number; precipProbMax: number; condition: Condition }[];
};

export type GeocodeResult = { name: string; admin: string; country: string; lat: number; lon: number };

export interface WeatherProvider {
  getForecast(p: { lat: number; lon: number }): Promise<NormalizedForecast>;
  geocode(q: string): Promise<GeocodeResult[]>;
}

/** WMO 날씨 코드 → 한국어 라벨·아이콘 키. */
export function conditionFromWmo(code: number): Condition {
  if (code === 0) return { icon: "clear", label: "맑음" };
  if (code <= 2) return { icon: "partly", label: "구름 조금" };
  if (code === 3) return { icon: "cloudy", label: "흐림" };
  if (code === 45 || code === 48) return { icon: "fog", label: "안개" };
  if (code >= 51 && code <= 57) return { icon: "drizzle", label: "이슬비" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { icon: "rain", label: "비" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: "snow", label: "눈" };
  if (code >= 95) return { icon: "thunder", label: "뇌우" };
  return { icon: "cloudy", label: "흐림" };
}

type Fetch = typeof fetch;

const TIMEOUT_MS = 5000;

async function getJson(f: Fetch, url: string): Promise<any> {
  const res = await f(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`weather provider HTTP ${res.status}`);
  return res.json();
}

export class OpenMeteoProvider implements WeatherProvider {
  constructor(private f: Fetch = fetch) {}

  async getForecast({ lat, lon }: { lat: number; lon: number }): Promise<NormalizedForecast> {
    const qs = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: "temperature_2m,apparent_temperature,weather_code",
      hourly: "temperature_2m,precipitation_probability,weather_code",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      timezone: "auto",
      forecast_days: "7",
    });
    return normalizeOpenMeteo(await getJson(this.f, `https://api.open-meteo.com/v1/forecast?${qs}`));
  }

  async geocode(q: string): Promise<GeocodeResult[]> {
    const qs = new URLSearchParams({ name: q, count: "8", language: "ko" });
    const j = await getJson(this.f, `https://geocoding-api.open-meteo.com/v1/search?${qs}`);
    return (j.results ?? []).map((r: any) => ({
      name: r.name,
      admin: [r.admin1, r.admin2].filter(Boolean).join(" "),
      country: r.country ?? "",
      lat: r.latitude,
      lon: r.longitude,
    }));
  }
}

/** Open-Meteo 응답 → 정규화 형식. 순수 함수. */
export function normalizeOpenMeteo(j: any): NormalizedForecast {
  const h = j.hourly;
  // 현재 시각(제공처 현지 시각의 시 단위) 이후 24개
  const nowHour = String(j.current.time).slice(0, 13);
  const start = Math.max(0, h.time.findIndex((t: string) => t.slice(0, 13) >= nowHour));
  const hourly = h.time.slice(start, start + 24).map((time: string, i: number) => ({
    time,
    temp: Math.round(h.temperature_2m[start + i]),
    precipProb: h.precipitation_probability[start + i] ?? 0,
    condition: conditionFromWmo(h.weather_code[start + i]),
  }));
  const d = j.daily;
  const daily = d.time.map((date: string, i: number) => ({
    date,
    tempMax: Math.round(d.temperature_2m_max[i]),
    tempMin: Math.round(d.temperature_2m_min[i]),
    precipProbMax: d.precipitation_probability_max[i] ?? 0,
    condition: conditionFromWmo(d.weather_code[i]),
  }));
  return {
    current: {
      temp: Math.round(j.current.temperature_2m),
      feelsLike: Math.round(j.current.apparent_temperature),
      condition: conditionFromWmo(j.current.weather_code),
    },
    hourly,
    daily,
  };
}

/** 캐시 키: 위경도를 소수 둘째 자리로 반올림(같은 구역 사용자 공유). */
export function locationKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

export const CACHE_TTL_MS = 30 * 60 * 1000;
export const isFresh = (fetchedAt: Date | string, now = Date.now()) => now - new Date(fetchedAt).getTime() < CACHE_TTL_MS;
