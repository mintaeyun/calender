"use client";

import { useGoogleAutoSync } from "../hooks";

/** 앱 셸에 한 번 마운트: 앱 진입 시 마지막 동기화가 5분 넘었으면 백그라운드로 동기화 (GCAL-8). 화면은 그리지 않는다. */
export function GoogleAutoSync() {
  useGoogleAutoSync();
  return null;
}
