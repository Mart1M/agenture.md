import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { FolderOpen, GitBranch, Wand2 } from "lucide-react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { SetupAgentureDialog } from "@/components/setup/SetupAgentureDialog";
import type { RepoScanResult } from "@/types";

interface GitGraphRef {
  tip: string;
  name: string;
  fullName: string;
}

interface GitGraphSnapshot {
  refs: GitGraphRef[];
  headId: string | null;
}

export function TopBar() {
  const { repoPath, scanResult, setRepoPath, setScanResult, setIsScanning } =
    useAppStore();
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [isSetupOpen, setIsSetupOpen] = useState(false);

  async function openRepo() {
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return;
    setIsScanning(true);
    try {
      const result = await invoke<RepoScanResult>("scan_repository", {
        repoPath: selected,
      });
      setRepoPath(selected);
      setScanResult(result);
    } catch (e) {
      console.error("Scan failed:", e);
    } finally {
      setIsScanning(false);
    }
  }

  const repoName = repoPath?.split("/").pop() ?? null;
  const total =
    (scanResult?.agents.length ?? 0) + (scanResult?.skills.length ?? 0);

  useEffect(() => {
    let cancelled = false;
    if (!repoPath) {
      setCurrentBranch(null);
      return;
    }

    invoke<GitGraphSnapshot>("git_graph_snapshot", { repoPath })
      .then((snapshot) => {
        if (cancelled) return;
        const localHead = snapshot.refs.find(
          (ref) =>
            ref.tip === snapshot.headId &&
            ref.fullName.startsWith("refs/heads/"),
        );
        setCurrentBranch(localHead?.name ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentBranch(null);
      });

    return () => {
      cancelled = true;
    };
  }, [repoPath]);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      {repoPath && <SidebarTrigger className="-ml-1" />}
      {repoPath && <div className="mr-2 h-4 w-px bg-border" />}
      <div className="flex flex-1 items-center gap-2">
        <span className="text-sm font-semibold">Agenture</span>
        {repoName && (
          <>
            <span className="text-muted-foreground text-sm">/</span>
            <span className="text-sm text-muted-foreground">{repoName}</span>
            {currentBranch && (
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <GitBranch className="h-3.5 w-3.5" />
                {currentBranch}
              </span>
            )}
            {total > 0 && (
              <Badge variant="secondary" className="text-xs">
                {total} file{total !== 1 ? "s" : ""}
              </Badge>
            )}
          </>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsSetupOpen(true)}
        disabled={!repoPath}
        title="Initialize repository with agent memory, rules, and tool config"
      >
        <Wand2 className="mr-2 h-4 w-4" />
        Setup Agenture
      </Button>
      <Button variant="outline" size="sm" onClick={openRepo}>
        <FolderOpen className="mr-2 h-4 w-4" />
        Open Repository
      </Button>
      <SetupAgentureDialog open={isSetupOpen} onOpenChange={setIsSetupOpen} />
    </header>
  );
}
