// supabase gen types 를 실행해 성공했을 때만 database.types.ts 를 덮어쓴다.
// 실패한 실행이 기존 파일을 비우지 않도록 셸 리디렉션(>) 대신 쓴다.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const target = new URL("../src/lib/supabase/database.types.ts", import.meta.url);
// 기본은 로컬(Docker). `--linked` 를 주면 supabase link 된 원격 프로젝트 기준으로 생성한다.
const ref = process.env.SUPABASE_PROJECT_REF; // link 되지 않은 worktree 에서는 이 환경변수로 프로젝트를 지정한다
const source = ref ? ["--project-id", ref] : process.argv.includes("--linked") ? ["--linked"] : ["--local"];
const args = ["supabase", "gen", "types", "typescript", ...source, "--workdir", ".."];
const r = spawnSync("npx", args, { encoding: "utf8", shell: true });
if (r.status !== 0 || !r.stdout.includes("export type Database")) {
  console.error(r.stderr || r.stdout || "supabase gen types 실패");
  console.error("database.types.ts 는 변경하지 않았습니다. (Docker 실행 여부와 `npm run db:start` 상태를 확인하세요)");
  process.exit(1);
}
writeFileSync(target, r.stdout);
// Edge Function 은 web/ 밖을 import 할 수 없으므로 같은 파일을 _shared 에도 둔다.
writeFileSync(new URL("../../supabase/functions/_shared/database.types.ts", import.meta.url), r.stdout);
console.log("database.types.ts 갱신 완료");
