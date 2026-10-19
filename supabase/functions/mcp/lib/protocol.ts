// Streamable HTTP(stateless, JSON 응답) 위의 JSON-RPC 2.0 처리. 세션 없이 요청마다 독립 처리한다.
// SDK 대신 직접 구현한 이유: 요청마다 상태가 없는 단순 서버이고, Node 에서 단위 테스트가 가능해야 하기 때문.

export const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const SERVER_INFO = { name: "life-manager", version: "0.1.0" };

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
      return ok({ protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO });
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
