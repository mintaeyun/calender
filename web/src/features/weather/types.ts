// `weather` Edge Function 응답(정규화 스키마). supabase/functions/weather/provider.ts·service.ts 와 같은 모양이다.
// 한쪽을 바꾸면 다른 쪽도 바꾼다(Edge는 web/ 밖을 import 할 수 없어 복사본을 둔다).

export type WeatherIcon = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "thunder";
export type Condition = { icon: WeatherIcon; label: string };

export type WeatherData = {
  current: { temp: number; feelsLike: number; condition: Condition };
  /** 현재 시각부터 24시간. time 은 예보 지역의 현지 시각 'YYYY-MM-DDTHH:mm' */
  hourly: { time: string; temp: number; precipProb: number; condition: Condition }[];
  /** 오늘부터 7일. date 는 'YYYY-MM-DD' */
  daily: { date: string; tempMax: number; tempMin: number; precipProbMax: number; condition: Condition }[];
  /** 예보를 받아온 시각(ISO) */
  fetched_at: string;
  /** 외부 장애로 오래된 캐시를 대신 보여주는 중이면 true */
  stale: boolean;
  location_key: string;
};

export type GeocodeResult = { name: string; admin: string; country: string; lat: number; lon: number };

/** profiles.weather_location */
export type WeatherLocation = { name: string; lat: number; lon: number };

/** 캘린더 날짜 셀용 요약 */
export type DailyWeather = { icon: WeatherIcon; label: string; text: string };
