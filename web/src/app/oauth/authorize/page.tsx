import { Suspense } from "react";
import { OAuthConsent } from "@/features/mcp/components/OAuthConsent";

export const metadata = { title: "앱 연결 승인 · 라이프 매니저" };

export default function Page() {
  return (
    <Suspense fallback={<p className="text-fg-subtle">불러오는 중…</p>}>
      <OAuthConsent />
    </Suspense>
  );
}
