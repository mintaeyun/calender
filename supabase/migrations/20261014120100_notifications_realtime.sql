-- 05 notifications: 알림함/헤더 배지가 Supabase Realtime 으로 변경을 즉시 받도록 publication 에 추가한다. RLS 가 적용돼 본인 알림만 전달된다.
alter publication supabase_realtime add table public.notifications;
