# Agenture Development Guide

## Cursor Cloud specific instructions

### Overview

Agenture is a Tauri v2 desktop app (Rust backend + React/TypeScript frontend). It has no external services, no database, and no Docker dependencies. All state is local filesystem + localStorage.

### System dependencies (pre-installed in VM)

The update script handles `pnpm install` and `cargo fetch`. The following system packages must be present (installed during initial VM setup, not in the update script):

- `libwebkit2gtk-4.1-dev`, `libjavascriptcoregtk-4.1-dev`, `libsoup-3.0-dev` (Tauri WebView)
- `libgtk-3-dev`, `librsvg2-dev`, `patchelf` (Tauri Linux build)
- `libssl-dev`, `pkg-config` (Rust OpenSSL bindings)
- Rust stable toolchain ≥ 1.85 (required for `edition2024` crate features)

### Running the app

- **Frontend only (Vite):** `npx vite --port 1420` — serves React UI at http://localhost:1420
- **Full desktop app:** `DISPLAY=:1 npx tauri dev` — compiles Rust backend + launches desktop window (uses virtual display `:1` in cloud VMs)
- The `tauri dev` command automatically starts Vite via `beforeDevCommand` in `src-tauri/tauri.conf.json`

### Lint / Type checking

- **TypeScript:** `npx tsc --noEmit` (strict mode, no ESLint configured)
- **Rust:** `cd src-tauri && cargo clippy` (or `cargo check` for faster feedback)

### Build

- **Frontend:** `npx vite build` (outputs to `dist/`)
- **Full app:** `npx tauri build` (produces platform-specific installers)

### Key gotchas

1. **pnpm build scripts:** pnpm v10+ blocks build scripts by default. After `pnpm install`, run `pnpm rebuild esbuild sharp` to ensure platform binaries are compiled.
2. **Rust edition 2024:** Some transitive dependencies require Rust edition 2024, so `rustc ≥ 1.85` is required. The update script ensures `rustup default stable` is set.
3. **Virtual display:** The cloud VM has Xvfb on `:1`. Always set `DISPLAY=:1` when launching the Tauri window.
4. **EGL warnings:** `libEGL warning: DRI3 error` is expected in virtual display environments — it does not affect app functionality.
5. **No ESLint:** The project uses only TypeScript strict-mode checks (`tsc --noEmit`) for linting, with no ESLint configuration.
