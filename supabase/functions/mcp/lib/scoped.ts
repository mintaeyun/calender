// service role 클라이언트는 RLS를 우회하므로, 모든 쿼리의 시작점에서 user_id 조건을 강제하는 래퍼 (MCP-4).
// 도구 코드는 db.from()을 직접 쓰지 말고 반드시 scoped(...)를 통해서만 접근한다.

export const SCOPED_TABLES = [
  "calendars", "events", "event_reminders", "todo_projects", "todos", "todo_items",
  "accounts", "categories", "transactions", "budgets", "account_balances", "profiles", "weather_cache",
] as const;
export type ScopedTable = (typeof SCOPED_TABLES)[number];

// deno-lint-ignore no-explicit-any
type AnyDb = any;

export const SCOPED_RPCS = ["complete_todo", "budget_usage"] as const;
export type ScopedRpc = (typeof SCOPED_RPCS)[number];

export type Scoped = {
  userId: string;
  /** 허용된 DB 함수만 호출하고 p_user 를 서버 값으로 강제한다. */
  rpc(fn: ScopedRpc, args: Record<string, unknown>): AnyDb;
  /** select(...).eq('user_id', userId) 를 돌려준다. 이어서 필터를 체이닝한다. */
  select(table: ScopedTable, columns: string, opts?: { count?: "exact" }): AnyDb;
  /** user_id 를 서버 값으로 덮어써서 insert. 호출자가 넘긴 user_id 는 무시한다. */
  insert(table: ScopedTable, row: Record<string, unknown> | Record<string, unknown>[]): AnyDb;
  /** user_id 변경은 막고, update(...).eq('user_id', userId) 를 돌려준다. */
  update(table: ScopedTable, patch: Record<string, unknown>): AnyDb;
  /** delete().eq('user_id', userId) 를 돌려준다. 호출 측은 반드시 .eq('id', …) 단건 조건을 붙인다. */
  remove(table: ScopedTable): AnyDb;
};

export function scoped(db: AnyDb, userId: string): Scoped {
  if (!userId) throw new Error("scoped: userId 가 필요합니다.");
  const check = (t: string) => {
    if (!(SCOPED_TABLES as readonly string[]).includes(t)) throw new Error(`scoped: 허용되지 않은 테이블 ${t}`);
  };
  return {
    userId,
    rpc(fn, args) {
      if (!(SCOPED_RPCS as readonly string[]).includes(fn)) throw new Error(`scoped: 허용되지 않은 함수 ${fn}`);
      return db.rpc(fn, { ...args, p_user: userId });
    },
    select(table, columns, opts) {
      check(table);
      return db.from(table).select(columns, opts).eq("user_id", userId);
    },
    insert(table, row) {
      check(table);
      return db.from(table).insert(Array.isArray(row) ? row.map((r) => ({ ...r, user_id: userId })) : { ...row, user_id: userId });
    },
    update(table, patch) {
      check(table);
      const { user_id: _ignored, id: _id, ...rest } = patch;
      return db.from(table).update(rest).eq("user_id", userId);
    },
    remove(table) {
      check(table);
      return db.from(table).delete().eq("user_id", userId);
    },
  };
}
