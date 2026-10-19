import type { Scoped } from "../lib/scoped.ts";
import { ToolError } from "../lib/resolve.ts";
import type { Scopes } from "../lib/tools-schema.ts";

/** 날씨 제공처 접근(index.ts 에서 weather/deps.ts 로 주입, 테스트에서는 가짜). */
export type WeatherAccess = {
  forecast(lat: number, lon: number): Promise<{
    current: { temp: number; feelsLike: number; condition: { icon: string; label: string } };
    hourly: { time: string; temp: number; precipProb: number; condition: { icon: string; label: string } }[];
    daily: { date: string; tempMax: number; tempMin: number; precipProbMax: number; condition: { icon: string; label: string } }[];
    stale: boolean;
  }>;
  geocode(q: string): Promise<{ name: string; admin: string; lat: number; lon: number }[]>;
};

export type Ctx = { db: Scoped; tz: string; scopes: Scopes; weather?: WeatherAccess };

export const PAGE_SIZE = 100;

/** supabase 응답의 error 를 ToolError 로 바꾼다(내부 SQL·스택은 노출하지 않음). */
export function must<T>(res: { data: T | null; error: unknown }, what: string): T {
  if (res.error) {
    console.error(`${what} 조회 실패`, res.error);
    throw new ToolError(`${what}을(를) 불러오지 못했습니다.`);
  }
  return (res.data ?? []) as T;
}

/** 수정·삭제 대상 한 건을 id 로 찾는다(없으면 ToolError). 다른 사용자의 id 도 같은 오류를 돌려준다. */
export function one<T>(rows: T[] | null, what: string): T {
  if (!rows?.length) throw new ToolError(`${what}을(를) 찾을 수 없습니다.`, "id 를 확인하거나 list 도구로 다시 조회해 주세요.");
  return rows[0];
}
