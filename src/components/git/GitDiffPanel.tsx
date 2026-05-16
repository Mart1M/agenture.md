import { useCallback, useEffect, useState } from "react";
import { FileDiff, X } from "lucide-react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { GitDiffViewer } from "@/components/git/GitDiffViewer";
import { fetchFileDiff } from "@/lib/git-panel";
import { showToast } from "@/components/common/Toaster";

export function GitDiffPanel() {
  const {
    repoPath,
    gitPanelOpen,
    gitDiffPath,
    gitDiffDisplayPath,
    gitDiffStaged,
    clearGitDiff,
  } = useAppStore();

  const [diff, setDiff] = useState("");
  const [isEmpty, setIsEmpty] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadDiff = useCallback(async () => {
    if (!repoPath || !gitDiffPath) return;
    setLoading(true);
    try {
      const result = await fetchFileDiff(repoPath, gitDiffPath, gitDiffStaged);
      setDiff(result.diff);
      setIsEmpty(result.isEmpty);
    } catch (e) {
      setDiff("");
      setIsEmpty(true);
      showToast({ title: "Could not load diff", description: String(e) });
    } finally {
      setLoading(false);
    }
  }, [repoPath, gitDiffPath, gitDiffStaged]);

  useEffect(() => {
    if (!gitDiffPath) {
      setDiff("");
      setIsEmpty(true);
      return;
    }
    void loadDiff();
  }, [gitDiffPath, gitDiffStaged, loadDiff]);

  if (!gitPanelOpen || !repoPath || !gitDiffPath) return null;

  const label = gitDiffDisplayPath ?? gitDiffPath;

  return (
    <aside className="flex w-[min(28rem,42vw)] shrink-0 flex-col overflow-hidden border-l bg-muted/15">
      <div className="flex items-center gap-2 border-b px-3 py-3">
        <FileDiff className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span
          className="min-w-0 flex-1 truncate text-sm font-medium"
          title={label}
        >
          {label}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Close preview"
          onClick={clearGitDiff}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <LoadingSpinner size="sm" />
          </div>
        ) : (
          <GitDiffViewer diff={diff} path={gitDiffPath} isEmpty={isEmpty} />
        )}
      </div>
    </aside>
  );
}
