"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QuickAddProvider } from "./QuickAdd";

/** 전역 Provider: TanStack Query + 빠른 추가. 쿼리 키 규칙은 [영역, 대상, 파라미터] (예: ['events', range]). */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <QuickAddProvider>{children}</QuickAddProvider>
    </QueryClientProvider>
  );
}
