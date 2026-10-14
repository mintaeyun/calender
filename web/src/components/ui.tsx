"use client";

import type { CSSProperties, ReactNode } from "react";
import { L } from "@/lib/data";

export const display: CSSProperties = {
  fontFamily: "'YeogiOttaeJalnan',Pretendard,sans-serif",
  fontWeight: "normal",
  lineHeight: 1.3,
  letterSpacing: "-0.01em",
};

export const card: CSSProperties = { background: "#1a1a1d", borderRadius: 22 };
export const col = (gap: number): CSSProperties => ({ display: "flex", flexDirection: "column", gap });
export const row = (gap: number): CSSProperties => ({ display: "flex", alignItems: "center", gap });
export const field: CSSProperties = { background: "#202024", borderRadius: 14, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 2 };

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <span style={{ fontSize: 30, whiteSpace: "nowrap", ...display }}>
      {children} {sub != null && <span style={{ color: "#8d8d94" }}>{sub}</span>}
    </span>
  );
}

/** 세그먼트 탭 (둥근 알약 그룹) */
export function Seg<T extends string>({ items, cur, set, bg = "#1c1c1f", pad = "8px 18px" }: {
  items: [T, string][]; cur: T; set: (k: T) => void; bg?: string; pad?: string;
}) {
  return (
    <div style={{ display: "flex", background: bg, borderRadius: 999, padding: 5, fontSize: 14 }}>
      {items.map(([k, label]) => (
        <span key={k} onClick={() => set(k)} style={{ cursor: "pointer", padding: pad, borderRadius: 999, whiteSpace: "nowrap", background: k === cur ? "#3a3a40" : "transparent", color: k === cur ? "#fff" : "#8d8d94", fontWeight: k === cur ? 600 : 400 }}>
          {label}
        </span>
      ))}
    </div>
  );
}

export function Btn({ children, onClick, ghost, style }: { children: ReactNode; onClick?: () => void; ghost?: boolean; style?: CSSProperties }) {
  return (
    <span onClick={onClick} style={{ cursor: "pointer", whiteSpace: "nowrap", borderRadius: 999, fontSize: 14, padding: "10px 18px", ...(ghost ? { border: "1px solid #3a3a40" } : { background: "#fff", color: "#000", fontWeight: 600 }), ...style }}>
      {children}
    </span>
  );
}

export function Chip({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span style={{ background: "#1c1c1f", borderRadius: 999, padding: "9px 16px", fontSize: 14, color: "#b4b4ba", ...style }}>{children}</span>;
}

export function Toggle({ on, onClick, w = 44, h = 24, dot = 18 }: { on: boolean; onClick?: () => void; w?: number; h?: number; dot?: number }) {
  const pad = (h - dot) / 2;
  return (
    <span onClick={onClick} style={{ width: w, height: h, borderRadius: 999, position: "relative", flexShrink: 0, background: on ? L : "#3a3a40", display: "inline-block" }}>
      <span style={{ position: "absolute", top: pad, left: on ? w - dot - pad : pad, width: dot, height: dot, borderRadius: "50%", background: "#fff" }} />
    </span>
  );
}

export function Dot({ c, r = "50%", s = 8 }: { c: string; r?: string | number; s?: number }) {
  return <span style={{ width: s, height: s, borderRadius: r, background: c, flexShrink: 0, display: "inline-block" }} />;
}

export function Pri({ pri, bg, fg, size = 12 }: { pri: string; bg: string; fg: string; size?: number }) {
  return <span style={{ fontSize: size, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: bg, color: fg, height: "fit-content" }}>{pri}</span>;
}
