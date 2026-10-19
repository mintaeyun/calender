// 미세먼지(WX-6, P2). 에어코리아 연동은 API 키(AIRKOREA_API_KEY, Edge secrets)가 있어야 한다.
// 키가 없으면 기능 전체가 비활성(enabled:false)으로 동작하고 날씨 화면은 영향을 받지 않는다.
// 이 파일은 순수 로직(등급 판정)과 제공처 인터페이스만 가진다. 실제 에어코리아 호출은 키 발급 후 구현한다.

export type AirGrade = "good" | "normal" | "bad" | "very_bad";

export type AirQuality = {
  pm25: number | null;      // 초미세먼지 µg/m³
  pm10: number | null;      // 미세먼지 µg/m³
  pm25Grade: AirGrade | null;
  pm10Grade: AirGrade | null;
  /** 두 항목 중 나쁜 쪽 */
  grade: AirGrade | null;
  station: string;          // 측정소 이름
  measured_at: string;      // 측정 시각 (제공처 기준 문자열)
};

export interface AirQualityProvider {
  getAir(p: { lat: number; lon: number }): Promise<AirQuality>;
}

// 한국 환경부 통합대기환경지수 기준 (µg/m³)
const PM25_LIMITS = [15, 35, 75];
const PM10_LIMITS = [30, 80, 150];
const ORDER: AirGrade[] = ["good", "normal", "bad", "very_bad"];

function gradeOf(value: number | null, limits: number[]): AirGrade | null {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  const i = limits.findIndex((l) => value <= l);
  return ORDER[i === -1 ? 3 : i];
}

export const pm25Grade = (v: number | null) => gradeOf(v, PM25_LIMITS);
export const pm10Grade = (v: number | null) => gradeOf(v, PM10_LIMITS);

/** 둘 중 더 나쁜 등급. 한쪽만 있으면 그 값, 둘 다 없으면 null. */
export function worstGrade(a: AirGrade | null, b: AirGrade | null): AirGrade | null {
  if (!a) return b;
  if (!b) return a;
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
}

/** 에어코리아 측정값(문자열 "-" 등 포함 가능)을 숫자로. 결측은 null. */
export function parseMeasurement(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null; // Number("") === 0 이라 따로 거른다
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function buildAirQuality(raw: { pm25: unknown; pm10: unknown; station: string; measured_at: string }): AirQuality {
  const pm25 = parseMeasurement(raw.pm25);
  const pm10 = parseMeasurement(raw.pm10);
  const g25 = pm25Grade(pm25);
  const g10 = pm10Grade(pm10);
  return { pm25, pm10, pm25Grade: g25, pm10Grade: g10, grade: worstGrade(g25, g10), station: raw.station, measured_at: raw.measured_at };
}

/** 에어코리아 제공처. 키 발급 전이라 호출부는 구현하지 않았다(키가 있어도 AIR_NOT_IMPLEMENTED). */
export class AirKoreaProvider implements AirQualityProvider {
  constructor(private apiKey: string) {}
  getAir(_p: { lat: number; lon: number }): Promise<AirQuality> {
    // TODO(WX-6): ① WGS84→TM 좌표 변환 ② getNearbyMsrstnList 로 가까운 측정소 ③ getMsrstnAcctoRltmMesureDnsty 로 실시간 값
    //             → buildAirQuality() 로 정규화. 호출 실패 시 예외를 던져 weather 함수가 AIR_UNAVAILABLE 로 응답하게 한다.
    void this.apiKey;
    return Promise.reject(new Error("AIR_NOT_IMPLEMENTED"));
  }
}

/** 키가 없으면 null = 미세먼지 기능 비활성 */
export function createAirProvider(apiKey: string | undefined): AirQualityProvider | null {
  return apiKey ? new AirKoreaProvider(apiKey) : null;
}
