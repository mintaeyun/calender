import { notFound } from "next/navigation";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";

const TABS: Record<string, string> = {
  profile: "프로필 · 화면",
  cats: "카테고리 · 태그",
  noti: "알림",
  google: "Google 캘린더",
  weather: "날씨",
  mcp: "MCP 연결",
  backup: "백업 · 내보내기",
};

export default async function Page({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  if (!(tab in TABS)) notFound();
  return <PagePlaceholder title={`설정 · ${TABS[tab]}`} />;
}
