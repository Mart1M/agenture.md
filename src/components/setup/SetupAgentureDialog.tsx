import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Check, Copy, TerminalSquare, Wand2 } from "lucide-react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { showToast } from "@/components/common/Toaster";
import type { CommandOutput, RepoScanResult } from "@/types";

const SETUP_PROMPT =
  "Read AGENT_SKILLS_INSTALL.md at the repository root and execute phase 2 then phase 3 as described there — run the actual shell commands from the project root (network allowed), not a summary. Use the correct npx skills --agent (or -a) for this session (e.g. codex, cursor, github-copilot, claude-code); ask once if unsure. After installing skills, complete phase 3: update AGENTS.md with a real Project description, actual Conventions inferred from the repo, and the Installed skills list with one-line explanations. End with npx skills list and tell me what to commit.";

type OptionId = "global" | "cursor" | "copilot" | "claude";

/** Files created by agenture-cli per category — used to prune after install. */
const CATEGORY_FILES: Record<OptionId, string[]> = {
  global: [
    ".agents/README.md",
    ".memory/INDEX.md",
    "AGENTS.md",
    "AGENT_MEMORY_RULES.md",
    "AGENT_SKILLS_INSTALL.md",
  ],
  cursor: [".cursor/rules/agent-memory.mdc"],
  copilot: [".github/copilot-instructions.md"],
  claude: [".claude/commands/setup-agenture.md", "CLAUDE.md"],
};

const OPTIONS: {
  id: OptionId;
  label: string;
  description: string;
  files: string;
}[] = [
  {
    id: "cursor",
    label: "Cursor",
    description: "Cursor rules with agent memory integration",
    files: ".cursor/rules/agent-memory.mdc",
  },
  {
    id: "copilot",
    label: "GitHub Copilot",
    description: "Copilot instructions referencing memory files",
    files: ".github/copilot-instructions.md",
  },
  {
    id: "claude",
    label: "Claude Code",
    description: "CLAUDE.md and /setup-agenture slash command",
    files: ".claude/commands/setup-agenture.md, CLAUDE.md",
  },
];

interface AiTool {
  id: string;
  label: string;
  command: string;
  args: string[];
  detected: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SetupAgentureDialog({ open, onOpenChange }: Props) {
  const { repoPath, addTerminalSession, setCurrentView, setScanResult } =
    useAppStore();

  const [selected, setSelected] = useState<Set<OptionId>>(
    new Set(["cursor", "copilot", "claude"]),
  );
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [claudeTool, setClaudeTool] = useState<AiTool | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelected(new Set(["cursor", "copilot", "claude"]));
      setOutput(null);
      setError(null);
      setDone(false);
      setCopiedPrompt(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    invoke<AiTool[]>("detect_ai_tools")
      .then((tools) => {
        const claude = tools.find((t) => t.id === "claude" && t.detected);
        setClaudeTool(claude ?? null);
      })
      .catch(() => {});
  }, [open]);

  function toggleOption(id: OptionId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function pruneUnselected() {
    if (!repoPath) return;
    const unselected = OPTIONS.map((o) => o.id).filter(
      (id) => !selected.has(id),
    );
    for (const id of unselected) {
      for (const rel of CATEGORY_FILES[id]) {
        try {
          await invoke("delete_file", {
            filePath: `${repoPath}/${rel}`,
            repoPath,
          });
        } catch {
          // file didn't exist or wasn't created — ignore
        }
      }
    }
  }

  async function handleInstall() {
    if (!repoPath || selected.size === 0) return;
    setRunning(true);
    setError(null);
    setOutput(null);
    try {
      const result = await invoke<CommandOutput>("run_cli_command", {
        command: "npx",
        args: ["agenture-cli", "init"],
        cwd: repoPath,
      });
      const clean = (result.stdout || result.stderr).replace(
        /\x1b\[[0-9;]*m/g,
        "",
      );
      setOutput(clean);
      if (result.exit_code === 0) {
        await pruneUnselected();
        setDone(true);
        const scan = await invoke<RepoScanResult>("scan_repository", {
          repoPath,
        });
        setScanResult(scan);
      } else {
        setError(`Command exited with code ${result.exit_code}`);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  function openInClaude() {
    if (!claudeTool) return;
    onOpenChange(false);
    addTerminalSession(
      {
        id: claudeTool.id,
        label: claudeTool.label,
        command: claudeTool.command,
        args: claudeTool.args,
      },
      null,
      "/setup-agenture\r",
    );
    setCurrentView("terminal");
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(SETUP_PROMPT);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
      showToast({
        title: "Copied!",
        description: "Prompt copied to clipboard",
      });
    } catch {
      showToast({
        title: "Copy failed",
        description: "Could not access clipboard",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            Setup Agenture
          </DialogTitle>
          <DialogDescription>
            Initialize this repository with agent memory, rules, and tool
            configuration files.
          </DialogDescription>
        </DialogHeader>

        {!done ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                What to install
              </p>
              <div className="space-y-1.5">
                {/* Default — always included */}
                <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5 pointer-events-none">
                  <Checkbox
                    id="opt-agents"
                    checked
                    disabled
                    className="mt-0.5 shrink-0 opacity-50"
                  />
                  <Label
                    htmlFor="opt-agents"
                    className="min-w-0 flex-1 flex-col items-start gap-0.5 cursor-default"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-medium leading-none">
                      .agents
                      <span className="rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-primary/10 text-primary leading-none">
                        Default
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground leading-snug">
                      Agent memory, rules, and skills manifest — included in every setup
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground/60">
                      .agents/, AGENTS.md, AGENT_MEMORY_RULES.md, AGENT_SKILLS_INSTALL.md
                    </span>
                  </Label>
                </div>

                {/* Provider-specific extras */}
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60 pt-1 px-0.5">
                  Provider-specific extras
                </p>
                {OPTIONS.map((opt) => {
                  const isChecked = selected.has(opt.id);
                  return (
                    <div
                      key={opt.id}
                      className={cn(
                        "flex items-start gap-3 rounded-md border px-3 py-2.5 transition-colors",
                        isChecked
                          ? "border-border bg-muted/30"
                          : "border-border/50 opacity-50",
                      )}
                    >
                      <Checkbox
                        id={`opt-${opt.id}`}
                        checked={isChecked}
                        disabled={running}
                        onCheckedChange={() => toggleOption(opt.id)}
                        className="mt-0.5 shrink-0"
                      />
                      <Label
                        htmlFor={`opt-${opt.id}`}
                        className={cn(
                          "min-w-0 flex-1 flex-col items-start gap-0.5",
                          !running && "cursor-pointer",
                        )}
                      >
                        <span className="text-xs font-medium leading-none">
                          {opt.label}
                        </span>
                        <span className="text-xs text-muted-foreground leading-snug">
                          {opt.description}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground/60">
                          {opt.files}
                        </span>
                      </Label>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Existing files are preserved.
              </p>
            </div>

            {output && (
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted p-3 text-xs text-muted-foreground">
                {output}
              </pre>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={running}
              >
                Cancel
              </Button>
              <Button onClick={handleInstall} disabled={running || !repoPath}>
                {running ? (
                  <>
                    <LoadingSpinner size="sm" />
                    Installing…
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    Install
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-md border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900 dark:bg-green-950/30">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-500">
                <Check className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium">Setup complete</p>
                <p className="text-xs text-muted-foreground">
                  Agent context files have been installed.
                </p>
              </div>
            </div>

            {output && (
              <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted p-3 text-xs text-muted-foreground">
                {output}
              </pre>
            )}

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Next step
              </p>

              {claudeTool && selected.has("claude") ? (
                <div className="space-y-2.5 rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    Claude Code was detected. Run{" "}
                    <code className="font-mono text-foreground">
                      /setup-agenture
                    </code>{" "}
                    to install the skills defined in{" "}
                    <code className="font-mono">AGENT_SKILLS_INSTALL.md</code>.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={openInClaude}>
                      <TerminalSquare className="h-3.5 w-3.5" />
                      Open in Claude Code
                    </Button>
                    <Button size="sm" variant="outline" onClick={copyPrompt}>
                      {copiedPrompt ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copiedPrompt ? "Copied!" : "Copy prompt"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    Paste this prompt into your AI assistant to complete skills
                    installation from{" "}
                    <code className="font-mono">AGENT_SKILLS_INSTALL.md</code>.
                  </p>
                  <Button size="sm" variant="outline" onClick={copyPrompt}>
                    {copiedPrompt ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copiedPrompt ? "Copied!" : "Copy setup prompt"}
                  </Button>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
