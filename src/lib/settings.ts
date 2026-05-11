const SETTINGS_KEY = "agenture-settings";

export type EditorFontSize = "small" | "medium" | "large";

export const EDITOR_FONT_SIZE_PX: Record<EditorFontSize, string> = {
  small: "12px",
  medium: "14px",
  large: "16px",
};

export interface AppSettings {
  theme: "light" | "dark" | "system";
  editorFontSize: EditorFontSize;
  confirmBeforeDelete: boolean;
  reopenLastRepo: boolean;
  autoCheckUpdates: boolean;
}

const DEFAULTS: AppSettings = {
  theme: "system",
  editorFontSize: "medium",
  confirmBeforeDelete: true,
  reopenLastRepo: true,
  autoCheckUpdates: true,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return { ...DEFAULTS, ...(JSON.parse(raw ?? "{}") as Partial<AppSettings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* quota exceeded */
  }
}

export function applyTheme(theme: AppSettings["theme"]): void {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", isDark);
}

export function applyEditorFontSize(size: EditorFontSize): void {
  document.documentElement.style.setProperty(
    "--editor-font-size",
    EDITOR_FONT_SIZE_PX[size],
  );
}

export function applySettings(settings: AppSettings): void {
  applyTheme(settings.theme);
  applyEditorFontSize(settings.editorFontSize);
}
