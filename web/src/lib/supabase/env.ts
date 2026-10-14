// Supabase 공개 키 이름: 새 방식 publishable 키(NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)를 우선 쓰고,
// 없으면 기존 anon 키(NEXT_PUBLIC_SUPABASE_ANON_KEY)로 폴백한다.
// NEXT_PUBLIC_* 는 빌드 시 리터럴 접근만 치환되므로 process.env.NAME 형태를 그대로 써야 한다.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
