import { describe, expect, it } from "vitest";
import { conditionFromWmo, isFresh, locationKey, normalizeOpenMeteo } from "./provider";

const sample = {
  current: { time: "2026-10-14T13:00", temperature_2m: 18.4, apparent_temperature: 16.6, weather_code: 0 },
  hourly: {
    time: Array.from({ length: 48 }, (_, i) => `2026-10-${14 + Math.floor(i / 24)}T${String(i % 24).padStart(2, "0")}:00`),
    temperature_2m: Array.from({ length: 48 }, () => 17.5),
    precipitation_probability: Array.from({ length: 48 }, (_, i) => (i === 19 ? 60 : 0)),
    weather_code: Array.from({ length: 48 }, (_, i) => (i === 19 ? 61 : 0)),
  },
  daily: {
    time: ["2026-10-14", "2026-10-15"],
    weather_code: [0, 63],
    temperature_2m_max: [19.6, 15.2],
    temperature_2m_min: [9.4, 11],
    precipitation_probability_max: [60, null],
  },
};

describe("normalizeOpenMeteo", () => {
  const n = normalizeOpenMeteo(sample);
  it("현재 날씨 반올림·한국어 라벨", () => {
    expect(n.current).toEqual({ temp: 18, feelsLike: 17, condition: { icon: "clear", label: "맑음" } });
  });
  it("시간별은 현재 시각부터 24개", () => {
    expect(n.hourly).toHaveLength(24);
    expect(n.hourly[0].time).toBe("2026-10-14T13:00");
    expect(n.hourly.find((h) => h.time === "2026-10-14T19:00")).toMatchObject({ precipProb: 60, condition: { label: "비" } });
  });
  it("일별 요약, null 확률은 0", () => {
    expect(n.daily[0]).toMatchObject({ date: "2026-10-14", tempMax: 20, tempMin: 9, precipProbMax: 60 });
    expect(n.daily[1].precipProbMax).toBe(0);
  });
});

describe("conditionFromWmo", () => {
  it("대표 코드", () => {
    expect(conditionFromWmo(3).icon).toBe("cloudy");
    expect(conditionFromWmo(73).icon).toBe("snow");
    expect(conditionFromWmo(95).icon).toBe("thunder");
  });
});

describe("cache helpers", () => {
  it("locationKey는 소수 둘째 자리로 반올림", () => {
    expect(locationKey(37.5665, 126.978)).toBe("37.57,126.98");
  });
  it("30분 이내만 fresh", () => {
    const now = Date.parse("2026-10-14T13:00:00Z");
    expect(isFresh("2026-10-14T12:40:00Z", now)).toBe(true);
    expect(isFresh("2026-10-14T12:20:00Z", now)).toBe(false);
  });
});
