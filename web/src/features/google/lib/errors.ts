// google_connections.last_error 분류. 형식: "<code>: <message>" (gcal-sync 함수가 기록).
// 토큰 만료·권한 철회처럼 사용자가 다시 연결해야 하는 오류를 구분해 한국어 안내와 재연결 버튼 여부를 정한다.

export type GoogleErrorInfo = {
  kind: "reconnect" | "permission" | "config" | "other";
  title: string;
  hint: string;
  /** 재연결 버튼을 보여줄지 */
  reconnect: boolean;
};

export function classifyGoogleError(lastError: string | null | undefined): GoogleErrorInfo | null {
  if (!lastError) return null;
  const code = lastError.split(":")[0].trim();
  switch (code) {
    case "invalid_grant":
      return {
        kind: "reconnect", reconnect: true,
        title: "Google 연결이 만료되었거나 권한이 철회되었어요",
        hint: "다시 연결하면 바로 동기화됩니다. Google OAuth 동의 화면이 '테스트' 상태면 연결이 7일 뒤 만료되니, 프로덕션(미검증) 상태로 전환해 두면 반복되지 않아요.",
      };
    case "unauthorized":
      return { kind: "reconnect", reconnect: true, title: "Google 인증이 거부되었어요", hint: "다시 연결해 주세요." };
    case "forbidden":
      return {
        kind: "permission", reconnect: true,
        title: "Google 캘린더 접근 권한이 없어요",
        hint: "연결할 때 캘린더 권한을 모두 허용해야 해요. 다시 연결하면서 권한을 허용해 주세요.",
      };
    case "invalid_client":
      return { kind: "config", reconnect: false, title: "Google OAuth 설정에 문제가 있어요", hint: "서버의 Google 클라이언트 ID/secret 설정을 확인해야 해요." };
    default:
      return { kind: "other", reconnect: false, title: "동기화 중 오류가 발생했어요", hint: "잠시 후 다시 시도해 주세요. 계속되면 다시 연결해 보세요." };
  }
}

/** OAuth 콜백에서 돌아올 때의 ?google= 값 → 안내 문구 */
export function oauthReturnMessage(status: string | null): { ok: boolean; text: string } | null {
  switch (status) {
    case "connected": return { ok: true, text: "Google 계정을 연결했어요. 일정을 가져오는 중입니다." };
    case "no_target": return { ok: false, text: "Google 계정은 연결했지만 'mycal' 캘린더를 찾지 못했어요. Google 캘린더에서 이름이 mycal 인 캘린더를 만들거나 이름을 확인한 뒤 '목록 새로고침'을 눌러 주세요." };
    case "denied": return { ok: false, text: "Google 연결을 취소했어요." };
    case "no_refresh": return { ok: false, text: "Google에서 장기 연결 권한을 받지 못했어요. Google 계정의 앱 접근 권한에서 이 앱을 제거한 뒤 다시 연결해 주세요." };
    case "error": return { ok: false, text: "Google 연결 중 오류가 발생했어요. 다시 시도해 주세요." };
    default: return null;
  }
}

/** "오늘 13:32" / "10월 13일 13:32" / "아직 동기화 전" */
export function lastSyncedLabel(iso: string | null | undefined, now: Date, tz: string): string {
  if (!iso) return "아직 동기화 전";
  const d = new Date(iso);
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
  const time = new Intl.DateTimeFormat("ko-KR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  if (day(d) === day(now)) return `오늘 ${time}`;
  const [, m, dd] = day(d).split("-");
  return `${+m}월 ${+dd}일 ${time}`;
}

/** 앱 진입 시 자동 동기화를 해야 하는지: 마지막 동기화가 intervalMs 보다 오래됐고, 재연결이 필요한 오류 상태가 아닐 때 */
export function shouldAutoSync(c: { last_synced_at: string | null; last_error: string | null }, now: Date, intervalMs = 5 * 60_000): boolean {
  if (classifyGoogleError(c.last_error)?.reconnect) return false;
  if (!c.last_synced_at) return true;
  return now.getTime() - new Date(c.last_synced_at).getTime() > intervalMs;
}

/** 동기화 대상 캘린더 이름 (gcal-sync 함수의 target.ts 와 같은 규칙) */
export const TARGET_CALENDAR_NAME = "mycal";
export const isTargetCalendar = (name: string | null | undefined) =>
  (name ?? "").replace(/s+/g, "").toLowerCase() === TARGET_CALENDAR_NAME;
