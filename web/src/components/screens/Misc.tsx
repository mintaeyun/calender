"use client";

import { L, NOTIS } from "@/lib/data";
import { Title, card, col } from "../ui";

export function Notifications({ read, readAll }: { read: boolean; readAll: () => void }) {
  return (
    <div style={{ ...col(18), maxWidth: 860, width: "100%", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Title sub={read ? "모두 읽음" : "읽지 않음 3"}>알림</Title>
        <span onClick={readAll} style={{ cursor: "pointer", border: "1px solid #3a3a40", borderRadius: 999, padding: "10px 18px", fontSize: 14 }}>모두 읽음</span>
      </div>
      <div style={{ ...card, padding: "8px 22px", ...col(0) }}>
        {NOTIS.map(([type, title, body, time, bg, fg], i) => {
          const unread = !read && i < 3;
          return (
            <div key={title} style={{ display: "flex", gap: 16, alignItems: "flex-start", padding: "16px 0", borderBottom: "1px solid #26262a", opacity: unread ? 1 : 0.6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap", background: bg, color: fg }}>{type}</span>
              <div style={{ flex: 1, ...col(3) }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
                <span style={{ fontSize: 13, color: "#8d8d94" }}>{body}</span>
              </div>
              <span style={{ fontSize: 12, color: "#8d8d94", whiteSpace: "nowrap" }}>{time}</span>
              <span style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 6, background: unread ? L : "transparent" }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Search() {
  const tab = (label: string, on = false) => (
    <span key={label} style={{ background: on ? "#fff" : "#1c1c1f", color: on ? "#000" : "#b4b4ba", fontWeight: on ? 600 : 400, borderRadius: 999, padding: "8px 16px", fontSize: 14 }}>{label}</span>
  );
  const group = { fontSize: 13, color: "#8d8d94" } as const;
  const item = { background: "#1a1a1d", borderRadius: 18, padding: "16px 20px" } as const;
  return (
    <div style={{ ...col(18), maxWidth: 860, width: "100%", margin: "0 auto" }}>
      <div style={{ background: "#1a1a1d", border: "1px solid #3a3a40", borderRadius: 999, padding: "16px 24px", display: "flex", alignItems: "center", gap: 14, fontSize: 18 }}>
        <span style={{ width: 16, height: 16, border: "2px solid #b4b4ba", borderRadius: "50%" }} />
        <input defaultValue="치과" style={{ flex: 1, background: "transparent", border: 0, outline: "none", color: "inherit", fontSize: 18 }} />
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#8d8d94" }}>3개 결과</span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>{tab("전체", true)}{tab("일정 1")}{tab("할일 1")}{tab("거래 1")}</div>
      <div style={col(10)}>
        <span style={group}>일정</span>
        <div style={{ ...item, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={col(3)}><span style={{ fontSize: 15, fontWeight: 600 }}>치과 정기검진</span><span style={{ fontSize: 13, color: "#8d8d94" }}>10월 14일(수) 15:00 · 강남역 3번 출구</span></div>
          <span style={{ fontSize: 12, background: L, color: "#0b0b0c", fontWeight: 700, borderRadius: 999, padding: "3px 10px" }}>오늘</span>
        </div>
        <span style={{ ...group, marginTop: 8 }}>할일</span>
        <div style={{ ...item, ...col(3) }}><span style={{ fontSize: 15, fontWeight: 600 }}>치과 보험 청구서 제출</span><span style={{ fontSize: 13, color: "#8d8d94" }}>마감 10월 20일 · 생활</span></div>
        <span style={{ ...group, marginTop: 8 }}>거래</span>
        <div style={{ ...item, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={col(3)}><span style={{ fontSize: 15, fontWeight: 600 }}>치과 스케일링</span><span style={{ fontSize: 13, color: "#8d8d94" }}>4월 8일 · 의료 · 신한카드</span></div>
          <span style={{ fontWeight: 600 }}>−18,500</span>
        </div>
      </div>
    </div>
  );
}
