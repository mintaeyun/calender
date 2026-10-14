import type { ReactNode } from "react";
import { LedgerShell } from "@/features/ledger/components/LedgerShell";

export default function Layout({ children }: { children: ReactNode }) {
  return <LedgerShell>{children}</LedgerShell>;
}
