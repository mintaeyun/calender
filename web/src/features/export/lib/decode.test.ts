import { describe, expect, it } from "vitest";
import { decodeCsvBytes } from "./decode";

const buf = (bytes: number[]) => new Uint8Array(bytes).buffer;

describe("decodeCsvBytes", () => {
  it("UTF-8 (BOM 포함)", () => {
    const utf8 = new TextEncoder().encode("﻿날짜,금액");
    expect(decodeCsvBytes(utf8.buffer.slice(utf8.byteOffset, utf8.byteOffset + utf8.byteLength) as ArrayBuffer).replace("﻿", "")).toBe("날짜,금액");
  });
  it("UTF-8 로 읽히지 않으면 CP949(EUC-KR)로 읽는다", () => {
    // '가나' in CP949: B0 A1 B3 AA
    expect(decodeCsvBytes(buf([0xb0, 0xa1, 0xb3, 0xaa]))).toBe("가나");
  });
});
