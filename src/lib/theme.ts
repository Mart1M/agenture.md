/** localStorage key for color scheme preference */
export const AGENTURE_THEME_STORAGE_KEY = "agenture-theme";

/** Call once at startup — must run before React paint matches stored preference */
export function hydrateAppTheme(): void {
  const stored = localStorage.getItem(AGENTURE_THEME_STORAGE_KEY);
  document.documentElement.classList.toggle("dark", stored !== "light");
}

/** Toggle light/dark, persist choice, returns whether dark is now active */
export function toggleAppTheme(): boolean {
  const root = document.documentElement;
  root.classList.toggle("dark");
  const isDark = root.classList.contains("dark");
  localStorage.setItem(
    AGENTURE_THEME_STORAGE_KEY,
    isDark ? "dark" : "light",
  );
  return isDark;
}
