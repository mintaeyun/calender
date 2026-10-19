// 토큰 암호화(AES-256-GCM)와 OAuth state 서명(HMAC-SHA256). WebCrypto 만 사용(Deno·Node 공통).
//
// 암호문 형식: `v1.<nonce base64url>.<ciphertext+tag base64url>`  — 앞의 `v1` 은 키 버전이다.
// 키 회전: 새 키를 TOKEN_ENC_KEY_V2 로 추가하고 CURRENT 를 'v2' 로 바꾸면 v1 암호문도 계속 복호화된다.
// 키는 base64(32바이트). `openssl rand -base64 32` 로 만든다. 키·평문 토큰은 어디에도 로그하지 않는다.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export type KeyRing = { current: string; keys: Record<string, Uint8Array> };

/** 환경변수 → 키링. TOKEN_ENC_KEY = v1, TOKEN_ENC_KEY_V2 … 가 있으면 추가, TOKEN_ENC_CURRENT(기본 v1)로 현재 키 선택. */
export function keyRingFromEnv(get: (name: string) => string | undefined): KeyRing {
  const keys: Record<string, Uint8Array> = {};
  const add = (version: string, value: string | undefined) => {
    if (!value) return;
    const raw = Uint8Array.from(atob(value.trim()), (c) => c.charCodeAt(0));
    if (raw.length !== 32) throw new Error(`암호화 키(${version})는 32바이트(base64)여야 합니다.`);
    keys[version] = raw;
  };
  add("v1", get("TOKEN_ENC_KEY"));
  for (const n of [2, 3, 4]) add(`v${n}`, get(`TOKEN_ENC_KEY_V${n}`));
  const current = get("TOKEN_ENC_CURRENT") ?? "v1";
  if (!keys[current]) throw new Error("TOKEN_ENC_KEY 가 설정되지 않았습니다.");
  return { current, keys };
}

const importAes = (raw: Uint8Array) => crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);

export async function encryptToken(plain: string, ring: KeyRing): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAes(ring.keys[ring.current]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, enc.encode(plain)));
  return `${ring.current}.${b64urlEncode(nonce)}.${b64urlEncode(ct)}`;
}

export async function decryptToken(stored: string, ring: KeyRing): Promise<string> {
  const [version, nonce, ct] = stored.split(".");
  const raw = ring.keys[version];
  if (!raw || !nonce || !ct) throw new Error("저장된 토큰 형식을 해석할 수 없습니다.");
  const key = await importAes(raw);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64urlDecode(nonce) as BufferSource }, key, b64urlDecode(ct) as BufferSource);
  return dec.decode(plain);
}

// ---------------------------------------------------------------------------
// OAuth state: 서버 서명(무상태). payload = { u: userId, r: returnTo, e: 만료(초), n: nonce }
// ---------------------------------------------------------------------------
export type StatePayload = { u: string; r: string; e: number; n: string };

async function hmacKey(ring: KeyRing) {
  // 암호화 키와 같은 비밀에서 용도 분리를 위해 접두어를 붙여 파생한다.
  const material = new Uint8Array([...enc.encode("oauth-state:"), ...ring.keys[ring.current]]);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signState(payload: Omit<StatePayload, "n">, ring: KeyRing): Promise<string> {
  const full: StatePayload = { ...payload, n: b64urlEncode(crypto.getRandomValues(new Uint8Array(12))) };
  const body = b64urlEncode(enc.encode(JSON.stringify(full)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(ring), enc.encode(body)));
  return `${body}.${b64urlEncode(sig)}`;
}

export type StateFailure = "missing" | "format" | "signature" | "payload" | "expired" | "error";
export type StateResult = { ok: true; payload: StatePayload } | { ok: false; reason: StateFailure; detail?: string };

/**
 * 서명·만료를 검증하고 실패 이유를 구분해 돌려준다(값 자체는 담지 않는다).
 *  missing=state 없음, format=형식 오류, signature=서명 불일치(키가 다르거나 값이 변형됨), payload=내용 해석 실패,
 *  expired=만료, error=검증 중 예외(detail 에 예외 이름).
 */
export async function verifyStateDetailed(state: string | null | undefined, ring: KeyRing, nowSec: number): Promise<StateResult> {
  if (!state) return { ok: false, reason: "missing" };
  const parts = state.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "format", detail: `parts=${parts.length}` };
  const [body, sig] = parts;
  let valid: boolean;
  try {
    valid = await crypto.subtle.verify("HMAC", await hmacKey(ring), b64urlDecode(sig) as BufferSource, enc.encode(body));
  } catch (e) {
    return { ok: false, reason: "error", detail: e instanceof Error ? e.name : "unknown" };
  }
  if (!valid) return { ok: false, reason: "signature" };
  let p: StatePayload;
  try {
    p = JSON.parse(dec.decode(b64urlDecode(body))) as StatePayload;
  } catch {
    return { ok: false, reason: "payload" };
  }
  if (typeof p.e !== "number" || typeof p.u !== "string" || typeof p.r !== "string") return { ok: false, reason: "payload" };
  if (p.e <= nowSec) return { ok: false, reason: "expired", detail: `late=${nowSec - p.e}s` };
  return { ok: true, payload: p };
}

/** 서명·만료를 검증하고 payload 를 돌려준다. 실패하면 null. */
export async function verifyState(state: string, ring: KeyRing, nowSec: number): Promise<StatePayload | null> {
  const r = await verifyStateDetailed(state, ring, nowSec);
  return r.ok ? r.payload : null;
}
