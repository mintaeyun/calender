import { describe, expect, it } from "vitest";
import type { WeatherData } from "../types";
import { badgeText, dailyCell, dailyMap, formatTemp, nextRain, updatedLabel } from "./format";

const cond = (label: string) => ({ icon: "clear" as const, label });
const w: WeatherData = {
  current: { temp: 18, feelsLike: 17, condition: cond("맑음") },
  hourly: [
    { time: "2026-10-14T13:00", temp: 18, precipProb: 0, condition: cond("맑음") },
    { time: "2026-10-14T19:00", temp: 15, precipProb: 60, condition: cond("비") },
  ],
  daily: [
    { date: "2026-10-14", tempMax: 19, tempMin: 9, precipProbMax: 60, condition: cond("비") },
    { date: "2026-10-15", tempMax: 17, tempMin: 10, precipProbMax: 10, condition: cond("맑음") },
  ],
  fetched_at: "2026-10-14T04:10:00Z",
  stale: false,
  location_key: "37.57,126.98",
};

describe("format", () => {
  it("온도 단위", () => {
    expect(formatTemp(18)).toBe("18°");
    expect(formatTemp(0, "F")).toBe("32°");
    expect(formatTemp(100, "F")).toBe("212°");
  });
  it("다음 강수 시각과 칩 문구 (목업: 18° 맑음 · 체감 17° · 19시 비 60%)", () => {
    expect(nextRain(w.hourly)?.time).toBe("2026-10-14T19:00");
    expect(badgeText(w)).toEqual({ main: "18° 맑음 · 체감 17°", rain: "19시 비 60%" });
    expect(badgeText({ ...w, hourly: [w.hourly[0]] }).rain).toBeNull();
  });
  it("캘린더 셀: 강수확률 60% 이상이면 `비 60%`, 아니면 최고기온", () => {
    expect(dailyCell(w.daily[0]).text).toBe("비 60%");
    expect(dailyCell(w.daily[1]).text).toBe("17°");
  });
  it("dailyMap: 범위 밖 날짜는 없음", () => {
    const m = dailyMap(w);
    expect(m.get("2026-10-15")?.text).toBe("17°");
    expect(m.get("2026-10-30")).toBeUndefined();
    expect(dailyMap(undefined).size).toBe(0);
  });
  it("업데이트 시각은 사용자 시간대", () => {
    expect(updatedLabel("2026-10-14T04:10:00Z", "Asia/Seoul")).toBe("마지막 업데이트 13:10");
  });
});
