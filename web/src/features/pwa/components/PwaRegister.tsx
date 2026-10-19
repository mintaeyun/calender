"use client";

import { useEffect } from "react";

/**
 * 서비스 워커 등록(PWA 설치·오프라인 폴백). 05의 웹 푸시와 같은 /push-sw.js 하나를 쓴다.
 * 개발 서버에서는 캐시가 개발을 방해하므로 등록하지 않는다.
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/push-sw.js").catch(() => {
      /* 등록 실패는 앱 동작에 영향이 없다 */
    });
  }, []);
  return null;
}
