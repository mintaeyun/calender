"use client";

import { useState } from "react";
import { L } from "@/lib/data";
import { Seg, Toggle, field } from "../ui";

export type QuickKind = "tx" | "ev" | "todo";
type Freq = "none" | "daily" | "weekly" | "monthly" | "yearly";
type End = "never" | "date" | "count";

const DN = ["월", "화", "수", "목", "금", "토", "일"];
const FREQ: [Freq, string][] = [["none", "안 함"], ["daily", "매일"], ["weekly", "매주"], ["monthly", "매월"], ["yearly", "매년"]];
const hint = { fontSize: 12, color: "#8d8d94" } as const;
const sel = { background: L, color: "#000", fontWeight: 600 } as const;
const pill = { background: "#202024", borderRadius: 999, padding: "7px 14px" } as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={field}><span style={hint}>{label}</span>{children}</div>;
}

export function QuickAdd({ kind, setKind, onClose }: { kind: QuickKind; setKind: (k: QuickKind) => void; onClose: () => void }) {
  const [allDay, setAllDay] = useState(false);
  const [freq, setFreq] = useState<Freq>("none");
  const [days, setDays] = useState<number[]>([1, 3]);
  const [end, setEnd] = useState<End>("date");

  const base = {
    daily: "매일",
    weekly: "매주 " + (days.length ? [...days].sort().map((i) => DN[i]).join("·") : "요일 선택"),
    monthly: allDay ? "매월 17일" : "매월 15일",
    yearly: allDay ? "매년 10월 17일" : "매년 10월 15일",
  };
  const endTxt = { never: "계속", date: "2026년 12월 31일까지", count: "10회" }[end];
  const repSummary = freq === "none" ? "반복 안 함" : `${base[freq]} · ${endTxt}`;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 540, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", background: "#161619", border: "1px solid #2a2a2e", borderRadius: 28, padding: 26, display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Seg<QuickKind> items={[["tx", "지출"], ["ev", "일정"], ["todo", "할일"]]} cur={kind} set={setKind} bg="#202024" />
          <span onClick={onClose} style={{ cursor: "pointer", width: 34, height: 34, borderRadius: "50%", background: "#202024", display: "flex", alignItems: "center", justifyContent: "center", color: "#b4b4ba" }}>✕</span>
        </div>

        {kind === "tx" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, borderBottom: "1px solid #2a2a2e", paddingBottom: 12 }}>
              <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.02em" }}>12,000</span><span style={{ fontSize: 22, color: "#6c6c73" }}>원</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {["지출", "수입", "이체"].map((t, i) => <span key={t} style={{ borderRadius: 999, padding: "7px 16px", fontSize: 14, ...(i === 0 ? { background: "#fff", color: "#000", fontWeight: 600 } : { background: "#202024", color: "#b4b4ba" }) }}>{t}</span>)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#8d8d94" }}>카테고리 · 최근 사용</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 14 }}>
                {["식비", "교통", "쇼핑", "문화", "기타"].map((c, i) => <span key={c} style={i === 0 ? { ...pill, ...sel } : pill}>{c}</span>)}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 14 }}>
              <Field label="계좌">신한카드</Field><Field label="날짜">오늘 · 10월 14일</Field>
            </div>
            <Field label="메모">점심</Field>
          </div>
        )}

        {kind === "ev" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 600, borderBottom: "1px solid #2a2a2e", paddingBottom: 12 }}>{allDay ? "가족 여행 · 가평" : "치과 정기검진"}</div>
            <div onClick={() => setAllDay((v) => !v)} style={{ ...field, cursor: "pointer", flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 0 }}>
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><span>종일</span><span style={hint}>{allDay ? "시간 없이 날짜만 · 여러 날 가능" : "시간을 지정하는 일정"}</span></span>
              <Toggle on={allDay} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {allDay ? (
                <><Field label="시작일">10월 17일 (토)</Field><Field label="종료일">10월 18일 (일) · 2일</Field></>
              ) : (
                <><Field label="시작">10월 15일 (목) 15:00</Field><Field label="종료">10월 15일 (목) 16:00</Field></>
              )}
            </div>
            <Field label="장소">{allDay ? "가평 펜션" : "강남역 3번 출구"}</Field>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#8d8d94" }}>알림</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(allDay ? [["당일 09:00", true], ["1일 전 20:00", true], ["1주 전", false]] : [["정시", false], ["10분 전", false], ["1시간 전", true], ["1일 전", true]] as [string, boolean][]).map(([t, on]) => (
                  <span key={t as string} style={on ? { ...pill, ...sel } : pill}>{t}</span>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "#1c1c20", borderRadius: 16, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#8d8d94" }}>반복</span><span style={{ fontSize: 12, color: L }}>{repSummary}</span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {FREQ.map(([k, label]) => (
                  <span key={k} onClick={() => setFreq(k)} style={{ cursor: "pointer", borderRadius: 999, padding: "7px 14px", background: freq === k ? "#fff" : "#202024", color: freq === k ? "#000" : "#d6d6da", fontWeight: freq === k ? 600 : 400 }}>{label}</span>
                ))}
              </div>
              {freq === "weekly" && (
                <div style={{ display: "flex", gap: 6 }}>
                  {DN.map((d, i) => {
                    const on = days.includes(i);
                    return (
                      <span key={d} onClick={() => setDays(on ? days.filter((x) => x !== i) : [...days, i])} style={{ cursor: "pointer", width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: on ? L : "#202024", color: on ? "#0b0b0c" : "#b4b4ba", fontWeight: on ? 700 : 400 }}>{d}</span>
                    );
                  })}
                </div>
              )}
              {freq !== "none" && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderTop: "1px solid #2a2a2e", paddingTop: 10 }}>
                    <span style={{ fontSize: 13, color: "#8d8d94" }}>종료</span>
                    <Seg<End> items={[["never", "없음"], ["date", "날짜"], ["count", "횟수"]]} cur={end} set={setEnd} bg="#202024" pad="6px 14px" />
                    <span style={{ marginLeft: "auto", background: "#202024", borderRadius: 12, padding: "8px 12px" }}>{end === "never" ? "종료 없음" : end === "date" ? "2026. 12. 31" : "10회 반복"}</span>
                  </div>
                  <span style={{ fontSize: 12, color: "#6c6c73" }}>수정 시 &quot;이번만 / 이후 전체 / 전체&quot; 중에서 선택합니다</span>
                </>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#8d8d94" }}>분류</span>
              <span style={{ ...pill, display: "flex", alignItems: "center", gap: 7 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#55555c" }} />개인</span>
            </div>
          </div>
        )}

        {kind === "todo" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 600, borderBottom: "1px solid #2a2a2e", paddingBottom: 12 }}>여행 짐 리스트 만들기</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><Field label="마감일">10월 23일 (금)</Field><Field label="프로젝트">여행</Field></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#8d8d94" }}>우선순위</span>
              <div style={{ display: "flex", gap: 6 }}>
                {["상", "중", "하"].map((p) => <span key={p} style={{ borderRadius: 999, padding: "7px 16px", ...(p === "중" ? { background: "#fff", color: "#000", fontWeight: 600 } : { background: "#202024" }) }}>{p}</span>)}
              </div>
            </div>
            <Field label="태그">#여행</Field>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <span onClick={onClose} style={{ cursor: "pointer", border: "1px solid #3a3a40", borderRadius: 999, padding: "11px 20px", fontSize: 14 }}>취소</span>
          <span onClick={onClose} style={{ cursor: "pointer", background: "#fff", color: "#000", fontWeight: 700, borderRadius: 999, padding: "11px 24px", fontSize: 14 }}>저장</span>
        </div>
      </div>
    </div>
  );
}
