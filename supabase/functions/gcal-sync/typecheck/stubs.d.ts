// Deno 없이 타입 점검(tsc)하기 위한 최소 선언. 실제 타입은 Deno/supabase-js 가 제공한다.
declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void;
  env: { get(name: string): string | undefined };
};
declare module "npm:@supabase/supabase-js@2" {
  export type SupabaseClient<_D = unknown> = any;
  export function createClient<_D = unknown>(url: string, key: string, opts?: unknown): any;
}
