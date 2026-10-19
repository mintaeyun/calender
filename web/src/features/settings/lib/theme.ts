export type Theme = "light" | "dark" | "system";
export const THEME_STORAGE_KEY = "lm-theme";

/** 'system' 은 data-theme 을 제거해 prefers-color-scheme 이 정하게 한다. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement) {
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* 저장 불가 환경(사생활 보호 모드)은 무시 */
  }
}

/** 첫 페인트 전에 실행해 깜빡임을 막는 인라인 스크립트 문자열 */
export const NO_FLASH_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
