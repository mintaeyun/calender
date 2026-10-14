"use client";

import { useState } from "react";
import { CATC, L, P, R, TODOS, TX, fmt } from "@/lib/data";
import { todoView, type StatusMap } from "@/lib/todo";
import type { Nav } from "../App";
import { Btn, card, col, display } from "../ui";

const HEAT_PAL = ["#221d33", "#2a2340", "#4b3aa0", "#7350e6", "#a68cf5"];
const HEAT = [[2, 1, 1, 3, 1, 0, 0], [1, 2, 3, 2, 3, 0, 0], [1, 3, 2, 3, 3, 1, 0], [2, 2, 4, 3, 2, 0, 1], [1, 1, 1, 2, 4, 2, 1], [0, 1, 2, 1, 2, 3, 2]];
const HEAT_LABELS = ["09시", "12시", "15시", "17시", "19시", "21시"];

const WORK_DAYS: [string, string, number, [string, string][], [string, number][]][] = [
  ["월", "10/12", 2, [["09:30", "스탠드업"], ["14:00", "기획 리뷰"]], [["✓ 기획 리뷰 자료 정리", 1], ["✓ 경비 정산 제출", 1]]],
  ["화", "10/13", 1.5, [["09:30", "스탠드업"], ["11:00", "1:1 미팅"]], [["관리비 이체 · 초과", 2]]],
  ["수", "10/14", 0.5, [["09:30", "스탠드업"], ["13:40–", "집중 작업 가능"]], [["분기 보고서 초안 · 오늘", 3]]],
  ["목", "10/15", 3.5, [["09:30", "스탠드업"], ["10:00", "분기 보고 회의"], ["16:00", "외부 미팅 · 판교"]], [["회의 자료 출력", 0]]],
  ["금", "10/16", 0.5, [["09:30", "스탠드업"]], [["세금계산서 발행", 0], ["주간 회고 작성", 0]]],
  ["토", "10/17", 0, [], [["업무 없음", 4]]],
  ["일", "10/18", 0, [], [["업무 없음", 4]]],
];
const TODO_COLORS = ["#d6d6da", "#8d8d94", R, L, "#6c6c73"];

function Panel({ title, right, children, gap = 12 }: { title: string; right?: React.ReactNode; children: React.ReactNode; gap?: number }) {
  return (
    <div style={{ ...card, padding: 20, ...col(gap) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

export function Dashboard({ nav, status, toggleTodo }: { nav: Nav; status: StatusMap; toggleTodo: (id: number) => void }) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const dashTodos = TODOS.filter((t) => t.id <= 4).map((t) => todoView(t, status));
  const doneCount = dashTodos.filter((t) => t.done).length;

  const budget: [string, string, string, string, number][] = [
    ["650,000", "40%", "주거", "solid", 650], ["482,000", "29%", "식비", "dash1", 482], ["214,000", "13%", "쇼핑", "dash2", 214],
  ];

  return (
    <div style={col(22)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 38, ...display }}>좋은 오후예요, <span style={{ color: "#8d8d94", whiteSpace: "nowrap" }}>10월 14일 수요일</span></div>
        <span style={{ background: "#1c1c1f", borderRadius: 999, padding: "10px 16px", fontSize: 14, color: "#d6d6da" }}>
          18° 맑음 · 체감 17° · <span style={{ color: L }}>19시 비 60%</span>
        </span>
      </div>

      <div style={{ display: "flex", gap: 28, minHeight: 200, flexWrap: "wrap" }}>
        <div style={{ width: 330, ...col(10) }}>
          <div style={{ fontSize: 15, color: "#b4b4ba" }}>10월 지출</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 52, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>1,642,300</span>
            <span style={{ fontSize: 30, fontWeight: 600, color: "#6c6c73" }}>원</span>
            <span style={{ fontSize: 13, color: L }}>+8.2%</span>
          </div>
          <div style={{ fontSize: 14, color: "#b4b4ba" }}>남은 예산 <span style={{ color: "#fff", fontWeight: 600 }}>557,700원</span> · 잔액 2,207,700원</div>
          <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
            <Btn onClick={() => nav.openQuick("tx")} style={{ padding: "11px 18px" }}>지출 추가 ↓</Btn>
            <Btn onClick={() => nav.openQuick("ev")} style={{ padding: "11px 18px" }}>일정 추가 +</Btn>
            <Btn ghost onClick={() => nav.openQuick("todo")} style={{ padding: "11px 18px" }}>할일 +</Btn>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 520, ...col(8) }}>
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "650fr 482fr 214fr 557fr", position: "relative" }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: 46, borderTop: "1px dashed #4a4a50" }} />
            {budget.map(([amt, pct, name, kind]) => (
              <div key={name} style={{ borderLeft: "1px solid #2e2e33", padding: "0 12px", ...col(10), justifyContent: "flex-end" }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: "auto", paddingTop: 60 }}>{amt}</div>
                <div style={{ fontSize: 13, color: "#b4b4ba" }}><span style={{ color: "#fff", fontWeight: 600 }}>{pct}</span> {name}</div>
                <div style={{ height: 46, ...(kind === "solid" ? { background: P, borderRadius: 8 } : { background: `repeating-linear-gradient(90deg,${kind === "dash1" ? "oklch(0.6 0.2 290)" : "oklch(0.42 0.15 290)"} 0 8px,transparent 8px 14px)` }) }} />
              </div>
            ))}
            <div style={{ borderLeft: "1px dashed #3a3a40", padding: "0 12px", ...col(10), justifyContent: "flex-end" }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: "auto", paddingTop: 62, color: "#8d8d94" }}>557,700</div>
              <div style={{ fontSize: 13, color: "#8d8d94" }}>남은 예산 · 일 32,800원</div>
              <div style={{ height: 46, border: "1px dashed #3a3a40", borderRadius: 8 }} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#b4b4ba" }}>
            <span>10월 1일</span><span>예산 2,200,000원 중 74.6% · 점선 = 80% 알림선</span><span>10월 31일</span>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: 12 }}>
        <Panel title="오늘의 일정" right={<span onClick={() => nav.go("cal")} style={{ cursor: "pointer", width: 30, height: 30, borderRadius: "50%", background: "#2a2a2e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>↗</span>}>
          <div style={{ ...col(6), fontSize: 14 }}>
            <div style={{ display: "flex", gap: 12, padding: "6px 0", color: "#6c6c73" }}><span style={{ width: 40 }}>09:30</span><span>팀 스탠드업 · G</span></div>
            <div style={{ display: "flex", gap: 12, padding: "6px 0", color: "#6c6c73" }}><span style={{ width: 40 }}>12:00</span><span>점심 약속 · 성수</span></div>
            <div style={{ ...col(4), padding: "12px 14px", background: L, color: "#0b0b0c", borderRadius: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>다음 · 1시간 20분 후</span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>15:00 치과 정기검진</span>
              <span style={{ fontSize: 12 }}>강남역 3번 출구</span>
            </div>
            <div style={{ display: "flex", gap: 12, padding: "6px 0" }}><span style={{ width: 40, color: "#b4b4ba" }}>19:30</span><span style={{ flex: 1 }}>러닝 크루</span><span style={{ color: L, fontSize: 12 }}>비 60%</span></div>
          </div>
        </Panel>

        <Panel title="오늘의 할일" gap={6} right={<span onClick={() => nav.go("todo")} style={{ cursor: "pointer", fontSize: 13, color: "#b4b4ba", background: "#2a2a2e", padding: "4px 10px", borderRadius: 999 }}>{doneCount} / 4</span>}>
          {dashTodos.map((t) => (
            <div key={t.id} onClick={() => toggleTodo(t.id)} style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer", padding: "9px 0", borderBottom: "1px solid #26262a", opacity: t.op }}>
              <span style={{ width: 20, height: 20, borderRadius: "50%", border: `1.5px solid ${t.ring}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0 }}>{t.mark}</span>
              <span style={{ flex: 1, fontSize: 14, textDecoration: t.deco }}>{t.title}</span>
              <span style={{ fontSize: 12, color: t.dueColor }}>{t.short}</span>
            </div>
          ))}
        </Panel>

        <Panel title="이번 주 일정 밀도" right={<span style={{ fontSize: 12, color: "#8d8d94" }}>빈 시간 찾기</span>} gap={10}>
          <div style={{ display: "grid", gridTemplateColumns: "34px repeat(7,1fr)", gap: 4, fontSize: 11, color: "#8d8d94", textAlign: "center" }}>
            <span />{["월", "화", "수", "목", "금", "토", "일"].map((d) => <span key={d} style={d === "수" ? { color: "#fff", fontWeight: 700 } : undefined}>{d}</span>)}
          </div>
          {HEAT.map((cells, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "34px repeat(7,1fr)", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#8d8d94" }}>{HEAT_LABELS[i]}</span>
              {cells.map((v, j) => <div key={j} style={{ height: 22, borderRadius: 6, background: HEAT_PAL[v] }} />)}
            </div>
          ))}
        </Panel>

        <Panel title="최근 거래" gap={4} right={<span onClick={() => nav.go("ledger")} style={{ cursor: "pointer", fontSize: 12, color: "#8d8d94" }}>전체 →</span>}>
          {TX.slice(0, 5).map(([, memo, cat, , amt, type], i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center", padding: "7px 0", fontSize: 14 }}>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{memo}</span>
              <span style={{ fontSize: 12, background: "#2a2a2e", borderRadius: 999, padding: "3px 10px", display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: CATC[cat] }} />{cat}
              </span>
              <span style={{ width: 80, textAlign: "right", fontWeight: 600, color: type === "inc" ? L : "#f2f2f3" }}>{(type === "inc" ? "+" : type === "tr" ? "" : "−") + fmt(amt)}</span>
            </div>
          ))}
        </Panel>
      </div>

      <div onClick={() => setSummaryOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 18, background: "#1a1a1d", borderRadius: 999, padding: "12px 14px 12px 22px", cursor: "pointer", fontSize: 14, flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 15 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: P }} />이번 주 업무 요약</span>
        <span style={{ color: "#b4b4ba" }}>업무 일정 9건 · 8시간</span>
        <span style={{ color: "#b4b4ba" }}>할일 17/25</span>
        <span style={{ color: R }}>기한초과 1</span>
        <span style={{ color: "#b4b4ba" }}>다음 마감 · 분기 보고서 초안 (오늘)</span>
        <span style={{ marginLeft: "auto", background: "#fff", color: "#000", fontWeight: 600, padding: "7px 16px", borderRadius: 999, fontSize: 13 }}>{summaryOpen ? "접기 ⌄" : "펼치기 ⌃"}</span>
      </div>

      {summaryOpen && (
        <div style={{ background: "#161619", border: "1px solid #2a2a2e", borderRadius: 24, padding: "22px 24px", ...col(16) }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontSize: 20, fontWeight: 700 }}>요일별 업무</span>
            <span style={{ fontSize: 14, color: "#8d8d94" }}>10월 12일 – 18일 · 수요일 13:40 기준</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 10 }}>
            {WORK_DAYS.map(([dow, date, h, items, todos], i) => (
              <div key={dow} style={{ background: i === 2 ? "#202025" : "#1b1b1f", border: i === 2 ? `1px solid ${L}` : "1px solid transparent", borderRadius: 16, padding: 12, ...col(8), minWidth: 0, minHeight: 220, opacity: i > 4 ? 0.55 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{dow} <span style={{ fontSize: 13, color: "#8d8d94", fontWeight: 500 }}>{date}</span></span>
                  <span style={{ fontSize: 12, color: i === 2 ? L : "#b4b4ba", fontWeight: 600 }}>{h ? h + "h" : "휴무"}</span>
                </div>
                <div style={{ height: 4, background: "#2a2a2e", borderRadius: 2 }}><div style={{ height: "100%", width: `${Math.round((h / 3.5) * 100)}%`, background: i === 2 ? L : P, borderRadius: 2 }} /></div>
                {items.map(([time, title]) => (
                  <div key={time + title} style={{ ...col(1), opacity: i < 2 || (i === 2 && time === "09:30") ? 0.5 : 1 }}>
                    <span style={{ fontSize: 11, color: "#8d8d94" }}>{time}</span>
                    <span style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
                  </div>
                ))}
                <div style={{ marginTop: "auto", ...col(4), borderTop: "1px solid #2a2a2e", paddingTop: 8 }}>
                  {todos.map(([label, k]) => <span key={label} style={{ fontSize: 12, color: TODO_COLORS[k], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>)}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 14, color: "#d6d6da" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.78 0.15 290)", whiteSpace: "nowrap" }}>Claude 요약</span>
            <span style={{ textWrap: "pretty" }}>목요일에 업무가 몰려 있어요(3.5시간). 오늘 분기 보고서 초안을 끝내 두면 목요일 회의 준비가 수월합니다.</span>
          </div>
        </div>
      )}
    </div>
  );
}
