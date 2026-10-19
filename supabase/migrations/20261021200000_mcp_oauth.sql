-- 06 mcp: OAuth 2.1 어댑터 (ChatGPT·Claude 커넥터 공통 인증).
-- 설계: OAuth 로 연결하면 기존 mcp_tokens 에 행이 하나 생긴다(source='oauth'). 설정 > MCP 탭의 범위·폐기·마지막 사용·로그·분당 호출 제한이
-- 수동 발급 토큰과 같은 경로를 쓴다. 액세스 토큰은 만료(expires_at)가 있고, 리프레시 토큰은 해시로만 저장하며 사용할 때마다 회전한다.

-- ---------------------------------------------------------------------------
-- 동적 클라이언트 등록(DCR, RFC 7591) 결과.
-- 예외: 이 테이블에는 user_id 가 없다. 클라이언트 등록은 로그인 전에 일어나고(익명 요청) 사용자 데이터를 담지 않는 공개 메타데이터라서다.
-- RLS 를 켜고 정책을 만들지 않아 anon/authenticated 는 접근할 수 없고, mcp 함수(service role)만 읽고 쓴다.
-- ---------------------------------------------------------------------------
create table public.oauth_clients (
  id uuid primary key default gen_random_uuid(),            -- client_id
  client_name text not null check (length(client_name) between 1 and 100),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 10),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.oauth_clients enable row level security;

-- ---------------------------------------------------------------------------
-- 인가 코드: 1회용·단기 만료. 코드는 해시로만 저장한다.
-- ---------------------------------------------------------------------------
create table public.oauth_codes (
  code_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references public.oauth_clients (id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,                              -- PKCE S256
  scopes jsonb not null,                                     -- { calendar, todo, ledger } 각 none|read|write
  resource text,                                             -- RFC 8707 (요청에 있으면 저장)
  expires_at timestamptz not null,
  used_at timestamptz,                                       -- 사용되면 기록. 재사용 시도는 발급된 토큰을 폐기한다.
  token_id uuid,                                             -- 이 코드로 발급한 mcp_tokens 행
  created_at timestamptz not null default now()
);
create index oauth_codes_user_idx on public.oauth_codes (user_id);
create index oauth_codes_expires_idx on public.oauth_codes (expires_at);
alter table public.oauth_codes enable row level security;   -- 정책 없음: service role 전용

-- ---------------------------------------------------------------------------
-- mcp_tokens 확장: OAuth 연결 정보
-- ---------------------------------------------------------------------------
alter table public.mcp_tokens
  add column source text not null default 'manual' check (source in ('manual', 'oauth')),
  add column client_id uuid references public.oauth_clients (id) on delete set null,
  add column client_name text,                               -- 표시용(클라이언트가 삭제돼도 남는다)
  add column expires_at timestamptz,                         -- 액세스 토큰 만료. null = 수동 토큰(만료 없음)
  add column refresh_hash text unique,                       -- 현재 리프레시 토큰의 해시
  add column prev_refresh_hash text,                         -- 직전 리프레시 토큰의 해시(재사용 감지용)
  add column refresh_expires_at timestamptz,
  add constraint mcp_tokens_oauth_chk check (source = 'manual' or (client_id is not null or client_name is not null));

create index mcp_tokens_prev_refresh_idx on public.mcp_tokens (prev_refresh_hash) where prev_refresh_hash is not null;

-- 브라우저(authenticated)가 리프레시 토큰 해시를 읽거나 토큰 정보를 직접 바꾸지 못하게 한다.
-- 열 단위 revoke 는 테이블 단위 grant 를 이기지 못하므로, 테이블 권한을 거두고 필요한 열만 다시 준다.
-- 목록·발급·폐기는 mcp 함수(service role)가 하고, 화면은 함수의 GET /tokens 를 쓴다.
revoke select, insert, update on public.mcp_tokens from authenticated;
grant select (id, user_id, name, token_prefix, scopes, last_used_at, revoked_at, created_at, updated_at, source, client_name, expires_at)
  on public.mcp_tokens to authenticated;
-- 삭제(delete)는 기존 RLS 정책대로 본인 행만 가능

-- 만료된 코드·오래된 클라이언트 정리는 pg_cron 으로: 매일 1회
create or replace function public.purge_oauth_stale()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.oauth_codes where expires_at < now() - interval '1 day';
  delete from public.oauth_clients c
   where coalesce(c.last_used_at, c.created_at) < now() - interval '30 days'
     and not exists (select 1 from public.mcp_tokens t where t.client_id = c.id and t.revoked_at is null);
$$;
revoke all on function public.purge_oauth_stale() from public, anon, authenticated;

select cron.schedule('purge-oauth-stale', '30 18 * * *', $$select public.purge_oauth_stale()$$);   -- 03:30 KST
