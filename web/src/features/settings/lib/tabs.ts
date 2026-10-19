export const SETTINGS_TABS = [
  ["profile", "프로필 · 화면"],
  ["cats", "카테고리 · 태그"],
  ["noti", "알림"],
  ["google", "Google 캘린더"],
  ["weather", "날씨"],
  ["mcp", "MCP 연결"],
  ["backup", "백업 · 내보내기"],
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number][0];

export const isSettingsTab = (v: string): v is SettingsTab => SETTINGS_TABS.some(([k]) => k === v);
