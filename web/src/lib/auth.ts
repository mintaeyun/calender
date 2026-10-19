"use client";

import { createClient } from "@/lib/supabase/client";

/** 로그아웃 후 /login 으로 이동한다. */
export async function signOut() {
  await createClient().auth.signOut();
  window.location.assign("/login");
}

/** 영수증 파일(Storage receipts/<user_id>/<transaction_id>/…)을 모두 지운다. DB 삭제(cascade)로는 파일이 지워지지 않는다. */
async function removeReceiptFiles(userId: string) {
  const bucket = createClient().storage.from("receipts");
  const { data: folders } = await bucket.list(userId, { limit: 1000 });
  for (const folder of folders ?? []) {
    const { data: files } = await bucket.list(`${userId}/${folder.name}`, { limit: 1000 });
    const paths = (files ?? []).map((f) => `${userId}/${folder.name}/${f.name}`);
    if (paths.length) await bucket.remove(paths);
  }
}

/**
 * 계정 삭제(AUTH-3): 영수증 파일을 먼저 지우고, DB 데이터는 on delete cascade 로 함께 삭제된다.
 * TODO(07): 호출 전에 구글 토큰 revoke(gcal-sync 함수)를 먼저 호출한다. REQUESTS.md 참고.
 */
export async function deleteAccount() {
  const supabase = createClient();
  const { data: sess } = await supabase.auth.getSession();
  if (sess.session) await removeReceiptFiles(sess.session.user.id);
  const { error } = await supabase.rpc("delete_my_account");
  if (error) throw error;
  await supabase.auth.signOut();
  window.location.assign("/login");
}

/** Supabase Auth 오류를 한국어 문구로 바꾼다. */
export function authErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (m.includes("email not confirmed")) return "이메일 인증이 완료되지 않았습니다. 받은 메일의 링크를 눌러 주세요.";
  if (m.includes("user already registered")) return "이미 가입된 이메일입니다.";
  if (m.includes("password should be at least")) return "비밀번호는 6자 이상이어야 합니다.";
  if (m.includes("signup not allowed") || m.includes("database error saving new user"))
    return "허용된 이메일만 가입할 수 있습니다.";
  if (m.includes("rate limit") || m.includes("too many")) return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  if (m.includes("invalid email")) return "이메일 형식이 올바르지 않습니다.";
  if (m.includes("same password")) return "이전과 다른 비밀번호를 입력해 주세요.";
  return "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}
