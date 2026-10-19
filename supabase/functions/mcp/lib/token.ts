// 토큰 생성·해시·헤더 파싱 (MCP-2). 원문은 발급 응답에서만 1회 반환하고 어디에도 저장·로그하지 않는다.

export const TOKEN_PREFIX = "lm_";

const b64url = (bytes: Uint8Array): string => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type NewToken = { raw: string; hash: string; prefix: string };

// lm_ + 256비트 랜덤(base64url). prefix 는 목록 식별용 앞 7자(예: 'lm_ab12').
export async function generateToken(): Promise<NewToken> {
  const raw = TOKEN_PREFIX + b64url(crypto.getRandomValues(new Uint8Array(32)));
  return { raw, hash: await sha256Hex(raw), prefix: raw.slice(0, 7) };
}

/** `Authorization: Bearer lm_…` 에서 토큰 원문을 꺼낸다. 형식이 다르면 null. */
export function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m && m[1].startsWith(TOKEN_PREFIX) && m[1].length <= 200 ? m[1] : null;
}

/** 상수 시간 문자열 비교(길이가 같은 해시 hex 용). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
