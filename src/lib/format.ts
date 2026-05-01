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
