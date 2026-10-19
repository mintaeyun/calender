// 이름 또는 ID로 category/account/project 해석 (순수 로직). 모호하거나 없으면 후보를 담은 오류.

export type Named = { id: string; name: string };
export type ResolveKind = "카테고리" | "계좌" | "프로젝트" | "캘린더";

export class ToolError extends Error {
  hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.name = "ToolError";
    this.hint = hint;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (s: string): boolean => UUID_RE.test(s);

const norm = (s: string): string => s.normalize("NFC").replace(/\s+/g, "").toLowerCase();

export function resolveNamed(kind: ResolveKind, input: string, items: Named[]): Named {
  const raw = input.trim();
  if (!raw) throw new ToolError(`${kind} 값이 비어 있습니다.`);

  if (isUuid(raw)) {
    const byId = items.find((i) => i.id.toLowerCase() === raw.toLowerCase());
    if (byId) return byId;
    throw new ToolError(`${kind} ID "${raw}"를 찾을 수 없습니다.`, candidatesHint(items));
  }

  const key = norm(raw);
  const exact = items.filter((i) => norm(i.name) === key);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    throw new ToolError(
      `${kind} "${raw}"가 여러 개입니다. 후보: ${exact.map((i) => `${i.name}(${i.id})`).join(", ")}`,
      "ID로 다시 지정해 주세요.",
    );
  }

  // 부분 일치는 추측하지 않고 후보로만 제시한다.
  const partial = items.filter((i) => norm(i.name).includes(key) || key.includes(norm(i.name)));
  const shown = partial.length ? partial : items;
  throw new ToolError(
    `${kind} "${raw}"를 찾을 수 없습니다. 후보: ${shown.map((i) => i.name).join(", ") || "(없음)"}`,
    "후보 중 하나의 이름 또는 ID로 다시 호출해 주세요.",
  );
}

function candidatesHint(items: Named[]): string {
  return items.length ? `후보: ${items.map((i) => `${i.name}(${i.id})`).join(", ")}` : "등록된 항목이 없습니다.";
}
