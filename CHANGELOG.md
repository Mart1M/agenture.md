# Changelog

## [Unreleased]

## [0.1.5] - 2026-05-15

### Fixed
- Resolve `npx` path in `run_cli_command` to fix "No such file or directory" during setup

## [0.1.4] - 2026-05-09

### Added
- Memory tab in the sidebar: browse `.memory/` folder with folder-level navigation in the primary sidebar and file list in a secondary sidebar
- Per-folder icons for memory categories (Context, Decision, Pattern, Preference)
- Setup Agenture dialog: install Cursor, GitHub Copilot, and Claude Code agent context files via `npx agenture-cli@latest init` with selective install
- "Open in Claude Code" shortcut in Setup dialog that auto-runs `/setup-agenture` in a terminal session
- `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE` (Apache 2.0) for open source release

## [0.1.3]

### Changed
- Tauri CSP extended with `worker-src` directive

## [0.1.2]

### Added
- Token estimation and frontmatter extraction in FileEditor
- `TinyTokenGauge` component for visualizing token usage
- Shift+Enter support for newlines in terminal input
- DESIGN.md template (Google Stitch format) in the Create Agent dialog
- GitHub Copilot logo in TerminalDialog

### Changed
- MarkdownViewer metadata extraction improved
- Auto-rescan accepts a `silent` option to avoid loading spinner

## [0.1.1]

### Added
- Git graph view
- Create skill scaffold from the Skills tab
- Skill rename now moves the whole skill directory
- Color swatch rehype plugin in MarkdownViewer
- Skills registry search improvements

### Fixed
- Auto-rescan stability improvements

## [0.1.0]

### Added
- Initial release
- Scan and browse agent context files (CLAUDE.md, AGENTS.md, .cursorrules, etc.)
- Skills browser with secondary sidebar for skill file navigation
- AI Terminal with multi-session tab support
- MCP Servers view
- Git graph view
- Cmd+K search palette (names, paths, and full-text in context files)
- Light/dark theme toggle
- Recent repositories
- Auto-rescan every 2.5 seconds when the window is focused
