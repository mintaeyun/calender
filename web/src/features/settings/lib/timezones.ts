const FALLBACK = ["Asia/Seoul", "Asia/Tokyo", "Asia/Shanghai", "Asia/Singapore", "America/Los_Angeles", "America/New_York", "Europe/London", "Europe/Paris", "UTC"];

/** IANA 시간대 목록(브라우저 지원 시 전체, 아니면 주요 시간대). */
export function listTimezones(): string[] {
  const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  const all = fn ? fn("timeZone") : FALLBACK;
  return all.includes("UTC") ? all : [...all, "UTC"];
}

/** 'Asia/Seoul (UTC+9)' */
export function tzLabel(tz: string, at = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "";
    return `${tz} (${part.replace("GMT", "UTC") || "UTC"})`;
  } catch {
    return tz;
  }
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
