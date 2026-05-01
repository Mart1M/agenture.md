import { invoke } from "@tauri-apps/api/core";
import {
  ChevronRight,
  Download,
  Package,
  Play,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { PackageWorkspace, PackageWorkspaceList } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";

function formatPackageLabel(ws: PackageWorkspace): string {
  if (ws.package_name) return ws.package_name;
  const dir = ws.relative_path.replace(/\/?package\.json$/, "") || "(root)";
  const parts = dir.split("/");
  return parts[parts.length - 1] || ws.relative_path;
}

/** Folder path under the repo (relative). Null when package.json is at repo root — no need to show "." */
function packagePathHint(ws: PackageWorkspace): string | null {
  const path = ws.relative_path.replace(/\/?package\.json$/, "").trim();
  return path === "" ? null : path;
}

export function TerminalPackageScriptsAside({
  repoPath,
}: {
  repoPath: string | null;
}) {
  const addTerminalSession = useAppStore((s) => s.addTerminalSession);
  const [workspaces, setWorkspaces] = useState<PackageWorkspace[]>([]);
  const [repoHasNodeModules, setRepoHasNodeModules] = useState(false);
  const [npmClient, setNpmClient] = useState<string>("npm");
  const [loading, setLoading] = useState(false);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!repoPath) {
      setWorkspaces([]);
      setRepoHasNodeModules(false);
      setNpmClient("npm");
      return;
    }
    setLoading(true);
    try {
      const [listing, client] = await Promise.all([
        invoke<PackageWorkspaceList>("list_package_workspaces", { repoPath }),
        invoke<string>("detect_npm_client", { repoPath }),
      ]);
      setWorkspaces(listing.workspaces);
      setRepoHasNodeModules(listing.repo_has_node_modules);
      setNpmClient(client);
      setOpenMap(
        Object.fromEntries(
          listing.workspaces.map((w, i) => [w.relative_path, i < 2]),
        ),
      );
    } catch {
      setWorkspaces([]);
      setRepoHasNodeModules(false);
      setNpmClient("npm");
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    void load();
  }, [load]);

  function runScript(ws: PackageWorkspace, scriptName: string) {
    const label = `${formatPackageLabel(ws)}: ${scriptName}`;
    addTerminalSession(
      {
        id: `pkg-script-${ws.relative_path}-${scriptName}`,
        label,
        command: npmClient,
        args: ["run", scriptName],
      },
      ws.directory,
    );
  }

  /** Install dependencies at repository root (`npm_client install`). */
  function runRepoInstallDeps() {
    if (!repoPath) return;
    addTerminalSession(
      {
        id: "repo-install-deps",
        label: `${npmClient} install`,
        command: npmClient,
        args: ["install"],
      },
      repoPath,
    );
  }

  /** Install dependencies in a specific workspace folder. */
  function runWorkspaceInstallDeps(ws: PackageWorkspace) {
    const pkgLabel = formatPackageLabel(ws);
    addTerminalSession(
      {
        id: `pkg-install-${ws.relative_path}`,
        label: `${pkgLabel}: install`,
        command: npmClient,
        args: ["install"],
      },
      ws.directory,
    );
  }

  async function openBlankShellSession() {
    if (!repoPath) return;
    try {
      const shellPath = await invoke<string>("default_interactive_shell");
      const baseName =
        shellPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() ??
        "Shell";
      addTerminalSession(
        {
          id: "shell",
          label: baseName,
          command: shellPath,
          args: [],
        },
        repoPath,
      );
    } catch (e) {
      console.error("default_interactive_shell failed:", e);
    }
  }

  if (!repoPath) {
    return (
      <div className="flex flex-col h-full w-72 shrink-0 bg-muted/10">
        <div className="px-3 py-2 border-b shrink-0 flex items-center gap-2">
          <Package className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold tracking-tight">Packages</span>
        </div>
        <div className="flex-1 flex items-center justify-center px-4 text-xs text-muted-foreground text-center">
          Open a repository to browse package scripts
        </div>
      </div>
    );
  }

  const scriptEntries = (ws: PackageWorkspace) =>
    Object.entries(ws.scripts).sort(([a], [b]) => a.localeCompare(b));

  const isMonorepo = workspaces.length > 1;

  return (
    <div className="flex flex-col h-full w-72 shrink-0 bg-muted/10 overflow-hidden">
      <div className="px-3 py-2 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-semibold tracking-tight">Packages</span>
          <span
            className="text-[10px] text-muted-foreground font-mono ml-auto truncate max-w-20"
            title={npmClient}
          >
            {npmClient}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => void load()}
            disabled={loading}
            title="Refresh package.json list"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", loading && "animate-spin")}
            />
          </Button>
        </div>
        {!repoHasNodeModules ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 h-8 w-full justify-center gap-2 text-xs font-normal"
            onClick={(e) => {
              e.stopPropagation();
              runRepoInstallDeps();
            }}
            title={`${npmClient} install (repository root)`}
          >
            <Download className="h-3.5 w-3.5 shrink-0 opacity-80" />
            <span>Install dependencies</span>
          </Button>
        ) : null}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 pb-4">
          {loading && workspaces.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1 py-6 text-center">
              Scanning workspace…
            </p>
          ) : workspaces.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1 py-6 text-center">
              No package.json found (ignored: node_modules, .git, dist, …)
            </p>
          ) : (
            workspaces.map((ws) => {
              const scripts = scriptEntries(ws);
              const expanded = openMap[ws.relative_path] ?? false;
              const pathHint = packagePathHint(ws);
              return (
                <Collapsible
                  key={ws.relative_path}
                  open={expanded}
                  onOpenChange={(open: boolean) =>
                    setOpenMap((prev) => ({
                      ...prev,
                      [ws.relative_path]: open,
                    }))
                  }
                  className="mb-1"
                >
                  <CollapsibleTrigger className="flex items-center gap-1 w-full px-2 py-1.5 rounded-md text-xs font-medium text-left hover:bg-accent/60 transition-colors cursor-pointer">
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-transform duration-150 text-muted-foreground",
                        expanded && "rotate-90",
                      )}
                    />
                    <span className="truncate font-medium">
                      {formatPackageLabel(ws)}
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                      {scripts.length}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="pl-1 pr-1 pb-1 space-y-0.5 border-l border-border/60 ml-3.5 my-1">
                      {pathHint !== null ? (
                        <div
                          className="text-[10px] text-muted-foreground font-mono truncate mb-1.5 px-2"
                          title={pathHint}
                        >
                          {pathHint}
                        </div>
                      ) : null}
                      {isMonorepo && !ws.has_node_modules ? (
                        <div className="flex items-center gap-1 px-2 mb-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            title={`${npmClient} install in this folder`}
                            onClick={(e) => {
                              e.stopPropagation();
                              runWorkspaceInstallDeps(ws);
                            }}
                          >
                            <Download className="h-2.5 w-2.5 mr-1.5 shrink-0 opacity-60" />
                            <span className="truncate">
                              Install dependencies
                            </span>
                          </Button>
                        </div>
                      ) : null}
                      {scripts.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground px-2 py-1">
                          No scripts field
                        </p>
                      ) : (
                        scripts.map(([name]) => (
                          <div
                            key={`${ws.relative_path}-${name}`}
                            className="flex items-center gap-1"
                          >
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 flex-1 min-w-0 justify-start px-2 text-[11px] font-mono"
                              title={`${npmClient} run ${name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                runScript(ws, name);
                              }}
                            >
                              <Play className="h-2.5 w-2.5 mr-1.5 shrink-0 opacity-60" />
                              <span className="truncate">{name}</span>
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })
          )}
        </div>
      </ScrollArea>
      <div className="px-3 py-2 border-t shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-center gap-2"
          onClick={() => void openBlankShellSession()}
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New terminal session</span>
        </Button>
      </div>
    </div>
  );
}
