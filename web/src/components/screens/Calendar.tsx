"use client";

import { useState } from "react";
import { B, EVC, L, MEV, MWX, P, WEEKRAW } from "@/lib/data";
import type { Nav } from "../App";
import { Btn, Seg, Title, col } from "../ui";

const H = 56;
const NOW = 13 + 40 / 60;
const toHour = (x: string) => { const [h, m] = x.split(":").map(Number); return h + m / 60; };
const WX_RAIN = "oklch(0.75 0.12 230)";
const HOURS = ["08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21"];

export function Calendar({ nav }: { nav: Nav }) {
  const [view, setView] = useState<"week" | "month">("week");

  return (
    <div style={col(18)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Title sub={view === "week" ? "42주차" : "일정 31개"}>{view === "week" ? "10월 12일 – 18일" : "2026년 10월"}</Title>
          <div style={{ display: "flex", gap: 6 }}>
            {["‹", "›"].map((c) => <span key={c} style={{ width: 38, height: 38, borderRadius: "50%", background: "#1c1c1f", display: "flex", alignItems: "center", justifyContent: "center", color: "#d6d6da" }}>{c}</span>)}
            <span style={{ height: 38, borderRadius: 999, border: "1px solid #3a3a40", padding: "0 16px", display: "flex", alignItems: "center", fontSize: 14 }}>오늘</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6, fontSize: 13 }}>
            {([["할일 마감", L], ["결제일", "#d6d6da"], ["날씨", B]] as const).map(([label, c]) => (
              <span key={label} style={{ background: "#1c1c1f", borderRadius: 999, padding: "8px 14px", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />{label}
              </span>
            ))}
          </div>
          <Seg items={[["week", "주간"], ["month", "월간"]]} cur={view} set={setView} />
          <Btn onClick={() => nav.openQuick("ev")}>일정 추가 +</Btn>
        </div>
      </div>

      {view === "week" ? <Week /> : <Month />}

      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#8d8d94", flexWrap: "wrap" }}>
        {([["업무", P], ["개인", "#34343a"], ["운동", B], ["다음 일정", L]] as const).map(([label, c]) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{label}</span>
        ))}
        <span>G = Google 캘린더</span>
        <span style={{ marginLeft: "auto" }}>드래그로 이동 · 아래 가장자리로 기간 조절</span>
      </div>
    </div>
  );
}

function Week() {
  const grid = "52px repeat(7,minmax(0,1fr))";
  return (
    <div style={{ background: "#111113", borderRadius: 22, padding: "14px 16px 16px", ...col(6) }}>
      <div style={{ display: "grid", gridTemplateColumns: grid, gap: 6 }}>
        <span />
        {WEEKRAW.map(([dow, date, wx, marks], i) => (
          <div key={dow} style={{ ...col(6), padding: "4px 4px 8px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#8d8d94" }}>{dow}</span>
              <span style={{ fontSize: 18, fontWeight: 700, width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: i === 2 ? L : "transparent", color: i === 2 ? "#0b0b0c" : i < 2 ? "#6c6c73" : "#f2f2f3" }}>{date}</span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: wx.startsWith("비") ? WX_RAIN : "#8d8d94", whiteSpace: "nowrap" }}>{wx}</span>
            </div>
            <div style={{ ...col(3), minHeight: 44 }}>
              {marks.map(([label, dot]) => {
                const ad = dot === "ad";
                return (
                  <div key={label} style={{ fontSize: 11, background: ad ? P : "#1f1f23", color: ad ? "#fff" : "#f2f2f3", fontWeight: ad ? 600 : 400, borderRadius: ad ? 6 : 999, padding: "3px 8px", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", overflow: "hidden" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: ad ? "#fff" : dot }} />{label}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: grid, gap: 6 }}>
        <div style={{ position: "relative" }}>
          {HOURS.map((h) => <div key={h} style={{ height: H, fontSize: 11, color: "#6c6c73", transform: "translateY(-7px)" }}>{h}</div>)}
          <div style={{ position: "absolute", top: 310, left: 0, fontSize: 11, fontWeight: 700, color: L, background: "#111113" }}>13:40</div>
        </div>
        {WEEKRAW.map(([dow, , , , evs], i) => (
          <div key={dow} style={{ position: "relative", height: 784, borderRadius: 12, background: `repeating-linear-gradient(180deg,#1a1a1d 0 1px,transparent 1px ${H}px)`, backgroundColor: i === 2 ? "#17171a" : "transparent" }}>
            {evs.map(([title, a, b, k, g, note]) => {
              const A = toHour(a), Bv = toHour(b), short = Bv - A < 0.75;
              const [bg, fg] = EVC[k];
              return (
                <div key={title + a} style={{ position: "absolute", left: 3, right: 3, top: Math.round((A - 8) * H) + 3, height: Math.round((Bv - A) * H) - 5, background: bg, color: fg, opacity: i < 2 || (i === 2 && Bv <= NOW) ? 0.4 : 1, borderRadius: 10, padding: short ? "3px 8px" : "6px 8px", ...col(1), overflow: "hidden", border: note ? `1.5px dashed ${L}` : "none", cursor: "grab" }}>
                  <div style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
                    <span style={{ fontSize: 10, opacity: 0.85, whiteSpace: "nowrap" }}>{short ? a : ""}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.8 }}>{g}</span>
                  </div>
                  <span style={{ fontSize: 11, opacity: 0.85, whiteSpace: "nowrap" }}>{short ? "" : `${a} – ${b}`}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: L }}>{note}</span>
                </div>
              );
            })}
            {i === 2 && (
              <div style={{ position: "absolute", left: 0, right: 0, top: 317, height: 2, background: L }}>
                <div style={{ position: "absolute", left: -4, top: -4, width: 10, height: 10, borderRadius: "50%", background: L }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Month() {
  return (
    <div style={{ background: "#111113", borderRadius: 22, padding: "14px 16px 16px", ...col(8) }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 6, fontSize: 13, color: "#8d8d94", padding: "0 8px" }}>
        {["월", "화", "수", "목", "금", "토", "일"].map((d) => <span key={d}>{d}</span>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 6 }}>
        {Array.from({ length: 35 }, (_, i) => {
          const d = i - 2, inM = d >= 1 && d <= 31, today = d === 14;
          const num = inM ? d : d < 1 ? 30 + d : d - 31;
          const evs = inM ? MEV[d] ?? [] : [];
          const wx = inM ? MWX[d] ?? "" : "";
          return (
            <div key={i} style={{ minHeight: 118, borderRadius: 12, padding: 8, ...col(4), background: today ? "#1c1c20" : "#161618", border: today ? `1px solid ${L}` : "1px solid transparent", opacity: inM ? (d < 14 ? 0.6 : 1) : 0.25, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 14, fontWeight: 700, width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: today ? L : "transparent", color: today ? "#0b0b0c" : "#f2f2f3" }}>{num}</span>
                <span style={{ fontSize: 11, color: wx.startsWith("비") ? WX_RAIN : "#8d8d94" }}>{wx}</span>
              </div>
              {evs.slice(0, 3).map(([label, k]) => (
                <div key={label} style={{ fontSize: 11, borderRadius: 6, padding: "2px 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", background: EVC[k][0], color: EVC[k][1], border: k === "pay" ? "1px solid #3a3a40" : "1px solid transparent" }}>{label}</div>
              ))}
              <span style={{ fontSize: 11, color: "#8d8d94", paddingLeft: 2 }}>{evs.length > 3 ? `+${evs.length - 3}개` : ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
