```txt
 █████╗  ██████╗ ███████╗███╗   ██╗████████╗██╗   ██╗██████╗ ███████╗
██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝██║   ██║██╔══██╗██╔════╝
███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ██║   ██║██████╔╝█████╗
██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ██║   ██║██╔══██╗██╔══╝
██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ╚██████╔╝██║  ██║███████╗
╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚══════╝
```

**Agenture** is a desktop app for managing AI agent context files across your projects — agents, skills, memory, MCP servers, and terminals, all in one place.

---

## Features

- **Agent files** — Browse, edit, and create context files for Claude, Cursor, GitHub Copilot, Windsurf, and more (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, etc.)
- **Skills** — Install and explore skills from the [skills.sh](https://skills.sh) registry, with a secondary sidebar showing each skill's files
- **Memory** — Browse your `.memory/` folder with per-category navigation (Context, Decision, Pattern, Preference)
- **MCP Servers** — Configure and manage MCP servers for your project via a visual UI
- **AI Terminal** — Open AI coding assistants (Claude Code, Cursor, Copilot, etc.) in tabbed terminal sessions directly in the app
- **Git graph** — Visualize your repo's commit history
- **Setup Agenture** — Install the full agent context scaffold in one click, with support for Cursor, GitHub Copilot, and Claude Code
- **Cmd+K search** — Search agents, skills, and file contents across your whole project

---

## Installation

Download the latest installer for your platform from the [releases page](https://github.com/Mart1M/agenture.md/releases/latest).

| Platform | Format |
|---|---|
| macOS (Apple Silicon) | `.dmg` |
| macOS (Intel) | `.dmg` |
| Windows | `.exe` (NSIS) |
| Linux | `.AppImage` / `.deb` |

The app updates automatically when a new version is available.

---

## Getting started

1. Open the app and click **Open Repository** (or use the File menu)
2. Select your project folder — Agenture scans it for agent context files
3. Browse and edit your agents and skills from the sidebar
4. Use **Setup Agenture** (top bar) to scaffold the full agent memory structure if starting from scratch

---

## Tech stack

Built with [Tauri v2](https://tauri.app) (Rust backend), React 19, TypeScript, and shadcn/ui.

---

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and guidelines.

## License

[Apache 2.0](LICENSE)

---

## Security

**MCP credentials** — The MCP Servers view lets you configure HTTP headers (e.g. `Authorization: Bearer <token>`) for remote servers. These are stored in plain text in `.mcp.json` at the root of your project. If your `.mcp.json` contains authentication tokens, do not commit it to a public repository:

```
# .gitignore
.mcp.json
```
