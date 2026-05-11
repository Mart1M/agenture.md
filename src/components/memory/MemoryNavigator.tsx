import { invoke } from "@tauri-apps/api/core";
import { DatabaseZap, FileText } from "lucide-react";
import { useAppStore } from "@/store";
import { cn } from "@/lib/utils";
import type { MemoryFile } from "@/types";

export function MemoryNavigator() {
  const {
    scanResult,
    repoPath,
    viewerFile,
    setViewerFile,
    setFileContent,
    setIsLoadingFile,
    setCurrentView,
    selectItem,
    sidebarTab,
    selectedMemoryFolder,
  } = useAppStore();

  if (sidebarTab !== "memory" || !selectedMemoryFolder) return null;

  const memory = scanResult?.memory ?? null;
  const folder =
    memory?.folders.find((f) => f.name === selectedMemoryFolder) ?? null;

  async function openFile(file: MemoryFile) {
    setCurrentView("explorer");
    selectItem(null);
    setViewerFile({
      name: file.raw_name,
      path: file.path,
      relative_path: file.relative_path,
    });
    setIsLoadingFile(true);
    try {
      const content = await invoke<string>("read_file", {
        filePath: file.path,
        repoPath,
      });
      setFileContent(content);
    } catch (e) {
      console.error("Failed to read memory file:", e);
    } finally {
      setIsLoadingFile(false);
    }
  }

  return (
    <aside className="w-56 shrink-0 flex flex-col overflow-hidden border-r bg-background">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <DatabaseZap className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground capitalize">
          {selectedMemoryFolder}
        </p>
      </div>

      {!folder || folder.files.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground italic">
          No files in this folder.
        </p>
      ) : (
        <div className="flex-1 overflow-y-auto py-1 px-1 space-y-0.5">
          {folder.files.map((file) => (
            <button
              key={file.path}
              type="button"
              onClick={() => void openFile(file)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md p-2 text-left text-xs transition-colors",
                viewerFile?.path === file.path
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <FileText className="h-3 w-3 shrink-0 opacity-60" />
              <span className="min-w-0 flex-1 truncate">{file.raw_name}</span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
