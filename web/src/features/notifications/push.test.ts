import { describe, expect, it } from "vitest";
import { withoutSub, withSub, type StoredSub } from "./push";

const s = (endpoint: string, auth = "a"): StoredSub => ({ endpoint, keys: { p256dh: "p", auth } });

describe("push subscriptions list", () => {
  it("같은 endpoint는 중복 없이 교체", () => {
    expect(withSub([s("e1"), s("e2")], s("e1", "new"))).toEqual([s("e2"), s("e1", "new")]);
  });
  it("endpoint로 제거", () => {
    expect(withoutSub([s("e1"), s("e2")], "e1")).toEqual([s("e2")]);
    expect(withoutSub([], "x")).toEqual([]);
  });
});
