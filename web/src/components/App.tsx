"use client";

import { useState } from "react";
import { P, TODOS } from "@/lib/data";
import type { StatusMap } from "@/lib/todo";
import { display } from "./ui";
import { Login } from "./screens/Login";
import { Dashboard } from "./screens/Dashboard";
import { Calendar } from "./screens/Calendar";
import { TodoScreen } from "./screens/Todo";
import { Ledger } from "./screens/Ledger";
import { Notifications, Search } from "./screens/Misc";
import { Settings } from "./screens/Settings";
import { QuickAdd, type QuickKind } from "./screens/QuickAdd";

export type Page = "login" | "dash" | "cal" | "todo" | "ledger" | "settings" | "noti" | "search";
const NAV: [Page, string][] = [["dash", "대시보드"], ["cal", "일정"], ["todo", "할일"], ["ledger", "가계부"], ["settings", "설정"]];

export type Nav = { go: (p: Page) => void; openQuick: (k: QuickKind) => void };

export function App() {
  const [page, setPage] = useState<Page>("dash");
  const [quick, setQuick] = useState<QuickKind | null>(null);
  const [read, setRead] = useState(false);
  const [status, setStatus] = useState<StatusMap>(() => Object.fromEntries(TODOS.map((t) => [t.id, t.status])));

  const toggleTodo = (id: number) => setStatus((s) => ({ ...s, [id]: s[id] === "done" ? "todo" : "done" }));
  const nav: Nav = { go: setPage, openQuick: setQuick };
  const unread = read ? 0 : 3;

  if (page === "login") return <Login onEnter={() => setPage("dash")} />;

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#f2f2f3" }}>
      <div style={{ maxWidth: 1340, margin: "0 auto", padding: "26px 28px 48px", display: "flex", flexDirection: "column", gap: 24 }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div onClick={() => setPage("dash")} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: P }} />
            <span style={{ fontSize: 20, ...display, letterSpacing: 0 }}>라이프 매니저</span>
          </div>
          <nav style={{ display: "flex", gap: 6, fontSize: 15 }}>
            {NAV.map(([k, label]) => (
              <span key={k} onClick={() => setPage(k)} style={{ cursor: "pointer", background: page === k ? "#fff" : "#1c1c1f", color: page === k ? "#000" : "#b4b4ba", fontWeight: page === k ? 600 : 400, padding: "10px 20px", borderRadius: 999, whiteSpace: "nowrap" }}>
                {label}
              </span>
            ))}
          </nav>
          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
            <span onClick={() => setPage("search")} style={{ cursor: "pointer", background: "#1c1c1f", borderRadius: 999, padding: "10px 16px", fontSize: 14, color: "#b4b4ba", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 12, height: 12, border: "2px solid #b4b4ba", borderRadius: "50%" }} />검색
            </span>
            <span onClick={() => setPage("noti")} style={{ cursor: "pointer", background: "#1c1c1f", borderRadius: 999, padding: "10px 16px", fontSize: 14, color: "#d6d6da", display: "flex", alignItems: "center", gap: 8 }}>
              알림
              {unread > 0 && <span style={{ background: "oklch(0.65 0.2 25)", color: "#fff", fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "1px 7px" }}>{unread}</span>}
            </span>
            <div onClick={() => setPage("login")} title="로그아웃" style={{ cursor: "pointer", width: 42, height: 42, borderRadius: "50%", background: "#3a3a40" }} />
          </div>
        </header>

        {page === "dash" && <Dashboard nav={nav} status={status} toggleTodo={toggleTodo} />}
        {page === "cal" && <Calendar nav={nav} />}
        {page === "todo" && <TodoScreen nav={nav} status={status} toggleTodo={toggleTodo} />}
        {page === "ledger" && <Ledger nav={nav} />}
        {page === "noti" && <Notifications read={read} readAll={() => setRead(true)} />}
        {page === "search" && <Search />}
        {page === "settings" && <Settings />}
      </div>
      {quick && <QuickAdd kind={quick} setKind={setQuick} onClose={() => setQuick(null)} />}
    </div>
  );
}
