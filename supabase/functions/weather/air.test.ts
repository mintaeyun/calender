import { describe, expect, it } from "vitest";
import { buildAirQuality, createAirProvider, parseMeasurement, pm10Grade, pm25Grade, worstGrade } from "./air";

describe("등급 판정 (경계값 포함)", () => {
  it("PM2.5: 15 / 35 / 75", () => {
    expect([0, 15, 16, 35, 36, 75, 76].map(pm25Grade)).toEqual(["good", "good", "normal", "normal", "bad", "bad", "very_bad"]);
  });
  it("PM10: 30 / 80 / 150", () => {
    expect([30, 31, 80, 81, 150, 151].map(pm10Grade)).toEqual(["good", "normal", "normal", "bad", "bad", "very_bad"]);
  });
  it("결측·음수는 등급 없음", () => {
    expect(pm25Grade(null)).toBeNull();
    expect(pm10Grade(-1)).toBeNull();
    expect(pm10Grade(NaN)).toBeNull();
  });
});

describe("worstGrade / parseMeasurement / buildAirQuality", () => {
  it("더 나쁜 등급, 한쪽만 있으면 그 값", () => {
    expect(worstGrade("good", "bad")).toBe("bad");
    expect(worstGrade(null, "normal")).toBe("normal");
    expect(worstGrade(null, null)).toBeNull();
  });
  it("에어코리아의 '-' 결측 처리", () => {
    expect(parseMeasurement("-")).toBeNull();
    expect(parseMeasurement("23")).toBe(23);
    expect(parseMeasurement(null)).toBeNull();
    expect(parseMeasurement("")).toBeNull();
  });
  it("정규화", () => {
    const a = buildAirQuality({ pm25: "40", pm10: "20", station: "중구", measured_at: "2026-10-19 14:00" });
    expect(a).toMatchObject({ pm25: 40, pm10: 20, pm25Grade: "bad", pm10Grade: "good", grade: "bad", station: "중구" });
    expect(buildAirQuality({ pm25: "-", pm10: "-", station: "x", measured_at: "" }).grade).toBeNull();
  });
});

describe("키 없으면 비활성", () => {
  it("createAirProvider(undefined) === null", () => {
    expect(createAirProvider(undefined)).toBeNull();
    expect(createAirProvider("")).toBeNull();
    expect(createAirProvider("key")).not.toBeNull();
  });
  it("키가 있어도 아직 호출부 미구현이면 AIR_NOT_IMPLEMENTED", async () => {
    await expect(createAirProvider("key")!.getAir({ lat: 37.5, lon: 127 })).rejects.toThrow("AIR_NOT_IMPLEMENTED");
  });
});
