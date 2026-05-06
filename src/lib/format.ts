/**
 * Converts camelCase, kebab-case, or snake_case to "Title Case Words"
 * Examples:
 *   "mySkillName"   → "My Skill Name"
 *   "claude-agent"  → "Claude Agent"
 *   "CLAUDE"        → "CLAUDE"
 *   "setup-codebase" → "Setup Codebase"
 */
export function formatName(raw: string): string {
  // Remove leading dot and known extensions
  const withoutExt = raw.replace(/^\./, "").replace(/\.(md|mdc)$/i, "");

  return withoutExt
    // Insert space before uppercase letters that follow lowercase
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    // Replace hyphens and underscores with spaces
    .replace(/[-_]/g, " ")
    // Split, filter empty, capitalize each word
    .split(" ")
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
    .trim();
}

/** Git `%ci`-style timestamp: `2026-04-09 17:26:42 +0200`. */
const GIT_CI_RE =
  /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/;

function gitCiToInstant(raw: string): Date | null {
  const t = raw.trim();
  const m = t.match(GIT_CI_RE);
  if (m) {
    const [, y, mo, d, h, mi, s, sign, oh, om] = m;
    const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${sign}${oh}:${om}`;
    const date = new Date(iso);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const fallback = new Date(t);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Readable date for Git commit timestamps (weekday, day, full month name, year, local time).
 * Falls back to the raw string if parsing fails.
 */
export function formatGitCommitDate(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const date = gitCiToInstant(trimmed);
  if (!date) return trimmed;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
