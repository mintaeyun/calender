import { Suspense } from "react";
import { LedgerList } from "@/features/ledger/components/LedgerList";

export default function Page() {
  return (
    <Suspense>
      <LedgerList />
    </Suspense>
  );
}
