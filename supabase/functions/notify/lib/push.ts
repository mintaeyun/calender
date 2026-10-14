// 웹 푸시 발송(NOTI-2). VAPID 비밀키는 Edge secrets(VAPID_PRIVATE_KEY)에만 있고 로그·응답에 남기지 않는다.
// 필요한 secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT(mailto: 또는 https: URL). 하나라도 없으면 푸시는 건너뛴다.

export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushPayload = { title: string; body: string; link: string };

let configured: boolean | null = null;
// deno-lint-ignore no-explicit-any
let webpush: any = null;

async function setup(): Promise<boolean> {
  if (configured !== null) return configured;
  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT");
  if (!pub || !priv || !subject) return (configured = false);
  webpush = (await import("npm:web-push@3.6.7")).default;
  webpush.setVapidDetails(subject, pub, priv);
  return (configured = true);
}

/** 모든 구독에 발송한다. sent = 성공 수, gone = 만료(404/410)로 지워야 할 endpoint 목록. */
export async function deliverPush(subs: PushSub[], payload: PushPayload): Promise<{ sent: number; gone: string[] }> {
  if (!(await setup())) return { sent: 0, gone: [] };
  const body = JSON.stringify(payload);
  let sent = 0;
  const gone: string[] = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(s, body, { TTL: 3600 });
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) gone.push(s.endpoint);
      else console.error("push failed", status ?? "", (e as Error).message); // endpoint·키는 로그에 남기지 않는다
    }
  }));
  return { sent, gone };
}
