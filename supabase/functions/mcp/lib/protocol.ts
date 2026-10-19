// Streamable HTTP(stateless, JSON 응답) 위의 JSON-RPC 2.0 처리. 세션 없이 요청마다 독립 처리한다.
// SDK 대신 직접 구현한 이유: 요청마다 상태가 없는 단순 서버이고, Node 에서 단위 테스트가 가능해야 하기 때문.

export const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const SERVER_INFO = { name: "life-manager", version: "0.1.0" };

/** 클라이언트가 모델에 전달하는 서버 안내. ChatGPT 는 앞 512자만 독립적으로 읽으므로 핵심을 앞에 둔다. */
export const SERVER_INSTRUCTIONS =
  "내 일정·할일·가계부(원화)를 조회하고 기록하는 개인 라이프 매니저입니다. 삭제는 되돌리기 어렵거나 불가능하니 반드시 사용자에게 먼저 확인하고 한 번에 하나씩만 하세요. " +
  "카테고리·계좌·프로젝트 이름이 모호하다는 오류가 오면 추측하지 말고 후보를 보여 주며 사용자에게 물어보세요. " +
  "날짜·시각에 시간대가 없으면 사용자 시간대(기본 Asia/Seoul)로 해석됩니다. 금액은 1 이상의 정수(원)이며 지출/수입/이체는 type으로 구분합니다. 반복 일정의 수정·삭제는 웹 앱에서 해야 합니다.";

export type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };
export type RpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string } };

export type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

export type RpcHandlers = {
  listTools(): { name: string; description: string; inputSchema: unknown }[];
  callTool(name: string, args: unknown): Promise<ToolResult>;
};

const err = (id: RpcRequest["id"], code: number, message: string): RpcResponse =>
  ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** 알림(id 없음)이면 null, 아니면 응답. */
export async function handleRpc(msg: unknown, h: RpcHandlers): Promise<RpcResponse | null> {
  if (typeof msg !== "object" || msg === null || (msg as RpcRequest).jsonrpc !== "2.0" || typeof (msg as RpcRequest).method !== "string") {
    return err(null, -32600, "잘못된 JSON-RPC 요청입니다.");
  }
  const req = msg as RpcRequest;
  const isNotification = req.id === undefined;
  const ok = (result: unknown): RpcResponse | null => (isNotification ? null : { jsonrpc: "2.0", id: req.id ?? null, result });

  switch (req.method) {
    case "initialize": {
      const asked = String(req.params?.protocolVersion ?? "");
      const protocolVersion = (SUPPORTED_PROTOCOLS as readonly string[]).includes(asked) ? asked : SUPPORTED_PROTOCOLS[0];
      return ok({ protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: SERVER_INSTRUCTIONS });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: h.listTools() });
    case "tools/call": {
      const name = req.params?.name;
      if (typeof name !== "string") return err(req.id, -32602, "도구 이름(name)이 필요합니다.");
      return ok(await h.callTool(name, req.params?.arguments ?? {}));
    }
    default:
      if (req.method.startsWith("notifications/")) return null;
      return isNotification ? null : err(req.id, -32601, `지원하지 않는 메서드입니다: ${req.method}`);
  }
}
