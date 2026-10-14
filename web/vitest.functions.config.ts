import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Edge Function 순수 로직 테스트(Deno 없이 Node에서 실행). `npm run test:functions`
export default defineConfig({
  root: "../supabase/functions",
  cacheDir: fileURLToPath(new URL("./node_modules/.vite-functions", import.meta.url)),
  test: { include: ["**/*.test.ts"] },
});
