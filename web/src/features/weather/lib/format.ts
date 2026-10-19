// 날씨 표시용 순수 로직.
import type { DailyWeather, WeatherData } from "../types";

export const RAIN_THRESHOLD = 60; // 강수확률(%) — WX-5 기준과 같다

const cToF = (c: number) => Math.round((c * 9) / 5 + 32);

/** 기온 표기. 단위가 F면 환산한다. */
export const formatTemp = (celsius: number, unit: "C" | "F" = "C") => `${unit === "F" ? cToF(celsius) : celsius}°`;

/** 지금 이후 24시간 중 처음으로 강수확률이 기준 이상인 시간. 없으면 null. */
export function nextRain(hourly: WeatherData["hourly"], threshold = RAIN_THRESHOLD) {
  return hourly.find((h) => h.precipProb >= threshold) ?? null;
}

/** 'YYYY-MM-DDTHH:mm' → 시(0~23) */
export const hourOf = (time: string) => Number(time.slice(11, 13));

/** 대시보드 상단 칩 문구: `18° 맑음 · 체감 17° · 19시 비 60%` (비 예보가 없으면 뒷부분 생략) */
export function badgeText(w: WeatherData, unit: "C" | "F" = "C"): { main: string; rain: string | null } {
  const r = nextRain(w.hourly);
  return {
    main: `${formatTemp(w.current.temp, unit)} ${w.current.condition.label} · 체감 ${formatTemp(w.current.feelsLike, unit)}`,
    rain: r ? `${hourOf(r.time)}시 ${r.condition.label} ${r.precipProb}%` : null,
  };
}

/** 캘린더 셀 문구: 강수확률이 기준 이상이면 `비 60%`, 아니면 최고기온 `17°` */
export function dailyCell(d: WeatherData["daily"][number], unit: "C" | "F" = "C"): DailyWeather {
  const wet = d.precipProbMax >= RAIN_THRESHOLD;
  return {
    icon: d.condition.icon,
    label: d.condition.label,
    text: wet ? `${d.condition.label} ${d.precipProbMax}%` : formatTemp(d.tempMax, unit),
  };
}

/** 날짜('YYYY-MM-DD') → 셀 요약. 예보 범위(7일) 밖 날짜는 키가 없다. */
export function dailyMap(w: WeatherData | undefined, unit: "C" | "F" = "C"): Map<string, DailyWeather> {
  return new Map((w?.daily ?? []).map((d) => [d.date, dailyCell(d, unit)]));
}

/** 업데이트 시각 라벨: `마지막 업데이트 13:10` (사용자 시간대) */
export function updatedLabel(fetchedAt: string, tz: string): string {
  const t = new Intl.DateTimeFormat("ko-KR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(fetchedAt));
  return `마지막 업데이트 ${t}`;
}

export const STALE_NOTICE = "날씨 서버에 연결할 수 없어 마지막으로 받은 예보를 보여주고 있어요.";

/** 날씨 아이콘 이모지(디자인에 아이콘 에셋이 없어 텍스트 아이콘 사용) */
export const ICON_EMOJI: Record<string, string> = { clear: "☀️", partly: "🌤️", cloudy: "☁️", fog: "🌫️", drizzle: "🌦️", rain: "🌧️", snow: "❄️", thunder: "⛈️" };

export const AIR_LABEL: Record<string, string> = { good: "좋음", normal: "보통", bad: "나쁨", very_bad: "매우나쁨" };
/** 등급 색: 좋음=라임, 보통=회색, 나쁨/매우나쁨=경고색 (색 외에 등급 텍스트를 항상 병기) */
export const AIR_COLOR: Record<string, string> = { good: "var(--lime)", normal: "var(--fg-muted)", bad: "var(--danger)", very_bad: "var(--danger)" };
