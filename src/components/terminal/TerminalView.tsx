import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal, type ILinkHandler } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import {
  TerminalSquare,
  RefreshCw,
  ArrowLeftRight,
  X,
  Plus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAppStore, type AiToolBasic } from "@/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TerminalPackageScriptsAside } from "@/components/terminal/TerminalPackageScriptsAside";
import {
  buildTerminalTheme,
  subscribeTerminalThemeHost,
} from "@/lib/terminalTheme";

function openHttpUrlFromTerminal(href: string): void {
  try {
    const u = new URL(href.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return;
    }
    void openUrl(u.href);
  } catch {
    /* ignore malformed URLs */
  }
}

const osc8LinkHandler: ILinkHandler = {
  activate(_event, text): void {
    openHttpUrlFromTerminal(text);
  },
  allowNonHttpProtocols: false,
};

// ── Session pane ──────────────────────────────────────────────────────────────

function TerminalSessionPane({
  sessionId,
  tool,
  cwd,
  isActive,
  onStateChange,
  initialInput,
}: {
  sessionId: string;
  tool: AiToolBasic;
  cwd: string | null | undefined;
  isActive: boolean;
  onStateChange: (
    id: string,
    state: { isRunning: boolean; isSpawning: boolean },
  ) => void;
  initialInput?: string | null;
}) {
  const { repoPath } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isActiveRef = useRef(isActive);
  const initialInputTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // ── Init xterm + auto-launch on mount ──────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      theme: buildTerminalTheme(),
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 5000,
      allowTransparency: true,
      linkHandler: osc8LinkHandler,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(
      new WebLinksAddon((_event, uri) => {
        openHttpUrlFromTerminal(uri);
      }),
    );
    terminal.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Ensure Shift+Enter is forwarded distinctly (not collapsed to Enter).
    // Some CLI apps (Claude Code, etc.) rely on this to insert a newline
    // instead of submitting the prompt.
    terminal.attachCustomKeyEventHandler((event) => {
      if (
        event.type === "keydown" &&
        event.key === "Enter" &&
        event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        const bytes = Array.from(new TextEncoder().encode("\u001b[13;2u"));
        invoke("write_terminal", { sessionId, data: bytes }).catch(() => {});
        return false;
      }
      return true;
    });

    const syncTerminalTheme = () => {
      terminal.options.theme = buildTerminalTheme();
      terminal.refresh(0, Math.max(0, terminal.rows - 1));
    };
    const unsubTheme = subscribeTerminalThemeHost(syncTerminalTheme);

    terminal.onData((data) => {
      const bytes = Array.from(new TextEncoder().encode(data));
      invoke("write_terminal", { sessionId, data: bytes }).catch(() => {});
    });

    const observer = new ResizeObserver(() => {
      if (!isActiveRef.current) return;
      try {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        if (dims && dims.cols > 0 && dims.rows > 0) {
          invoke("resize_terminal", {
            sessionId,
            cols: dims.cols,
            rows: dims.rows,
          }).catch(() => {});
        }
      } catch {
        /* hidden container */
      }
    });
    observer.observe(containerRef.current);

    // Auto-launch
    void launch(terminal, fitAddon);

    return () => {
      if (initialInputTimerRef.current !== null) {
        clearTimeout(initialInputTimerRef.current);
        initialInputTimerRef.current = null;
      }
      unsubTheme();
      observer.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      invoke("kill_terminal", { sessionId }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Tauri event listeners ──────────────────────────────────────────────
  useEffect(() => {
    const u1 = listen<number[]>(`terminal-output-${sessionId}`, (event) => {
      terminalRef.current?.write(new Uint8Array(event.payload));
    });
    const u2 = listen(`terminal-exit-${sessionId}`, () => {
      terminalRef.current?.writeln("\r\n\x1b[33m[Process exited]\x1b[0m");
      onStateChange(sessionId, { isRunning: false, isSpawning: false });
    });
    return () => {
      u1.then((f) => f());
      u2.then((f) => f());
    };
  }, [sessionId, onStateChange]);

  // ── Fit + focus when tab becomes active ───────────────────────────────
  useEffect(() => {
    if (!isActive) return;
    requestAnimationFrame(() => {
      fitAddonRef.current?.fit();
      const dims = fitAddonRef.current?.proposeDimensions();
      if (dims && dims.cols > 0 && dims.rows > 0) {
        invoke("resize_terminal", {
          sessionId,
          cols: dims.cols,
          rows: dims.rows,
        }).catch(() => {});
      }
      terminalRef.current?.focus();
    });
  }, [isActive, sessionId]);

  async function launch(
    terminal = terminalRef.current,
    fitAddon = fitAddonRef.current,
  ) {
    const workDir = cwd ?? repoPath;
    if (!terminal) return;
    if (!workDir) {
      terminal.writeln(
        "\r\n\x1b[31mCannot start terminal: no working directory.\x1b[0m",
      );
      onStateChange(sessionId, { isRunning: false, isSpawning: false });
      return;
    }
    terminal.clear();
    onStateChange(sessionId, { isRunning: false, isSpawning: true });

    const dims = fitAddon?.proposeDimensions() ?? { cols: 120, rows: 36 };

    try {
      await invoke("spawn_terminal", {
        sessionId,
        command: tool.command,
        args: tool.args,
        cwd: workDir,
        cols: dims.cols,
        rows: dims.rows,
      });
      onStateChange(sessionId, { isRunning: true, isSpawning: false });
      setTimeout(() => terminalRef.current?.focus(), 50);
      if (initialInput) {
        initialInputTimerRef.current = setTimeout(() => {
          initialInputTimerRef.current = null;
          const bytes = Array.from(new TextEncoder().encode(initialInput));
          invoke("write_terminal", { sessionId, data: bytes }).catch(() => {});
        }, 3000);
      }
    } catch (e) {
      terminal.writeln(
        `\r\n\x1b[31mFailed to launch ${tool.label}: ${e}\x1b[0m`,
      );
      onStateChange(sessionId, { isRunning: false, isSpawning: false });
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "min-h-0 flex-1 flex-col px-2 py-1 [&_.xterm-viewport]:min-h-0",
        !isActive && "hidden flex-none",
      )}
    />
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function TerminalView() {
  const {
    repoPath,
    terminalSessions,
    activeTerminalSessionId,
    setActiveTerminalSessionId,
    removeTerminalSession,
    replaceTerminalSession,
    setIsTerminalDialogOpen,
    setTerminalDialogCallback,
    addTerminalSession,
  } = useAppStore();

  const [packagesAsideOpen, setPackagesAsideOpen] = useState(true);

  const [sessionStates, setSessionStates] = useState<
    Map<string, { isRunning: boolean; isSpawning: boolean }>
  >(new Map());

  const handleStateChange = useCallback(
    (id: string, state: { isRunning: boolean; isSpawning: boolean }) => {
      setSessionStates((prev) => new Map(prev).set(id, state));
    },
    [],
  );

  useEffect(() => {
    const valid = new Set(terminalSessions.map((s) => s.id));
    setSessionStates((prev) => {
      let mutated = false;
      const next = new Map(prev);
      for (const id of next.keys()) {
        if (!valid.has(id)) {
          next.delete(id);
          mutated = true;
        }
      }
      return mutated ? next : prev;
    });
  }, [terminalSessions]);

  function sessionTabStatus(
    state: { isRunning: boolean; isSpawning: boolean } | undefined,
  ): "starting" | "running" | "idle" {
    if (state === undefined) return "starting";
    if (state.isSpawning) return "starting";
    if (state.isRunning) return "running";
    return "idle";
  }

  function openNewSession() {
    setTerminalDialogCallback((tool) => {
      addTerminalSession(tool);
    });
    setIsTerminalDialogOpen(true);
  }

  function openChangeProvider() {
    if (!activeTerminalSessionId) return;
    const oldId = activeTerminalSessionId;
    setTerminalDialogCallback((tool) => {
      replaceTerminalSession(oldId, tool);
    });
    setIsTerminalDialogOpen(true);
  }

  const activeTabStatus = activeTerminalSessionId
    ? sessionTabStatus(sessionStates.get(activeTerminalSessionId))
    : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0 min-w-0">
            {/* Tabs */}
            <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
              {terminalSessions.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                  <TerminalSquare className="h-3.5 w-3.5" />
                  No active session
                </div>
              ) : (
                terminalSessions.map((session) => {
                  const state = sessionStates.get(session.id);
                  const tabStatus = sessionTabStatus(state);
                  const isActive = session.id === activeTerminalSessionId;
                  return (
                    <div
                      key={session.id}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors shrink-0 cursor-pointer select-none",
                        isActive
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                      )}
                      onClick={() => setActiveTerminalSessionId(session.id)}
                    >
                      {tabStatus === "starting" && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500 animate-pulse"
                          aria-hidden
                          title="Starting…"
                        />
                      )}
                      {tabStatus === "running" && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500"
                          aria-hidden
                          title="Running"
                        />
                      )}
                      {tabStatus === "idle" && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40"
                          aria-hidden
                          title="Stopped"
                        />
                      )}
                      {session.tool.label}
                      <button
                        className="ml-0.5 rounded hover:bg-foreground/10 p-0.5 transition-colors cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTerminalSession(session.id);
                        }}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  );
                })
              )}

              {/* New session button */}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 shrink-0"
                onClick={openNewSession}
                title="New session"
                disabled={!repoPath}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-1 shrink-0">
              {activeTabStatus === "running" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => {
                    if (activeTerminalSessionId) {
                      const session = terminalSessions.find(
                        (s) => s.id === activeTerminalSessionId,
                      );
                      if (session)
                        replaceTerminalSession(
                          activeTerminalSessionId,
                          session.tool,
                        );
                    }
                  }}
                  title="Restart session"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={openChangeProvider}
                title="Change provider"
                disabled={!activeTerminalSessionId}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Session panes — all mounted, only active is visible */}
          <div className="relative flex min-h-0 flex-1 flex-col">
            {terminalSessions.length === 0 ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center">
                <TerminalSquare className="h-10 w-10 text-muted-foreground/40" />
                <div>
                  <p className="text-sm font-medium">No terminal session</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click <strong>+</strong> to start a new session
                  </p>
                  <p className="text-xs text-muted-foreground mt-3 max-w-xs">
                    Open the packages panel on the right to run npm/pnpm scripts
                    in the matching folder.
                  </p>
                </div>
              </div>
            ) : (
              terminalSessions.map((session) => (
                <TerminalSessionPane
                  key={session.id}
                  sessionId={session.id}
                  tool={session.tool}
                  cwd={session.cwd}
                  isActive={session.id === activeTerminalSessionId}
                  onStateChange={handleStateChange}
                  initialInput={session.initialInput}
                />
              ))
            )}
          </div>
        </div>

        <div className="flex min-h-0 shrink-0 self-stretch">
          <div className="flex w-7 shrink-0 flex-col items-center border-l border-border/80 bg-muted/20 border-r">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-full w-full shrink-0 rounded-none p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setPackagesAsideOpen((o) => !o)}
              title={
                packagesAsideOpen
                  ? "Hide packages panel"
                  : "Show packages panel"
              }
            >
              {packagesAsideOpen ? (
                <ChevronRight className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronLeft className="h-4 w-4" aria-hidden />
              )}
            </Button>
          </div>
          {packagesAsideOpen ? (
            <TerminalPackageScriptsAside repoPath={repoPath} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
