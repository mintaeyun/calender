"use client";

import { P } from "@/lib/data";
import { display } from "../ui";

export function Login({ onEnter }: { onEnter: () => void }) {
  const input = { background: "#1f1f23", borderRadius: 14, padding: "14px 16px", fontSize: 15 } as const;
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
      <div style={{ width: 420, maxWidth: "100%", background: "#141416", border: "1px solid #26262a", borderRadius: 28, padding: "40px 36px", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: P }} />
          <span style={{ fontSize: 21, ...display, letterSpacing: 0 }}>라이프 매니저</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          <span style={{ fontSize: 30, ...display }}>다시 오셨네요</span>
          <span style={{ fontSize: 15, color: "#8d8d94" }}>일정 · 할일 · 가계부를 한곳에서</span>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#b4b4ba" }}>이메일</span>
          <input type="email" defaultValue="me@example.com" style={{ ...input, border: 0, color: "inherit", outline: "none" }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: "#b4b4ba" }}>비밀번호</span>
            <span style={{ fontSize: 13, color: "#8d8d94" }}>비밀번호 재설정</span>
          </span>
          <input type="password" defaultValue="••••••••••" style={{ ...input, border: 0, color: "inherit", outline: "none", letterSpacing: "0.2em" }} />
        </label>
        <div onClick={onEnter} style={{ cursor: "pointer", background: "#fff", color: "#000", fontWeight: 700, fontSize: 15, textAlign: "center", padding: 15, borderRadius: 999, marginTop: 6 }}>로그인</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "#6c6c73" }}>
          <div style={{ flex: 1, height: 1, background: "#26262a" }} />또는<div style={{ flex: 1, height: 1, background: "#26262a" }} />
        </div>
        <div onClick={onEnter} style={{ cursor: "pointer", border: "1px solid #3a3a40", fontSize: 15, textAlign: "center", padding: 14, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", color: "#000", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>G</span>
          Google로 계속하기
        </div>
        <span style={{ fontSize: 12, color: "#6c6c73", textAlign: "center" }}>허용된 이메일만 가입할 수 있습니다</span>
      </div>
    </div>
  );
}
