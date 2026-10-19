// tools/call 파이프라인: 도구 조회 → 범위 재검증 → 입력 검증 → 실행 → 오류 정리. 로그 기록은 호출 측(index.ts)이 한다.
import { TOOLS, toolAllowed, type Scopes, type ToolDef } from "./tools-schema.ts";
import { validate } from "./validate.ts";
import { ToolError } from "./resolve.ts";
import type { ToolResult } from "./protocol.ts";

export type ToolHandler<Ctx> = (ctx: Ctx, args: Record<string, unknown>) => Promise<unknown>;
export type CallStatus = "ok" | "error" | "denied";
export type CallOutcome = { result: ToolResult; status: CallStatus; error?: string; tool?: ToolDef };

const text = (t: string, isError = false): ToolResult => ({ content: [{ type: "text", text: t }], ...(isError ? { isError: true } : {}) });

export async function callTool<Ctx>(
  name: string,
  args: unknown,
  scopes: Scopes,
  ctx: Ctx,
  handlers: Record<string, ToolHandler<Ctx>>,
): Promise<CallOutcome> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    const e = `알 수 없는 도구입니다: ${name}`;
    return { result: text(e, true), status: "error", error: e };
  }
  if (!toolAllowed(tool, scopes)) {
    const e = "이 토큰에는 해당 도구를 사용할 권한이 없습니다. 설정 > MCP 에서 범위를 확인해 주세요.";
    return { result: text(e, true), status: "denied", error: e, tool };
  }
  const input = args ?? {};
  const problems = validate(tool.inputSchema, input, "입력");
  if (problems.length) {
    const e = `입력이 올바르지 않습니다.\n- ${problems.join("\n- ")}`;
    return { result: text(e, true), status: "error", error: e, tool };
  }
  const handler = handlers[name];
  if (!handler) {
    const e = `아직 지원하지 않는 도구입니다: ${name}`;
    return { result: text(e, true), status: "error", error: e, tool };
  }
  try {
    const data = await handler(ctx, input as Record<string, unknown>);
    return { result: text(JSON.stringify(data, null, 2)), status: "ok", tool };
  } catch (e) {
    if (e instanceof ToolError) {
      const msg = e.hint ? `${e.message}\n힌트: ${e.hint}` : e.message;
      return { result: text(msg, true), status: "error", error: e.message, tool };
    }
    console.error(`tool ${name} failed`, e); // 내부 오류 상세는 서버 로그에만
    const msg = "도구 실행 중 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
    return { result: text(msg, true), status: "error", error: "internal", tool };
  }
}

/** 로그용 입력 요약: 값이 긴 필드는 잘라 저장하고 전체 payload 는 남기지 않는다. */
export function summarizeInput(args: unknown, maxLen = 200): string {
  if (typeof args !== "object" || args === null) return "";
  const parts = Object.entries(args as Record<string, unknown>).map(([k, v]) => {
    const s = typeof v === "string" ? (v.length > 30 ? v.slice(0, 30) + "…" : v) : JSON.stringify(v);
    return `${k}=${s}`;
  });
  const out = parts.join(", ");
  return out.length > maxLen ? out.slice(0, maxLen) + "…" : out;
}
