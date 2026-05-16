import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  GitBranch,
  PanelRightClose,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Upload,
} from "lucide-react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GitBranchCombobox } from "@/components/git/GitBranchCombobox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { showToast } from "@/components/common/Toaster";
import {
  checkoutBranch,
  commitChanges,
  fetchWorkingTree,
  formatBranchLabel,
  generateCommitMessage,
  githubCompareUrl,
  githubRepoUrl,
  pullChanges,
  pushChanges,
  restorePaths,
  stagePaths,
  statusBadgeClass,
} from "@/lib/git-panel";
import type { GitChangedFile, GitPanelTab, GitWorkingTree } from "@/types/git";
import { cn } from "@/lib/utils";

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    md: "MD",
    json: "{}",
    ts: "TS",
    tsx: "TX",
    js: "JS",
    jsx: "JX",
    rs: "RS",
    css: "CSS",
    vue: "VU",
    yaml: "YM",
    yml: "YM",
  };
  return map[ext] ?? "··";
}

export function GitSidePanel() {
  const {
    repoPath,
    gitPanelOpen,
    setGitPanelOpen,
    gitPanelTab,
    setGitPanelTab,
    gitDiffPath,
    setGitDiffSelection,
    clearGitDiff,
    rescan,
  } = useAppStore();

  const [tree, setTree] = useState<GitWorkingTree | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [commitMessage, setCommitMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWorkingTree(repoPath);
      setTree(data);
      if (!data.isRepo) {
        setSelectedPaths(new Set());
        clearGitDiff();
        return;
      }
      setSelectedPaths((prev) => {
        const valid = new Set(data.files.map((f) => f.path));
        const next = new Set<string>();
        for (const p of prev) {
          if (valid.has(p)) next.add(p);
        }
        if (next.size === 0 && data.files.length > 0) {
          return new Set(data.files.map((f) => f.path));
        }
        return next.size > 0 ? next : new Set(data.files.map((f) => f.path));
      });
      const { gitDiffPath: currentDiff } = useAppStore.getState();
      if (currentDiff && !data.files.some((f) => f.path === currentDiff)) {
        clearGitDiff();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [repoPath, clearGitDiff]);

  useEffect(() => {
    if (!gitPanelOpen || !repoPath) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(id);
  }, [gitPanelOpen, repoPath, refresh]);

  const files = tree?.files ?? [];
  const selectedFiles = useMemo(
    () => files.filter((f) => selectedPaths.has(f.path)),
    [files, selectedPaths],
  );

  function selectFileForDiff(file: GitChangedFile) {
    const staged = file.staged && !file.unstaged;
    if (gitDiffPath === file.path) {
      clearGitDiff();
      return;
    }
    setGitDiffSelection(file.path, file.displayPath, staged);
  }

  function togglePath(path: string, checked: boolean) {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (checked) next.add(path);
      else next.delete(path);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelectedPaths(checked ? new Set(files.map((f) => f.path)) : new Set());
  }

  async function runAction(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
      await refresh();
      void rescan({ silent: true });
    } catch (e) {
      showToast({ title: label, description: String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function handleRevertAll() {
    if (!repoPath || files.length === 0) return;
    await runAction("Revert all", () => restorePaths(repoPath, files.map((f) => f.path)));
  }

  async function handleCommit(syncAfter: boolean) {
    if (!repoPath) return;
    const msg = commitMessage.trim();
    if (!msg) {
      showToast({ title: "Add a message", description: "Describe what you changed." });
      return;
    }
    await runAction(syncAfter ? "Commit & sync" : "Commit", async () => {
      if (selectedFiles.length > 0) {
        await stagePaths(
          repoPath,
          selectedFiles.map((f) => f.path),
          true,
        );
      }
      await commitChanges(repoPath, msg);
      setCommitMessage("");
      if (syncAfter) {
        if (tree?.behind && tree.behind > 0) {
          await pullChanges(repoPath);
        }
        await pushChanges(repoPath);
      }
    });
  }

  async function handleSync() {
    if (!repoPath) return;
    await runAction("Sync", async () => {
      if (tree?.behind && tree.behind > 0) {
        await pullChanges(repoPath);
      }
      if (tree?.ahead && tree.ahead > 0) {
        await pushChanges(repoPath);
      }
    });
  }

  async function handlePull() {
    if (!repoPath) return;
    await runAction("Get updates", () => pullChanges(repoPath));
  }

  async function handleBranchChange(branch: string) {
    if (!repoPath) return;
    await runAction("Switch branch", () => checkoutBranch(repoPath, branch));
  }

  const compareUrl = githubCompareUrl(tree?.remoteUrl ?? null, tree?.branch ?? null);
  const repoUrl = githubRepoUrl(tree?.remoteUrl ?? null);

  if (!gitPanelOpen || !repoPath) return null;

  return (
    <aside className="flex w-[min(22rem,38vw)] shrink-0 flex-col overflow-hidden border-l bg-sidebar/40">
      {/* Header */}
      <div className="flex min-w-0 items-center gap-2 border-b px-3 py-2.5">
        <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
        {tree?.isRepo ? (
          <GitBranchCombobox
            repoPath={repoPath}
            currentBranch={tree.branch}
            localBranches={tree.localBranches}
            remoteBranches={tree.remoteBranches}
            disabled={busy !== null}
            onBranchChange={handleBranchChange}
            onCreated={() => void refresh()}
          />
        ) : (
          <span
            className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground"
            title={tree?.branch ?? undefined}
          >
            {tree?.isRepo
              ? tree.branch
                ? formatBranchLabel(tree.branch)
                : "No branch"
              : "Not a Git repo"}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          title="Refresh"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Hide panel"
          onClick={() => setGitPanelOpen(false)}
        >
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </div>

      {!tree?.isRepo ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-muted-foreground">
            This folder is not tracked with Git yet. Run{" "}
            <code className="rounded bg-muted px-1 font-mono text-xs">git init</code>{" "}
            in the project folder to start saving versions.
          </p>
        </div>
      ) : (
        <>
          <Tabs
            value={gitPanelTab}
            onValueChange={(v) => setGitPanelTab(v as GitPanelTab)}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <TabsList variant="default" className="h-8 flex-1">
                <TabsTrigger value="commit" className="flex-1 text-xs">
                  Changes
                </TabsTrigger>
                <TabsTrigger value="update" className="flex-1 text-xs">
                  Sync
                </TabsTrigger>
                <TabsTrigger value="pr" className="flex-1 text-xs">
                  Share
                </TabsTrigger>
              </TabsList>
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 gap-1 px-2 text-xs"
                disabled={busy !== null || (!tree.ahead && !tree.behind)}
                onClick={() => void handleSync()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Sync
                {tree.ahead > 0 && (
                  <span className="inline-flex items-center text-primary">
                    <ArrowUp className="h-3 w-3" />
                    {tree.ahead}
                  </span>
                )}
                {tree.behind > 0 && (
                  <span className="inline-flex items-center text-amber-600">
                    <ArrowDown className="h-3 w-3" />
                    {tree.behind}
                  </span>
                )}
              </Button>
            </div>

            <TabsContent value="commit" className="mt-0 flex min-h-0 flex-1 flex-col">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                  <Checkbox
                    checked={files.length > 0 && selectedPaths.size === files.length}
                    onCheckedChange={(c) => toggleAll(Boolean(c))}
                  />
                  Changes
                  <span className="font-normal text-muted-foreground">
                    {selectedPaths.size}/{files.length}
                  </span>
                </label>
                {files.length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-destructive hover:underline"
                    onClick={() => void handleRevertAll()}
                    disabled={busy !== null}
                  >
                    Undo all
                  </button>
                )}
              </div>

              <ScrollArea className="min-h-0 flex-1 border-b">
                {files.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No changes — you&apos;re all caught up.
                  </p>
                ) : (
                  <ul className="py-1">
                    {files.map((file) => (
                      <li key={file.path}>
                        <div
                          className={cn(
                            "flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-muted/60",
                            gitDiffPath === file.path && "bg-muted",
                          )}
                        >
                          <Checkbox
                            checked={selectedPaths.has(file.path)}
                            onCheckedChange={(c) => togglePath(file.path, Boolean(c))}
                          />
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-1.5"
                            onClick={() => selectFileForDiff(file)}
                          >
                            <span
                              className={cn(
                                "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold",
                                statusBadgeClass(file.statusCode),
                              )}
                            >
                              {file.statusCode}
                            </span>
                            <span className="w-6 shrink-0 text-center text-[10px] text-muted-foreground">
                              {fileIcon(file.displayPath)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-xs">
                              {file.displayPath}
                            </span>
                            <span className="shrink-0 text-[10px] tabular-nums">
                              <span className="text-emerald-600">+{file.additions}</span>
                              {" / "}
                              <span className="text-red-600">-{file.deletions}</span>
                            </span>
                          </button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-7 w-7 shrink-0"
                            title={`Undo changes to ${file.displayPath}`}
                            onClick={() =>
                              void runAction("Revert", () =>
                                restorePaths(repoPath, [file.path]),
                              )
                            }
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>


              <div className="shrink-0 space-y-2 border-t bg-background p-3">

                <Textarea
                  placeholder="Describe your changes…"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  className="min-h-[72px] resize-none text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={busy !== null || selectedFiles.length === 0}
                    onClick={() => {
                      setCommitMessage(generateCommitMessage(selectedFiles));
                    }}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Suggest
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void handleCommit(false)}
                  >
                    Save locally
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1"
                    disabled={busy !== null}
                    onClick={() => void handleCommit(true)}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Save &amp; sync
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="update" className="mt-0 flex-1 px-4 py-6">
              <div className="space-y-4 text-sm">
                <p className="text-muted-foreground">
                  Keep your copy in sync with teammates on the remote server.
                </p>
                {tree.behind > 0 && (
                  <div className="rounded-lg border bg-amber-500/5 p-3">
                    <p className="font-medium">
                      {tree.behind} update{tree.behind !== 1 ? "s" : ""} available
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Someone else saved changes you don&apos;t have yet.
                    </p>
                    <Button
                      size="sm"
                      className="mt-3"
                      disabled={busy !== null}
                      onClick={() => void handlePull()}
                    >
                      <ArrowDown className="mr-1 h-4 w-4" />
                      Get updates
                    </Button>
                  </div>
                )}
                {tree.ahead > 0 && (
                  <div className="rounded-lg border bg-primary/5 p-3">
                    <p className="font-medium">
                      {tree.ahead} save{tree.ahead !== 1 ? "s" : ""} not shared yet
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Your changes are saved locally but not on the server.
                    </p>
                    <Button
                      size="sm"
                      className="mt-3"
                      disabled={busy !== null}
                      onClick={() =>
                        void runAction("Share", () => pushChanges(repoPath))
                      }
                    >
                      <ArrowUp className="mr-1 h-4 w-4" />
                      Share my saves
                    </Button>
                  </div>
                )}
                {tree.ahead === 0 && tree.behind === 0 && (
                  <p className="text-center text-muted-foreground">
                    You&apos;re in sync with the server.
                  </p>
                )}
                {!tree.hasUpstream && (
                  <p className="text-xs text-muted-foreground">
                    No remote branch linked yet. Use Save &amp; sync after your first
                    push from the terminal, or ask a teammate for the repository URL.
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="pr" className="mt-0 flex-1 px-4 py-6">
              <div className="space-y-4 text-sm">
                <p className="text-muted-foreground">
                  Open a review page on GitHub to propose your changes to the team.
                </p>
                {compareUrl ? (
                  <Button
                    className="w-full"
                    onClick={() => void openUrl(compareUrl)}
                  >
                    Open review on GitHub
                    <ChevronDown className="ml-1 h-4 w-4 rotate-[-90deg]" />
                  </Button>
                ) : repoUrl ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => void openUrl(repoUrl)}
                  >
                    Open repository
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Connect a GitHub remote to enable one-click reviews.
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {error && (
            <p className="border-t px-3 py-2 text-xs text-destructive">{error}</p>
          )}
        </>
      )}
    </aside>
  );
}

