// get_weather / get_today_overview. 날씨는 05 의 provider·캐시(WeatherAccess)를 통해서만 받는다.
import { ToolError } from "../lib/resolve.ts";
import { todayKey } from "../../_shared/time.ts";
import { must, type Ctx } from "./context.ts";
import { listEvents } from "./events.ts";
import { listTodos } from "./todos.ts";
import { listTransactions, getSummary } from "./ledger.ts";

type Place = { name: string; lat: number; lon: number };

async function profileOf(ctx: Ctx) {
  const rows = must(await ctx.db.select("profiles", "weather_location,temp_unit").limit(1), "프로필") as { weather_location: Place | null; temp_unit: string }[];
  return rows[0] ?? { weather_location: null, temp_unit: "C" };
}

const conv = (c: number, unit: string) => (unit === "F" ? Math.round((c * 9) / 5 + 32) : Math.round(c));

async function resolvePlace(ctx: Ctx, location: string | undefined, saved: Place | null): Promise<Place> {
  if (location) {
    if (!ctx.weather) throw new ToolError("날씨 기능을 사용할 수 없습니다.");
    const found = await ctx.weather.geocode(location);
    if (!found.length) throw new ToolError(`"${location}" 위치를 찾지 못했습니다.`, "도시·동 이름을 다르게 입력해 보세요.");
    const f = found[0];
    return { name: [f.name, f.admin].filter(Boolean).join(", "), lat: f.lat, lon: f.lon };
  }
  if (!saved?.lat || !saved?.lon) throw new ToolError("기본 날씨 지역이 설정되어 있지 않습니다.", "location 을 지정하거나 설정 > 날씨에서 지역을 저장해 달라고 안내해 주세요.");
  return saved;
}

export async function getWeather(ctx: Ctx, a: Record<string, unknown>) {
  if (!ctx.weather) throw new ToolError("날씨 기능을 사용할 수 없습니다.");
  const prof = await profileOf(ctx);
  const place = await resolvePlace(ctx, a.location as string | undefined, prof.weather_location);
  let f;
  try {
    f = await ctx.weather.forecast(place.lat, place.lon);
  } catch {
    throw new ToolError("날씨 정보를 가져올 수 없습니다. 잠시 후 다시 시도해 주세요.");
  }
  const u = prof.temp_unit;
  const cond = (c: { label: string }) => c.label;
  const date = (a.date as string | undefined) ?? todayKey(ctx.tz);
  const day = f.daily.find((d) => d.date === date);
  if (!day) throw new ToolError(`${date} 예보는 제공하지 않습니다.`, `제공 범위: ${f.daily[0]?.date} ~ ${f.daily.at(-1)?.date}`);
  const isToday = date === todayKey(ctx.tz);
  return {
    location: place.name,
    unit: u === "F" ? "°F" : "°C",
    date,
    ...(isToday ? { now: { temp: conv(f.current.temp, u), feels_like: conv(f.current.feelsLike, u), condition: cond(f.current.condition) } } : {}),
    day: { condition: cond(day.condition), temp_max: conv(day.tempMax, u), temp_min: conv(day.tempMin, u), precip_probability_max: day.precipProbMax },
    hourly: f.hourly.filter((h) => h.time.startsWith(date)).map((h) => ({ time: h.time.slice(11, 16), temp: conv(h.temp, u), precip_probability: h.precipProb, condition: cond(h.condition) })),
    stale: f.stale,
  };
}

/** 서비스별 범위가 있는 부분만 모아서 돌려준다. 한 부분이 실패해도 나머지는 돌려준다. */
export async function getTodayOverview(ctx: Ctx, a: Record<string, unknown>) {
  const date = (a.date as string | undefined) ?? todayKey(ctx.tz);
  const out: Record<string, unknown> = { date };
  const skipped: string[] = [];
  const part = async (key: string, allowed: boolean, label: string, fn: () => Promise<unknown>) => {
    if (!allowed) return void skipped.push(`${label}(권한 없음)`);
    try {
      out[key] = await fn();
    } catch (e) {
      out[key] = { error: e instanceof ToolError ? e.message : `${label} 정보를 불러오지 못했습니다.` };
    }
  };
  const readable = (s: string) => s !== "none";
  await Promise.all([
    part("events", readable(ctx.scopes.calendar), "일정", async () => (await listEvents(ctx, { start: date, end: date }) as { events: unknown })),
    part("todos", readable(ctx.scopes.todo), "할일", async () => (await listTodos(ctx, { due_before: date }) as { todos: unknown })),
    part("spending", readable(ctx.scopes.ledger), "지출", async () => {
      const day = await listTransactions(ctx, { start: date, end: date });
      const month = await getSummary(ctx, { month: date.slice(0, 7) });
      return { today_totals: day.totals, month_totals: month.totals, budgets: month.budgets };
    }),
    part("weather", !!ctx.weather, "날씨", async () => getWeather(ctx, { date })),
  ]);
  if (skipped.length) out.skipped = skipped;
  return out;
}
