import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { Wrench } from "lucide-react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import type { CommandOutput, RepoScanResult } from "@/types";

export function SetupCTA() {
  const { repoPath, setScanResult } = useAppStore();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);

  async function runInit() {
    if (!repoPath) return;
    setRunning(true);
    setError(null);
    setOutput(null);
    try {
      const result = await invoke<CommandOutput>("run_cli_command", {
        command: "npx",
        args: ["agenture-cli", "init"],
        cwd: repoPath,
      });
      setOutput(result.stdout || result.stderr);
      if (result.exit_code === 0) {
        const scan = await invoke<RepoScanResult>("scan_repository", { repoPath });
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

  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <Wrench className="h-12 w-12 text-muted-foreground/30 mb-4" />
      <h2 className="text-lg font-semibold mb-2">No Agent Context Found</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-md">
        This repository doesn't have any agent configuration yet. Initialize it with the Agenture
        CLI to get started.
      </p>
      <Button onClick={runInit} disabled={running}>
        {running ? (
          <span className="flex items-center gap-2">
            <LoadingSpinner size="sm" /> Initializing…
          </span>
        ) : (
          <>
            <Wrench className="mr-2 h-4 w-4" /> Initialize Agent Context
          </>
        )}
      </Button>
      {output && (
        <pre className="mt-4 text-xs text-muted-foreground bg-muted border border-border rounded-md p-3 max-w-lg max-h-40 overflow-auto text-left w-full">
          {output}
        </pre>
      )}
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </div>
  );
}
