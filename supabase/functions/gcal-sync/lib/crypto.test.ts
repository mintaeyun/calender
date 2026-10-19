import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken, keyRingFromEnv, signState, verifyState } from "./crypto.ts";

const k = (n: number) => btoa(String.fromCharCode(...new Uint8Array(32).fill(n)));
const ring = keyRingFromEnv((name) => ({ TOKEN_ENC_KEY: k(1) } as Record<string, string>)[name]);

describe("token encryption", () => {
  it("암호화 후 복호화하면 원문, 매번 다른 암호문, 버전 접두사", async () => {
    const a = await encryptToken("1//refresh-token", ring);
    const b = await encryptToken("1//refresh-token", ring);
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(a).not.toContain("refresh");
    expect(await decryptToken(a, ring)).toBe("1//refresh-token");
  });

  it("변조하면 복호화 실패", async () => {
    const a = await encryptToken("secret", ring);
    const parts = a.split(".");
    parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
    await expect(decryptToken(parts.join("."), ring)).rejects.toBeDefined();
  });

  it("키 회전: 옛 키 암호문도 풀고 새 암호문은 새 버전", async () => {
    const old = await encryptToken("tok", ring);
    const rotated = keyRingFromEnv((n) => ({ TOKEN_ENC_KEY: k(1), TOKEN_ENC_KEY_V2: k(2), TOKEN_ENC_CURRENT: "v2" } as Record<string, string>)[n]);
    expect(await decryptToken(old, rotated)).toBe("tok");
    expect((await encryptToken("tok", rotated)).startsWith("v2.")).toBe(true);
  });

  it("키가 없거나 길이가 틀리면 오류", () => {
    expect(() => keyRingFromEnv(() => undefined)).toThrow();
    expect(() => keyRingFromEnv((n) => (n === "TOKEN_ENC_KEY" ? btoa("short") : undefined))).toThrow();
  });
});

describe("oauth state", () => {
  it("서명·만료 검증", async () => {
    const s = await signState({ u: "user-1", r: "http://localhost:3000", e: 2000 }, ring);
    expect((await verifyState(s, ring, 1000))?.u).toBe("user-1");
    expect(await verifyState(s, ring, 3000)).toBeNull(); // 만료
  });
  it("변조·다른 키는 거부", async () => {
    const s = await signState({ u: "user-1", r: "x", e: 2000 }, ring);
    const [body, sig] = s.split(".");
    const forged = btoa(JSON.stringify({ u: "attacker", r: "x", e: 2000, n: "n" })).replace(/=+$/, "");
    expect(await verifyState(`${forged}.${sig}`, ring, 1000)).toBeNull();
    const other = keyRingFromEnv((n) => (n === "TOKEN_ENC_KEY" ? k(9) : undefined));
    expect(await verifyState(s, other, 1000)).toBeNull();
    expect(await verifyState(`${body}`, ring, 1000)).toBeNull();
  });
});
