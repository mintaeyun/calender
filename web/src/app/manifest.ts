import type { MetadataRoute } from "next";

// PWA 매니페스트 (설치 가능). 아이콘은 SVG 하나(sizes any)로 두고, 래스터 아이콘은 필요 시 추가한다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "라이프 매니저",
    short_name: "라이프",
    description: "일정 · 할일 · 가계부를 한곳에서",
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
