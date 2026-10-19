import { Suspense } from "react";
import { SearchPage } from "@/features/search/components/SearchPage";

export default function Page() {
  return (
    <Suspense>
      <SearchPage />
    </Suspense>
  );
}
