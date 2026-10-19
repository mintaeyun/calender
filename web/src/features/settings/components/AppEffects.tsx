"use client";

import { PwaRegister } from "@/features/pwa/components/PwaRegister";
import { ThemeSync } from "./ThemeSync";

/** 화면이 없는 전역 효과 모음: 테마 반영 + PWA 서비스 워커 등록. Providers 안에 한 번 마운트한다(REQUESTS: 01 대상). */
export function AppEffects() {
  return (
    <>
      <ThemeSync />
      <PwaRegister />
    </>
  );
}
