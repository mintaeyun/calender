import { Suspense } from "react";
import { CalendarScreen } from "@/features/calendar/components/CalendarScreen";

export const metadata = { title: "일정 · 라이프 매니저" };

export default function Page() {
  return (
    <Suspense>
      <CalendarScreen />
    </Suspense>
  );
}
