import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "라이프 매니저",
  description: "일정 · 할일 · 가계부를 한곳에서",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
