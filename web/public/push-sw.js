// 웹 푸시용 서비스 워커 (05 notify). 서버가 { title, body, link } JSON 을 보낸다.
// 앱 셸 캐싱/PWA 는 이 파일의 범위가 아니다(08 integration).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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
