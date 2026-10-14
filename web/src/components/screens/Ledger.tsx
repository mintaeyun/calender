"use client";

import { useState } from "react";
import { ACCOUNTS, BUD, CATC, CATS, L, P, R, RECURRING, TOTAL_EXP, TX, fmt, type TxType } from "@/lib/data";
import type { Nav } from "../App";
import { Btn, Chip, Seg, Title, Toggle, card, col } from "../ui";

type Tab = "list" | "stats" | "budget" | "recurring" | "accounts";
const sub = { fontSize: 13, color: "#8d8d94" } as const;

export function Ledger({ nav }: { nav: Nav }) {
  const [tab, setTab] = useState<Tab>("list");
  return (
    <div style={col(18)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <Title sub="2026년 10월">가계부</Title>
          <Seg<Tab> items={[["list", "내역"], ["stats", "통계"], ["budget", "예산"], ["recurring", "고정지출"], ["accounts", "계좌"]]} cur={tab} set={setTab} pad="8px 16px" />
        </div>
        <Btn onClick={() => nav.openQuick("tx")}>거래 추가 +</Btn>
      </div>
      {tab === "list" && <List />}
      {tab === "stats" && <Stats />}
      {tab === "budget" && <Budget />}
      {tab === "recurring" && <Recurring />}
      {tab === "accounts" && <Accounts />}
    </div>
  );
}

function List() {
  const [type, setType] = useState<"all" | TxType>("all");
  const rows = TX.filter((x) => type === "all" || x[5] === type);
  const sum = (k: TxType) => rows.filter((x) => x[5] === k).reduce((a, x) => a + x[4], 0);
  const net = sum("inc") - sum("exp");
  const groups = new Map<string, typeof TX>();
  rows.forEach((x) => groups.set(x[0], [...(groups.get(x[0]) ?? []), x]));

  return (
    <div style={col(14)}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {([["all", "전체"], ["exp", "지출"], ["inc", "수입"], ["tr", "이체"]] as const).map(([k, label]) => (
          <span key={k} onClick={() => setType(k)} style={{ cursor: "pointer", padding: "9px 16px", borderRadius: 999, fontSize: 14, background: type === k ? "#fff" : "#1c1c1f", color: type === k ? "#000" : "#b4b4ba", fontWeight: type === k ? 600 : 400 }}>{label}</span>
        ))}
        <span style={{ width: 1, height: 24, background: "#2a2a2e", margin: "0 4px" }} />
        <Chip>기간 · 10/1–10/14</Chip><Chip>카테고리 · 전체</Chip><Chip>계좌 · 전체</Chip><Chip>금액 범위</Chip>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
        {([["수입", fmt(sum("inc")) + "원"], ["지출", fmt(sum("exp")) + "원"], [`필터 결과 · ${rows.length}건`, (net >= 0 ? "+" : "−") + fmt(Math.abs(net)) + "원"]] as const).map(([label, v], i) => (
          <div key={label} style={{ background: "#1a1a1d", borderRadius: 18, padding: "16px 20px", ...col(4) }}>
            <span style={sub}>{label}</span>
            <span style={{ fontSize: 26, fontWeight: 700, color: i === 2 ? L : undefined }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ ...card, padding: "8px 22px 14px", ...col(0) }}>
        {[...groups].map(([label, g]) => (
          <div key={label} style={col(0)}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 0 8px", ...sub, borderBottom: "1px solid #26262a" }}>
              <span style={{ fontWeight: 600, color: "#d6d6da" }}>{label}</span>
              <span>지출 {fmt(g.filter((x) => x[5] === "exp").reduce((a, x) => a + x[4], 0))}</span>
            </div>
            {g.map(([, memo, cat, acct, amt, t, badge], i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "140px minmax(0,1fr) 160px 120px", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: "1px solid #202024", fontSize: 14 }}>
                <span style={{ fontSize: 12, background: "#2a2a2e", borderRadius: 999, padding: "4px 10px", display: "flex", alignItems: "center", gap: 6, width: "fit-content" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: CATC[cat] }} />{cat}
                </span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>{memo}<span style={{ fontSize: 11, color: "#8d8d94" }}>{badge ? `· ${badge}에서 기록` : ""}</span></span>
                <span style={{ color: "#8d8d94", fontSize: 13 }}>{acct}</span>
                <span style={{ textAlign: "right", fontWeight: 600, color: t === "inc" ? L : t === "tr" ? "#8d8d94" : "#f2f2f3" }}>{(t === "inc" ? "+" : t === "tr" ? "⇄ " : "−") + fmt(amt)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Stats() {
  let acc = 0;
  const donut = "conic-gradient(" + CATS.map(([n, v]) => { const a = acc; acc += (v / TOTAL_EXP) * 100; return `${CATC[n]} ${a}% ${acc}%`; }).join(",") + ")";
  const monthly: [string, number][] = [["5월", 171], ["6월", 158], ["7월", 192], ["8월", 214], ["9월", 176], ["10월", 164]];
  const cmp: [string, string, string | undefined][] = [["전체", "+8.2%", R], ["식비", "+12%", R], ["쇼핑", "−30%", L], ["교통", "+5%", undefined]];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.3fr)", gap: 14 }}>
      <div style={{ ...card, padding: 24, ...col(20) }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>카테고리별 지출</span>
        <div style={{ display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ width: 200, height: 200, borderRadius: "50%", background: donut, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <div style={{ width: 130, height: 130, borderRadius: "50%", background: "#1a1a1d", ...col(2), alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 12, color: "#8d8d94" }}>10월 지출</span><span style={{ fontSize: 20, fontWeight: 700 }}>164.2만</span>
            </div>
          </div>
          <div style={{ flex: 1, ...col(10), minWidth: 180 }}>
            {CATS.map(([name, v]) => (
              <div key={name} style={{ display: "grid", gridTemplateColumns: "14px 1fr auto 48px", gap: 8, alignItems: "center", fontSize: 14 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: CATC[name] }} /><span>{name}</span>
                <span style={{ fontWeight: 600 }}>{fmt(v)}</span><span style={{ textAlign: "right", color: "#8d8d94", fontSize: 13 }}>{((v / TOTAL_EXP) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={col(14)}>
        <div style={{ ...card, padding: 24, ...col(16) }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 17, fontWeight: 600 }}>월별 지출 추이</span><span style={sub}>단위 만원</span></div>
          <div style={{ height: 180, display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 16, alignItems: "end" }}>
            {monthly.map(([label, v], i) => (
              <div key={label} style={{ ...col(8), alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: i === 5 ? L : "#b4b4ba" }}>{v}</span>
                <div style={{ width: "100%", height: `${Math.round((v / 214) * 85)}%`, borderRadius: 10, background: i === 5 ? L : i === 3 ? P : "#2e2a40" }} />
                <span style={{ fontSize: 13, color: "#8d8d94" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ ...card, padding: 24, ...col(12) }}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>전월 대비 (같은 기간 1–14일)</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10 }}>
            {cmp.map(([label, v, c]) => (
              <div key={label} style={{ background: "#202024", borderRadius: 14, padding: 14, ...col(4) }}>
                <span style={sub}>{label}</span><span style={{ fontSize: 20, fontWeight: 700, color: c }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Budget() {
  return (
    <div style={col(14)}>
      <div style={{ ...card, padding: 24, ...col(14) }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>10월 총예산</span><span style={{ fontSize: 14, color: "#8d8d94" }}>남은 17일 · 하루 32,800원 사용 가능</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em" }}>1,642,300</span>
          <span style={{ fontSize: 20, color: "#6c6c73" }}>/ 2,200,000원</span>
          <span style={{ fontSize: 15, color: L, fontWeight: 600, marginLeft: 8 }}>74.6%</span>
        </div>
        <div style={{ height: 14, background: "#2a2a2e", borderRadius: 7, position: "relative", overflow: "hidden" }}>
          <div style={{ width: "74.6%", height: "100%", background: P }} />
          <div style={{ position: "absolute", left: "80%", top: 0, bottom: 0, width: 2, background: "#f2f2f3" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#8d8d94" }}><span>0</span><span>80% 도달 시 알림 · 100% 초과 시 알림</span><span>2,200,000</span></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
        {BUD.map(([name, used, limit]) => {
          const p = (used / limit) * 100;
          const bar = p >= 100 ? R : p >= 80 ? L : P;
          return (
            <div key={name} style={{ background: "#1a1a1d", borderRadius: 20, padding: 20, ...col(10) }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: CATC[name] }} />{name}</span>
                <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: p >= 100 ? R : p >= 80 ? L : "#2a2a2e", color: p >= 80 ? "#0b0b0c" : "#d6d6da" }}>{Math.round(p)}%</span>
              </div>
              <div style={{ height: 8, background: "#2a2a2e", borderRadius: 4, overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.min(100, p)}%`, background: bar }} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", ...sub }}><span>{fmt(used)} 사용</span><span>예산 {fmt(limit)}</span></div>
              <span style={{ fontSize: 12, color: p >= 100 ? R : p >= 80 ? L : "#8d8d94" }}>{p >= 100 ? `${fmt(used - limit)}원 초과` : p >= 80 ? "80% 도달 · 알림 보냄" : `${fmt(limit - used)}원 남음`}</span>
            </div>
          );
        })}
        <div style={{ border: "1.5px dashed #2e2e33", borderRadius: 20, padding: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#8d8d94", minHeight: 130 }}>+ 카테고리 예산 추가</div>
      </div>
    </div>
  );
}

function Recurring() {
  const cols = "minmax(0,1fr) 120px 110px 120px 110px 48px";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 14, alignItems: "start" }}>
      <div style={{ ...card, padding: "10px 22px", ...col(0) }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 12, fontSize: 12, color: "#8d8d94", padding: "12px 0", borderBottom: "1px solid #26262a" }}>
          <span>이름</span><span>주기</span><span>다음 결제</span><span>계좌</span><span style={{ textAlign: "right" }}>금액</span><span />
        </div>
        {RECURRING.map(([name, cycle, next, acct, amt, cat, on, soon]) => (
          <div key={name} style={{ display: "grid", gridTemplateColumns: cols, gap: 12, alignItems: "center", padding: "14px 0", borderBottom: "1px solid #202024", fontSize: 14, opacity: on ? 1 : 0.5 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: CATC[cat] }} />{name}<span style={{ fontSize: 11, color: L }}>{soon ?? ""}</span>
            </span>
            <span style={{ color: "#b4b4ba" }}>{cycle}</span><span>{next}</span><span style={{ color: "#8d8d94" }}>{acct}</span>
            <span style={{ textAlign: "right", fontWeight: 600 }}>{fmt(amt)}</span>
            <span style={{ justifySelf: "end" }}><Toggle on={!!on} w={40} h={22} /></span>
          </div>
        ))}
      </div>
      <div style={col(12)}>
        <div style={{ ...card, padding: 22, ...col(6) }}>
          <span style={sub}>월 고정지출 합계</span><span style={{ fontSize: 30, fontWeight: 700 }}>806,900원</span><span style={sub}>월 예산의 36.7% · 연간 항목 별도</span>
        </div>
        <div style={{ background: L, color: "#0b0b0c", borderRadius: 22, padding: "20px 22px", ...col(4) }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>내일 결제</span><span style={{ fontSize: 20, fontWeight: 700 }}>넷플릭스 17,000원</span><span style={{ fontSize: 13 }}>신한카드 · 결제일에 거래 자동 등록</span>
        </div>
      </div>
    </div>
  );
}

function Accounts() {
  return (
    <div style={col(14)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div style={col(4)}>
          <span style={{ fontSize: 14, color: "#8d8d94" }}>순자산</span>
          <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.02em" }}>4,125,300<span style={{ fontSize: 24, color: "#6c6c73" }}>원</span></span>
        </div>
        <span style={{ border: "1px solid #3a3a40", borderRadius: 999, padding: "10px 18px", fontSize: 14 }}>계좌 간 이체 ⇄</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>
        {ACCOUNTS.map(([type, s, name, bal, bg, fg]) => (
          <div key={name} style={{ background: bg, color: fg, borderRadius: 22, padding: 22, ...col(30), minHeight: 170 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span style={{ fontWeight: 600 }}>{type}</span><span style={{ opacity: 0.7 }}>{s}</span></div>
            <div style={{ ...col(4), marginTop: "auto" }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{name}</span>
              <span style={{ fontSize: 26, fontWeight: 700 }}>{(bal < 0 ? "−" : "") + fmt(Math.abs(bal))}원</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ ...card, padding: "20px 22px", ...col(8) }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>최근 이체</span>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "8px 0", borderBottom: "1px solid #26262a" }}><span>카카오뱅크 → 현금</span><span style={{ color: "#8d8d94" }}>10/12 · 100,000</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "8px 0" }}><span>신한은행 → 카카오뱅크</span><span style={{ color: "#8d8d94" }}>10/02 · 500,000</span></div>
      </div>
    </div>
  );
}
