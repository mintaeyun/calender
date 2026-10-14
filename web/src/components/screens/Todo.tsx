"use client";

import { useState } from "react";
import { L, P, PROJ, R, TODOS } from "@/lib/data";
import { FILTER_LABELS, TODO_FILTERS, todoView, type StatusMap, type TodoFilter } from "@/lib/todo";
import type { Nav } from "../App";
import { Btn, Chip, Pri, Seg, Title, card, col } from "../ui";

export function TodoScreen({ nav, status, toggleTodo }: { nav: Nav; status: StatusMap; toggleTodo: (id: number) => void }) {
  const [view, setView] = useState<"list" | "kanban">("list");
  const [filter, setFilter] = useState<TodoFilter>("today");
  const [selId, setSelId] = useState(2);

  const apply = (k: TodoFilter) => TODOS.filter((t) => TODO_FILTERS[k](t, status));
  const list = apply(filter).map((t) => todoView(t, status));
  const sel = TODOS.find((t) => t.id === selId) ?? TODOS[1];

  return (
    <div style={col(18)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Title sub={FILTER_LABELS.find((f) => f[0] === filter)![1]}>할일</Title>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Chip>정렬 · 마감순</Chip>
          <Seg items={[["list", "목록"], ["kanban", "칸반"]]} cur={view} set={setView} />
          <Btn onClick={() => nav.openQuick("todo")}>할일 추가 +</Btn>
        </div>
      </div>

      {view === "list" ? (
        <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr) 340px", gap: 14, alignItems: "start" }}>
          <div style={col(18)}>
            <div style={col(2)}>
              {FILTER_LABELS.map(([k, label]) => (
                <div key={k} onClick={() => setFilter(k)} style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", padding: "11px 14px", borderRadius: 12, fontSize: 15, background: filter === k ? "#1c1c1f" : "transparent", color: filter === k ? "#fff" : "#b4b4ba" }}>
                  <span>{label}</span><span style={{ fontSize: 13, color: k === "overdue" ? R : "#6c6c73" }}>{apply(k).length}</span>
                </div>
              ))}
            </div>
            <div style={{ ...col(8), padding: "0 14px" }}>
              <span style={{ fontSize: 12, color: "#6c6c73", letterSpacing: "0.06em" }}>프로젝트</span>
              {Object.entries(PROJ).map(([name, c]) => (
                <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#d6d6da", padding: "4px 0" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 3, background: c }} />{name}
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "#6c6c73" }}>{TODOS.filter((t) => t.proj === name && status[t.id] !== "done").length}</span>
                </div>
              ))}
              <span style={{ fontSize: 12, color: "#6c6c73", letterSpacing: "0.06em", marginTop: 10 }}>태그</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {["#집", "#보고", "#여행", "#돈"].map((t) => <span key={t} style={{ fontSize: 12, background: "#1c1c1f", borderRadius: 999, padding: "4px 10px" }}>{t}</span>)}
              </div>
              <span style={{ fontSize: 13, color: "#8d8d94", marginTop: 10 }}>완료 보관함 →</span>
            </div>
          </div>

          <div style={{ ...card, padding: "10px 20px", ...col(0) }}>
            {list.map((t) => (
              <div key={t.id} onClick={() => setSelId(t.id)} style={{ cursor: "pointer", display: "flex", gap: 14, alignItems: "center", padding: "14px 10px", margin: "0 -10px", borderBottom: "1px solid #26262a", borderRadius: 12, background: selId === t.id ? "#232327" : "transparent", opacity: t.op }}>
                <span onClick={(e) => { e.stopPropagation(); toggleTodo(t.id); }} style={{ width: 22, height: 22, borderRadius: "50%", border: `1.5px solid ${t.ring}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>{t.mark}</span>
                <div style={{ flex: 1, ...col(4), minWidth: 0 }}>
                  <span style={{ fontSize: 15, textDecoration: t.deco }}>{t.title}</span>
                  <div style={{ display: "flex", gap: 10, fontSize: 12, color: "#8d8d94", alignItems: "center" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: t.projColor }} />{t.proj}</span>
                    <span>{t.meta}</span>
                  </div>
                </div>
                <Pri pri={t.pri} bg={t.priBg} fg={t.priFg} />
                <span style={{ width: 72, textAlign: "right", fontSize: 13, color: t.dueColor }}>{t.dueLabel}</span>
              </div>
            ))}
            {list.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#6c6c73", fontSize: 15 }}>해당하는 할일이 없어요</div>}
          </div>

          <div style={{ ...card, padding: 22, ...col(16) }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#8d8d94" }}>상세</span><span style={{ fontSize: 13, color: "#8d8d94" }}>일정으로 전환 ↗</span>
            </div>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>{sel.title}</span>
            <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: "10px 12px", fontSize: 14 }}>
              {([["마감일", sel.dueFull], ["우선순위", sel.pri], ["프로젝트", sel.proj], ["태그", sel.tags], ["반복", sel.repeat]] as const).map(([k, v]) => (
                <span key={k} style={{ display: "contents" }}><span style={{ color: "#8d8d94" }}>{k}</span><span>{v}</span></span>
              ))}
            </div>
            <div style={{ ...col(8), borderTop: "1px solid #26262a", paddingTop: 14 }}>
              <span style={{ fontSize: 13, color: "#8d8d94" }}>체크리스트</span>
              {sel.items.length ? sel.items.map(([text, d]) => (
                <div key={text} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, color: d ? "#6c6c73" : "#f2f2f3" }}>
                  <span style={{ width: 16, height: 16, borderRadius: 4, border: "1.5px solid #55555c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>{d ? "✓" : ""}</span>{text}
                </div>
              )) : <div style={{ fontSize: 14, color: "#6c6c73" }}>체크리스트 없음</div>}
              <span style={{ fontSize: 13, color: "#6c6c73" }}>+ 항목 추가</span>
            </div>
            <div style={{ ...col(8), borderTop: "1px solid #26262a", paddingTop: 14 }}>
              <span style={{ fontSize: 13, color: "#8d8d94" }}>메모</span>
              <span style={{ fontSize: 14, color: "#d6d6da", lineHeight: 1.6, textWrap: "pretty" }}>{sel.notes || "메모 없음"}</span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 14, alignItems: "start" }}>
          {([["todo", "대기", "#8d8d94"], ["doing", "진행 중", P], ["done", "완료", L]] as const).map(([k, name, c]) => {
            const cards = TODOS.filter((t) => status[t.id] === k).map((t) => todoView(t, status));
            return (
              <div key={k} style={{ background: "#111113", borderRadius: 22, padding: 16, ...col(10), minHeight: 520 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px 4px" }}>
                  <span style={{ fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />{name}</span>
                  <span style={{ fontSize: 13, color: "#8d8d94" }}>{cards.length}</span>
                </div>
                {cards.map((t) => (
                  <div key={t.id} style={{ background: "#1c1c20", borderRadius: 16, padding: 14, ...col(10), cursor: "grab", opacity: t.op }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, textDecoration: t.deco }}>{t.title}</span>
                      <Pri pri={t.pri} bg={t.priBg} fg={t.priFg} size={11} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#8d8d94" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: t.projColor }} />{t.proj}{t.meta && ` · ${t.meta}`}</span>
                      <span style={{ color: t.dueColor }}>{t.dueLabel}</span>
                    </div>
                  </div>
                ))}
                <span style={{ fontSize: 13, color: "#6c6c73", padding: "6px 4px" }}>+ 추가</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
