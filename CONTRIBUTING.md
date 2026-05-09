# Contributing to Agenture

Thank you for your interest in contributing! This document covers everything you need to get started.

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | [Tauri v2](https://tauri.app) (Rust) |
| Frontend | React 19 + TypeScript + Vite |
| UI components | [shadcn/ui](https://ui.shadcn.com) + Tailwind CSS |
| State | Zustand |
| Terminal | xterm.js |

## Prerequisites

- [Node.js](https://nodejs.org) ≥ 20
- [Rust](https://rustup.rs) (stable toolchain)
- Tauri CLI: `cargo install tauri-cli`
- System dependencies for Tauri: follow the [platform-specific guide](https://tauri.app/start/prerequisites/)

## Getting started

```bash
git clone https://github.com/<org>/agenture.git
cd agenture
npm install
npm run tauri dev
```

The app hot-reloads the frontend automatically. Rust changes trigger a recompile.

## Project structure

```
src/                    # React frontend
  components/
    layout/             # AppSidebar, TopBar, MainPanel
    memory/             # Memory navigator (secondary sidebar)
    skills/             # Skill navigator & registry
    terminal/           # Terminal sessions (xterm.js)
    setup/              # Setup Agenture dialog
    common/             # Shared UI helpers
  store.ts              # Zustand global state
  types.ts              # Shared TypeScript types

src-tauri/
  src/
    commands/           # Tauri commands (scan, file ops, terminal…)
    types.rs            # Rust structs mirrored in types.ts
    lib.rs              # Command registration
```

## Making changes

### Frontend

Components live under `src/components/`. Add shadcn/ui primitives with:

```bash
npx shadcn@latest add <component>
```

Keep state in `store.ts` (Zustand). Mirror any new backend types in both `src-tauri/src/types.rs` and `src/types.ts`.

### Backend (Rust)

New Tauri commands go in `src-tauri/src/commands/` and must be registered in `lib.rs`. Run `cargo check` inside `src-tauri/` to catch errors without a full rebuild.

```bash
cd src-tauri && cargo check
```

## Submitting a pull request

1. Fork the repository and create a branch from `main`.
2. Keep each PR focused on a single change.
3. Update `CHANGELOG.md` under `[Unreleased]` with a brief description.
4. Make sure the app builds without errors (`npm run tauri build` or at least `npm run build` for the frontend).
5. Open the PR — describe what changed and why, and include a screenshot for any UI change.

## Reporting issues

Open a GitHub issue and include:
- OS and version
- Steps to reproduce
- What you expected vs. what happened
- Screenshot or log if relevant

## License

By contributing you agree that your code will be released under the [Apache License 2.0](LICENSE).
