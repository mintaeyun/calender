// 웹 푸시 구독(클라이언트). 권한 요청은 사용자가 버튼을 누른 뒤에만 한다.
// 공개키: NEXT_PUBLIC_VAPID_PUBLIC_KEY. 비밀키는 Edge secrets(VAPID_PRIVATE_KEY)에만 있고 여기에는 없다.
// 구독 정보는 notification_settings.push_subscriptions(jsonb 배열)에 endpoint 기준으로 중복 없이 저장한다.

export type StoredSub = { endpoint: string; keys: { p256dh: string; auth: string } };

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export const vapidConfigured = () => Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const padded = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** endpoint 기준으로 추가(이미 있으면 교체) */
export const withSub = (list: StoredSub[], sub: StoredSub): StoredSub[] => [...list.filter((s) => s.endpoint !== sub.endpoint), sub];
export const withoutSub = (list: StoredSub[], endpoint: string): StoredSub[] => list.filter((s) => s.endpoint !== endpoint);

export type SubscribeResult = { ok: true; sub: StoredSub } | { ok: false; reason: "unsupported" | "no-key" | "denied" | "failed" };

/** 권한 요청 → 서비스 워커 등록 → 푸시 구독. 반드시 클릭 핸들러에서 호출한다. */
export async function subscribePush(): Promise<SubscribeResult> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return { ok: false, reason: "no-key" };
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, reason: "denied" };
    const reg = await navigator.serviceWorker.register("/push-sw.js");
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
    const j = sub.toJSON();
    if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return { ok: false, reason: "failed" };
    return { ok: true, sub: { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } } };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** 이 브라우저의 구독을 해제하고 endpoint 를 돌려준다(없으면 null). */
export async function unsubscribePush(): Promise<string | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}
