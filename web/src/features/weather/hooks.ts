"use client";

import { useQuery } from "@tanstack/react-query";
import { useProfile } from "@/lib/profile";
import { fetchAir, fetchWeather } from "./api";
import { dailyMap } from "./lib/format";
import type { DailyWeather, WeatherLocation } from "./types";

/** profiles.weather_location (jsonb) → 타입 있는 값. 없거나 모양이 틀리면 null. */
export function useWeatherLocation(): WeatherLocation | null {
  const loc = useProfile().data?.weather_location as Partial<WeatherLocation> | null | undefined;
  return loc && typeof loc.lat === "number" && typeof loc.lon === "number" ? { name: loc.name ?? "", lat: loc.lat, lon: loc.lon } : null;
}

export const useTempUnit = (): "C" | "F" => (useProfile().data?.temp_unit === "F" ? "F" : "C");

/**
 * 현재 날씨 + 시간별 + 일별 예보. 지역이 없으면 needsLocation.
 * staleTime 10분. 갱신 실패 시에도 이전 데이터를 유지한다(react-query 기본 동작).
 */
export function useWeather() {
  const loc = useWeatherLocation();
  const q = useQuery({
    queryKey: ["weather", "forecast", loc ? `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}` : "none"],
    queryFn: () => fetchWeather(loc!.lat, loc!.lon),
    enabled: !!loc,
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const w = q.data;
  return {
    current: w?.current, hourly: w?.hourly, daily: w?.daily,
    updatedAt: w?.fetched_at, stale: w?.stale ?? false,
    isLoading: q.isLoading, isError: q.isError, error: q.error as Error | null,
    needsLocation: !loc, location: loc, data: w,
  };
}

/** 캘린더 날짜 셀용(WX-3). 키 'YYYY-MM-DD'. 예보 7일 밖 날짜는 없다. */
export function useDailyWeather(): Map<string, DailyWeather> {
  const { data } = useWeather();
  const unit = useTempUnit();
  return dailyMap(data, unit);
}

/** 미세먼지 등급(WX-6). 서버에 키가 없거나 장애면 null — 호출하는 쪽은 아무것도 그리지 않으면 된다. */
export function useAirQuality() {
  const loc = useWeatherLocation();
  const q = useQuery({
    queryKey: ["weather", "air", loc ? `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}` : "none"],
    queryFn: () => fetchAir(loc!.lat, loc!.lon),
    enabled: !!loc,
    staleTime: 30 * 60_000,
    retry: false,
  });
  return q.data && q.data.enabled && q.data.grade ? q.data : null;
}
