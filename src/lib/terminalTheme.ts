import type { ITheme } from "@xterm/xterm";

/** ANSI palette tuned for light backgrounds */
const ANSI_LIGHT: Pick<
  ITheme,
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "brightBlack"
  | "brightRed"
  | "brightGreen"
  | "brightYellow"
  | "brightBlue"
  | "brightMagenta"
  | "brightCyan"
  | "brightWhite"
> = {
  black: "#24292f",
  red: "#cf222e",
  green: "#116329",
  yellow: "#9a6700",
  blue: "#0969da",
  magenta: "#8250df",
  cyan: "#1b7c83",
  white: "#6e7781",
  brightBlack: "#57606a",
  brightRed: "#a40e26",
  brightGreen: "#1a7f37",
  brightYellow: "#bf8700",
  brightBlue: "#0550ae",
  brightMagenta: "#6639ba",
  brightCyan: "#137a9e",
  brightWhite: "#1f2328",
};

/** ANSI palette tuned for dark backgrounds */
const ANSI_DARK: typeof ANSI_LIGHT = {
  black: "#484f58",
  red: "#ff7b72",
  green: "#56d364",
  yellow: "#e3b341",
  blue: "#79c0ff",
  magenta: "#d2a8ff",
  cyan: "#56d4dd",
  white: "#b1bac4",
  brightBlack: "#6e7781",
  brightRed: "#ffa198",
  brightGreen: "#7ee787",
  brightYellow: "#f2cc60",
  brightBlue: "#a5d6ff",
  brightMagenta: "#ebbdf8",
  brightCyan: "#b3e0ff",
  brightWhite: "#f0f6fc",
};

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

/** Theme aligned with the app shell (light / dark) + readable ANSI colors */
export function buildTerminalTheme(): ITheme {
  const dark = document.documentElement.classList.contains("dark");
  const background = cssVar("--background", dark ? "#0a0a0a" : "#ffffff");
  const foreground = cssVar("--foreground", dark ? "#fafafa" : "#0a0a0a");
  const accent = cssVar("--accent", dark ? "#404040" : "#f4f4f5");
  const accentFg = cssVar("--accent-foreground", foreground);

  return {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: accent,
    selectionForeground: accentFg,
    ...(dark ? ANSI_DARK : ANSI_LIGHT),
  };
}

/** Re-run when `document.documentElement` `class` changes (e.g. theme toggle). */
export function subscribeTerminalThemeHost(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}
