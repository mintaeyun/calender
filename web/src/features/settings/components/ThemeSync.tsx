"use client";

import { useEffect } from "react";
import { useProfile } from "@/lib/profile";
import { applyTheme, type Theme } from "../lib/theme";

/** 프로필의 테마를 문서에 반영한다. 앱 셸에 한 번 마운트한다(REQUESTS: 01 대상). */
export function ThemeSync() {
  const theme = useProfile().data?.theme;
  useEffect(() => {
    if (theme) applyTheme(theme as Theme);
  }, [theme]);
  return null;
}
