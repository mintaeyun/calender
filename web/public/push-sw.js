// 서비스 워커 하나로 웹 푸시(05 notify)와 PWA 오프라인 폴백(08 integration)을 함께 처리한다.
// 푸시: 서버가 { title, body, link } JSON 을 보낸다.
// 오프라인: 페이지 이동 요청이 네트워크 오류로 실패하면 미리 저장한 /offline.html 을 보여준다.
//   로그인 데이터(API·페이지 본문)는 캐시하지 않는다 — 개인 정보가 남지 않게 폴백 페이지만 저장한다.
const CACHE = "lm-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())));
});

self.addEventListener("push", (event) => {
  let data = { title: "알림", body: "", link: "/notifications" };
  try {
    data = { ...data, ...event.data.json() };
  } catch (_) {
    /* 본문이 JSON 이 아니면 기본 문구 */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, { body: data.body, data: { link: data.link }, tag: data.link }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(link);
          return c.focus();
        }
      }
      return self.clients.openWindow(link);
    }),
  );
});
