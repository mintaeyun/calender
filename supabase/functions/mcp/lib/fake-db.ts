// 테스트용 가짜 Scoped. 체이닝 가능한 쿼리 빌더이며 await 하면 미리 정한 응답을 돌려준다.
// selects[table] 는 select 호출마다 하나씩 소비되는 응답 큐(없으면 빈 배열), writes 는 insert/update/remove 호출 기록.
export type Write = { table: string; op: "insert" | "update" | "remove"; payload?: unknown; calls: [string, unknown[]][] };

export function fakeScoped(opts: {
  selects?: Record<string, unknown[][]>;
  writeResult?: (w: Write) => { data: unknown; error?: unknown };
  rpc?: (fn: string, args: Record<string, unknown>) => { data: unknown; error?: unknown };
} = {}) {
  const queues = Object.fromEntries(Object.entries(opts.selects ?? {}).map(([k, v]) => [k, [...v]]));
  const writes: Write[] = [];
  const selectCalls: { table: string; columns: string; calls: [string, unknown[]][] }[] = [];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

  // deno-lint-ignore no-explicit-any
  const chain = (resolve: () => { data: unknown; error?: unknown }, calls: [string, unknown[]][]): any => {
    let single = false;
    // deno-lint-ignore no-explicit-any
    const b: any = new Proxy({}, {
      get: (_t, p: string) => {
        if (p === "then") {
          return (res: (v: unknown) => void) => {
            const r = resolve();
            const data = single && Array.isArray(r.data) ? r.data[0] : r.data;
            res({ data, error: r.error ?? null });
          };
        }
        return (...args: unknown[]) => {
          calls.push([p, args]);
          if (p === "single" || p === "maybeSingle") single = true;
          return b;
        };
      },
    });
    return b;
  };

  const db = {
    userId: "user-A",
    select(table: string, columns: string) {
      const calls: [string, unknown[]][] = [];
      selectCalls.push({ table, columns, calls });
      return chain(() => ({ data: queues[table]?.shift() ?? [] }), calls);
    },
    insert(table: string, payload: unknown) {
      const w: Write = { table, op: "insert", payload, calls: [] };
      writes.push(w);
      return chain(() => opts.writeResult?.(w) ?? { data: Array.isArray(payload) ? payload : [payload] }, w.calls);
    },
    update(table: string, payload: unknown) {
      const w: Write = { table, op: "update", payload, calls: [] };
      writes.push(w);
      return chain(() => opts.writeResult?.(w) ?? { data: [{ id: "x" }] }, w.calls);
    },
    remove(table: string) {
      const w: Write = { table, op: "remove", calls: [] };
      writes.push(w);
      return chain(() => opts.writeResult?.(w) ?? { data: [{ id: "x" }] }, w.calls);
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      return chain(() => opts.rpc?.(fn, args) ?? { data: null }, []);
    },
  };
  return { db: db as never, writes, selectCalls, rpcCalls };
}
