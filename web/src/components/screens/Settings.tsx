"use client";

import { useState, type ReactNode } from "react";
import { B, CATC, CATS, L, MCP_LOGS, NOTI_SETTINGS, P, PROJ, R, TOKENS, type Perm } from "@/lib/data";
import { Seg, Toggle, card, col, display } from "../ui";

type Tab = "profile" | "cats" | "noti" | "google" | "weather" | "mcp" | "backup";
const TABS: [Tab, string, string][] = [
  ["profile", "프로필 · 화면", ""], ["cats", "카테고리 · 태그", ""], ["noti", "알림", ""], ["google", "Google 캘린더", "연결됨"],
  ["weather", "날씨", ""], ["mcp", "MCP 연결", "2개"], ["backup", "백업 · 내보내기", ""],
];
const label = { color: "#8d8d94" } as const;
const input = { background: "#202024", borderRadius: 12, padding: "12px 14px" } as const;
const pill = { background: "#202024", borderRadius: 999, padding: "7px 14px", fontSize: 14, display: "flex", alignItems: "center", gap: 7 } as const;
const miniSeg = (items: [string, boolean][]) => (
  <div style={{ display: "flex", background: "#202024", borderRadius: 999, padding: 4, width: "fit-content" }}>
    {items.map(([t, on]) => <span key={t} style={{ padding: "7px 16px", ...(on ? { background: "#3a3a40", borderRadius: 999, fontWeight: 600 } : { color: "#8d8d94" }) }}>{t}</span>)}
  </div>
);
const permView = (v: Perm): [string, string] => (v === "rw" ? ["읽기·쓰기", L] : v === "r" ? ["읽기", "#b4b4ba"] : ["없음", "#55555c"]);

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <div style={col(10)}><span style={{ fontSize: 13, color: "#8d8d94" }}>{title}</span><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div></div>;
}

export function Settings() {
  const [tab, setTab] = useState<Tab>("mcp");
  const [gdir, setGdir] = useState<"import" | "both">("import");
  const [noti, setNoti] = useState<Record<string, boolean>>({ ev: true, todo: true, budget: true, pay: true, rain: true, sync: true });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "230px minmax(0,1fr)", gap: 20, alignItems: "start" }}>
      <div style={col(2)}>
        <span style={{ fontSize: 30, ...display, padding: "0 0 14px 4px" }}>설정</span>
        {TABS.map(([k, name, tag]) => (
          <div key={k} onClick={() => setTab(k)} style={{ cursor: "pointer", padding: "11px 14px", borderRadius: 12, fontSize: 15, background: tab === k ? "#1c1c1f" : "transparent", color: tab === k ? "#fff" : "#b4b4ba", display: "flex", justifyContent: "space-between" }}>
            <span>{name}</span><span style={{ fontSize: 11, color: "#6c6c73" }}>{tag}</span>
          </div>
        ))}
      </div>

      <div style={{ ...col(14), paddingTop: 56 }}>
        {tab === "profile" && (
          <>
            <div style={{ ...card, padding: 24, ...col(18) }}>
              <span style={{ fontSize: 18, fontWeight: 600 }}>프로필 · 화면</span>
              <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "16px 20px", alignItems: "center", fontSize: 14 }}>
                <span style={label}>이름</span><span style={input}>김지민</span>
                <span style={label}>이메일</span><span style={{ ...input, color: "#b4b4ba" }}>me@example.com · Google 로그인</span>
                <span style={label}>시간대</span><span style={input}>Asia/Seoul (UTC+9)</span>
                <span style={label}>테마</span>{miniSeg([["라이트", false], ["다크", true], ["시스템", false]])}
                <span style={label}>주 시작 요일</span>{miniSeg([["월요일", true], ["일요일", false]])}
                <span style={label}>기본 시작 화면</span><span style={input}>대시보드</span>
              </div>
            </div>
            <div style={{ ...card, padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 }}>
              <span style={label}>비밀번호 변경 · 로그아웃</span><span style={{ color: R }}>계정 삭제</span>
            </div>
          </>
        )}

        {tab === "cats" && (
          <div style={{ ...card, padding: 24, ...col(18) }}>
            <span style={{ fontSize: 18, fontWeight: 600 }}>카테고리 · 태그</span>
            <Group title="가계부 · 지출">
              {CATS.map(([name]) => <span key={name} style={pill}><span style={{ width: 8, height: 8, borderRadius: "50%", background: CATC[name] }} />{name}</span>)}
              <span style={{ ...pill, background: "transparent", border: "1px dashed #3a3a40", color: "#8d8d94" }}>+ 추가</span>
            </Group>
            <Group title="가계부 · 수입">{["급여", "부수입", "이자"].map((n) => <span key={n} style={pill}>{n}</span>)}</Group>
            <Group title="일정 분류">
              {([["업무 · G", P], ["개인", "#55555c"], ["운동", B]] as const).map(([n, c]) => <span key={n} style={pill}><span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />{n}</span>)}
            </Group>
            <Group title="할일 프로젝트">
              {Object.entries(PROJ).map(([n, c]) => <span key={n} style={pill}><span style={{ width: 8, height: 8, borderRadius: 3, background: c }} />{n}</span>)}
            </Group>
            <span style={{ fontSize: 12, color: "#6c6c73" }}>거래가 있는 카테고리는 삭제 대신 보관됩니다</span>
          </div>
        )}

        {tab === "noti" && (
          <>
            <div style={{ ...card, padding: "10px 24px", ...col(0) }}>
              {NOTI_SETTINGS.map(([k, name, desc]) => (
                <div key={k} onClick={() => setNoti((n) => ({ ...n, [k]: !n[k] }))} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 16, padding: "16px 0", borderBottom: "1px solid #26262a" }}>
                  <div style={{ flex: 1, ...col(3) }}><span style={{ fontSize: 15, fontWeight: 600 }}>{name}</span><span style={{ fontSize: 13, color: "#8d8d94" }}>{desc}</span></div>
                  <Toggle on={noti[k]} w={44} h={24} dot={18} />
                </div>
              ))}
            </div>
            <div style={{ ...card, padding: "20px 24px", display: "grid", gridTemplateColumns: "160px 1fr", gap: "14px 20px", alignItems: "center", fontSize: 14 }}>
              <span style={label}>채널</span>
              <div style={{ display: "flex", gap: 8 }}>
                {["앱 내", "웹 푸시"].map((c) => <span key={c} style={{ background: "#fff", color: "#000", fontWeight: 600, borderRadius: 999, padding: "6px 14px" }}>{c}</span>)}
                <span style={{ background: "#202024", color: "#6c6c73", borderRadius: 999, padding: "6px 14px" }}>이메일 (준비 중)</span>
              </div>
              <span style={label}>기본 알림 시간</span><span>일정 10분 전 · 할일 마감 당일 09:00</span>
              <span style={label}>방해금지</span><span>23:00 – 07:00</span>
            </div>
          </>
        )}

        {tab === "google" && (
          <div style={{ ...card, padding: 24, ...col(18) }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ width: 44, height: 44, borderRadius: "50%", background: "#fff", color: "#000", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>G</span>
                <div style={col(2)}><span style={{ fontSize: 16, fontWeight: 600 }}>me@gmail.com</span><span style={{ fontSize: 13, color: L }}>연결됨 · 마지막 동기화 오늘 13:32</span></div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ background: "#fff", color: "#000", fontWeight: 600, borderRadius: 999, padding: "10px 18px", fontSize: 14 }}>지금 동기화</span>
                <span style={{ border: "1px solid #3a3a40", borderRadius: 999, padding: "10px 18px", fontSize: 14, color: R }}>연결 해제</span>
              </div>
            </div>
            <div style={{ ...col(10), borderTop: "1px solid #26262a", paddingTop: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>동기화 방향</span>
              <div style={{ width: "fit-content" }}><Seg items={[["import", "가져오기만"], ["both", "양방향"]]} cur={gdir} set={setGdir} bg="#202024" /></div>
              <span style={{ fontSize: 13, color: "#8d8d94" }}>
                {gdir === "import" ? "Google 일정을 앱으로 가져오기만 합니다. 앱에서 만든 일정은 Google에 반영되지 않습니다." : "앱에서 만들고 수정·삭제한 일정도 Google에 반영합니다. Google 일정 삭제 시 확인 창을 띄웁니다."}
              </span>
            </div>
            <div style={{ ...col(6), borderTop: "1px solid #26262a", paddingTop: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>동기화할 캘린더</span>
              {([["업무", "142개 일정", true], ["개인 (me@gmail.com)", "88개 일정", true], ["대한민국 공휴일", "읽기 전용", true], ["가족", "", false]] as const).map(([n, c, on]) => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, padding: "6px 0", color: on ? undefined : "#8d8d94" }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, background: on ? L : "transparent", border: on ? 0 : "1.5px solid #55555c", color: "#000", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>{on ? "✓" : ""}</span>
                  {n}<span style={{ marginLeft: "auto", fontSize: 12, color: "#8d8d94" }}>{c}</span>
                </div>
              ))}
            </div>
            <div style={{ background: "#202024", borderRadius: 14, padding: "14px 16px", fontSize: 13, color: "#b4b4ba", lineHeight: 1.6 }}>
              주기 동기화 15분 · 앱 진입 시 자동. 충돌 시 최근 수정된 쪽을 채택하고 덮어쓴 내용은 기록에 남깁니다. 할일·가계부는 동기화하지 않습니다.
            </div>
          </div>
        )}

        {tab === "weather" && (
          <div style={{ ...card, padding: 24, display: "grid", gridTemplateColumns: "160px 1fr", gap: "16px 20px", alignItems: "center", fontSize: 14 }}>
            <span style={{ fontSize: 18, fontWeight: 600, gridColumn: "1 / -1" }}>날씨</span>
            <span style={label}>기본 지역</span>
            <div style={{ display: "flex", gap: 8 }}><span style={{ flex: 1, ...input }}>서울 강남구</span><span style={{ border: "1px solid #3a3a40", borderRadius: 12, padding: "12px 14px", whiteSpace: "nowrap" }}>현재 위치</span></div>
            <span style={label}>온도 단위</span>{miniSeg([["℃", true], ["℉", false]])}
            <span style={label}>캘린더에 표시</span><span>월간 · 주간 · 일간 (7일 예보 범위)</span>
            <span style={label}>우천 알림</span><span>위치가 있는 일정 · 강수확률 60% 이상</span>
            <span style={label}>데이터</span><span style={label}>마지막 업데이트 13:10 · 30분마다 갱신</span>
          </div>
        )}

        {tab === "mcp" && (
          <>
            <div style={{ ...card, padding: 24, ...col(16) }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={col(3)}><span style={{ fontSize: 18, fontWeight: 600 }}>MCP 연결 · Claude</span><span style={{ fontSize: 13, color: "#8d8d94" }}>Claude에서 일정·할일·가계부를 말로 조회하고 기록합니다</span></div>
                <span style={{ background: "#fff", color: "#000", fontWeight: 600, borderRadius: 999, padding: "10px 18px", fontSize: 14 }}>새 토큰 발급 +</span>
              </div>
              <div style={{ background: "#0f0f11", borderRadius: 14, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, fontFamily: "'JetBrains Mono',ui-monospace,monospace", fontSize: 13 }}>
                <span style={{ color: "#d6d6da" }}>https://myproject.functions.supabase.co/mcp</span>
                <span style={{ fontFamily: "Pretendard,sans-serif", color: "#8d8d94" }}>복사</span>
              </div>
              <div style={col(0)}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 110px 110px 110px 120px 60px", gap: 10, fontSize: 12, color: "#8d8d94", padding: "10px 0", borderBottom: "1px solid #26262a" }}>
                  <span>토큰</span><span>일정</span><span>할일</span><span>가계부</span><span>마지막 사용</span><span />
                </div>
                {TOKENS.map(([name, hint, a, b, c, last, rev]) => (
                  <div key={name} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 110px 110px 110px 120px 60px", gap: 10, alignItems: "center", padding: "14px 0", borderBottom: "1px solid #202024", fontSize: 14, opacity: rev ? 0.45 : 1 }}>
                    <span style={col(2)}><span style={{ fontWeight: 600 }}>{name}</span><span style={{ fontSize: 12, color: "#8d8d94", fontFamily: "ui-monospace,monospace" }}>{hint}</span></span>
                    {[a, b, c].map((p, i) => { const [t, col2] = permView(p); return <span key={i} style={{ fontSize: 12, color: col2 }}>{t}</span>; })}
                    <span style={{ fontSize: 13, color: "#b4b4ba" }}>{last}</span>
                    <span style={{ fontSize: 13, color: rev ? "#6c6c73" : R, textAlign: "right" }}>{rev ? "폐기됨" : "폐기"}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ ...card, padding: "22px 24px", ...col(10) }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 16, fontWeight: 600 }}>호출 이력</span><span style={{ fontSize: 13, color: "#8d8d94" }}>오늘 6회 · 한도 60회/분</span></div>
              {MCP_LOGS.map(([time, tool, inp, st]) => (
                <div key={time + tool} style={{ display: "grid", gridTemplateColumns: "60px 190px minmax(0,1fr) 70px", gap: 12, alignItems: "center", fontSize: 13, padding: "8px 0", borderBottom: "1px solid #202024" }}>
                  <span style={{ color: "#8d8d94" }}>{time}</span>
                  <span style={{ fontFamily: "ui-monospace,monospace", color: /^(get|find|list)/.test(tool) ? "#b4b4ba" : "oklch(0.78 0.15 290)" }}>{tool}</span>
                  <span style={{ color: "#b4b4ba" }}>{inp}</span>
                  <span style={{ textAlign: "right", fontSize: 12, color: st === "ok" ? "#8d8d94" : R }}>{st === "ok" ? "성공" : "오류"}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "backup" && (
          <div style={{ ...card, padding: 24, ...col(16) }}>
            <span style={{ fontSize: 18, fontWeight: 600 }}>백업 · 내보내기</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10 }}>
              {([["일정", "CSV · Excel", false], ["할일", "CSV · Excel", false], ["거래", "CSV · Excel · 가져오기 지원", true]] as const).map(([n, d, imp]) => (
                <div key={n} style={{ background: "#202024", borderRadius: 16, padding: 18, ...col(10) }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{n}</span><span style={{ fontSize: 13, color: "#8d8d94" }}>{d}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {["내보내기", ...(imp ? ["가져오기"] : [])].map((b) => <span key={b} style={{ border: "1px solid #3a3a40", borderRadius: 999, padding: "7px 14px", fontSize: 13 }}>{b}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
