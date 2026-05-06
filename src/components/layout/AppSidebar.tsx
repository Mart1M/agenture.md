import {
  Bot,
  Brain,
  FolderOpen,
  TerminalSquare,
  Plug,
  ScrollText,
  Palette,
  FilePlus2,
  Plus,
  Sun,
  Moon,
  Pencil,
  Trash2,
  MousePointer2,
  Wind,
  GitGraph,
  Search,
  FileText,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAppStore } from "@/store";
import { formatName } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { showToast } from "@/components/common/Toaster";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import type {
  FileItem,
  FileSearchHit,
  RepoScanResult,
  SkillFolder,
  ViewerFile,
} from "@/types";
import appIconUrl from "../../../resources/icon.svg?url";
import { toggleAppTheme } from "@/lib/theme";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

const PINNED_AGENT_ORDER = ["CLAUDE", "AGENTS", "DESIGN"] as const;

function normPath(p: string) {
  return p.replace(/\\/g, "/");
}

function hitBelongsToSkill(
  readmeRelative: string,
  hitRelativePath: string,
): boolean {
  const hr = normPath(hitRelativePath);
  const rd = normPath(readmeRelative);
  if (hr === rd) return true;
  const slash = rd.lastIndexOf("/");
  const dir = slash >= 0 ? rd.slice(0, slash) : "";
  if (!dir) return false;
  return hr === dir || hr.startsWith(`${dir}/`);
}

function walkSkillFolderPaths(folder: SkillFolder): string[] {
  const out: string[] = [];
  for (const sf of folder.files) out.push(sf.path);
  for (const sub of folder.folders) out.push(...walkSkillFolderPaths(sub));
  return out;
}

function collectSearchablePaths(result: RepoScanResult): string[] {
  const s = new Set<string>();
  for (const a of result.agents) s.add(a.path);
  for (const sk of result.skills) {
    s.add(sk.readme_path);
    for (const f of sk.root_files ?? []) s.add(f.path);
    for (const folder of sk.folders ?? []) {
      for (const p of walkSkillFolderPaths(folder)) s.add(p);
    }
  }
  return [...s];
}

function getAgentKey(rawName: string) {
  return rawName.replace(/\.md$/i, "").toUpperCase();
}

function getAgentIcon(rawName: string, relativePath?: string) {
  const key = getAgentKey(rawName);
  if (key === "CLAUDE") {
    return (
      <span
        className="h-3.5 w-3.5 shrink-0 bg-current"
        style={{
          WebkitMaskImage: "url(/tools/claude.svg)",
          maskImage: "url(/tools/claude.svg)",
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
        }}
      />
    );
  }
  if (key === "AGENTS") return <ScrollText className="h-3.5 w-3.5 shrink-0" />;
  if (key === "DESIGN") return <Palette className="h-3.5 w-3.5 shrink-0" />;
  if (rawName === ".cursorrules" || relativePath?.startsWith(".cursor/"))
    return <MousePointer2 className="h-3.5 w-3.5 shrink-0" />;
  if (rawName === ".windsurfrules")
    return <Wind className="h-3.5 w-3.5 shrink-0" />;
  if (
    rawName.toLowerCase().includes("copilot") ||
    relativePath?.includes("copilot")
  )
    return <GitGraph className="h-3.5 w-3.5 shrink-0" />;
  return <Bot className="h-3.5 w-3.5 shrink-0" />;
}

export function AppSidebar() {
  const {
    scanResult,
    repoPath,
    sidebarTab,
    setSidebarTab,
    selectedItem,
    currentView,
    setCurrentView,
    setIsTerminalDialogOpen,
    setTerminalDialogCallback,
    addTerminalSession,
    terminalSessions,
    selectItem,
    viewerFile,
    setViewerFile,
    setFileContent,
    setIsLoadingFile,
    setScanResult,
    rescan,
  } = useAppStore();
  const [isCreateAgentOpen, setIsCreateAgentOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [createAgentError, setCreateAgentError] = useState<string | null>(null);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [isCreateSkillOpen, setIsCreateSkillOpen] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillDescription, setNewSkillDescription] = useState("");
  const [createSkillError, setCreateSkillError] = useState<string | null>(null);
  const [isCreatingSkill, setIsCreatingSkill] = useState(false);

  // ── Rename dialog ───────────────────────────────────────────────────────────
  const [renamingItem, setRenamingItem] = useState<FileItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);

  function openRenameDialog(item: FileItem) {
    setRenamingItem(item);
    setRenameValue(item.raw_name);
    setRenameError(null);
  }

  async function commitRename() {
    if (!renamingItem || !repoPath) return;
    const newName = renameValue.trim();
    if (!newName || newName === renamingItem.raw_name) {
      setRenamingItem(null);
      return;
    }
    setIsRenaming(true);
    setRenameError(null);
    try {
      const newPath = await invoke<string>("rename_file", {
        oldPath: renamingItem.path,
        newName,
        repoPath,
      });
      // If the renamed file is currently open in the viewer, update it
      if (viewerFile?.path === renamingItem.path) {
        const newRelative = renamingItem.relative_path
          .split("/")
          .slice(0, -1)
          .concat(newName)
          .join("/");
        setViewerFile({
          name: newName,
          path: newPath,
          relative_path: newRelative,
        });
      }
      void rescan();
      setRenamingItem(null);
      showToast({ title: "File renamed", description: newName });
    } catch (e) {
      setRenameError(String(e));
    } finally {
      setIsRenaming(false);
    }
  }

  // ── Delete dialog ───────────────────────────────────────────────────────────
  const [deletingItem, setDeletingItem] = useState<FileItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function commitDelete() {
    if (!deletingItem || !repoPath) return;
    setIsDeleting(true);
    try {
      await invoke("delete_file", { filePath: deletingItem.path, repoPath });
      // If the deleted file is currently open in the viewer, clear it
      if (viewerFile?.path === deletingItem.path) {
        selectItem(null);
        setViewerFile(null);
      }
      void rescan();
      setDeletingItem(null);
      showToast({ title: "File deleted", description: deletingItem.raw_name });
    } catch (e) {
      showToast({ title: "Delete failed", description: String(e) });
    } finally {
      setIsDeleting(false);
    }
  }

  const [isDarkTheme, setIsDarkTheme] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  const cycleTheme = useCallback(() => {
    setIsDarkTheme(toggleAppTheme());
  }, []);

  async function loadFile(path: string, viewerFile: ViewerFile) {
    setViewerFile(viewerFile);
    setIsLoadingFile(true);
    try {
      const content = await invoke<string>("read_file", {
        filePath: path,
        repoPath,
      });
      setFileContent(content);
    } catch (e) {
      console.error("Failed to read file:", e);
    } finally {
      setIsLoadingFile(false);
    }
  }

  async function openItem(item: FileItem) {
    setCurrentView("explorer");
    selectItem(item);
    // For skills, load the readme; for agents, load the file
    const path = item.type === "skill" ? item.skill!.readme_path : item.path;
    await loadFile(path, {
      name: item.name,
      path,
      relative_path:
        item.type === "skill"
          ? item.skill!.readme_relative
          : item.relative_path,
    });
  }

  function switchTopView(
    view: "explorer" | "skills" | "terminal" | "mcp" | "git",
  ) {
    selectItem(null);
    setCurrentView(view);
  }

  async function handleCreateAgentFile() {
    if (!repoPath) return;
    const baseName = newAgentName.trim().replace(/\.md$/i, "");
    if (!baseName) {
      setCreateAgentError("Please enter a file name.");
      return;
    }

    const fileName = `${baseName}.md`;
    const filePath = `${repoPath}/${fileName}`;
    setIsCreatingAgent(true);
    setCreateAgentError(null);
    try {
      await invoke("write_file", {
        filePath,
        content: "",
        repoPath,
      });
      const result = await invoke<RepoScanResult>("scan_repository", {
        repoPath,
      });
      setScanResult(result);
      setIsCreateAgentOpen(false);
      setNewAgentName("");
    } catch (error) {
      setCreateAgentError(String(error));
    } finally {
      setIsCreatingAgent(false);
    }
  }

  async function handleCreateSkill() {
    if (!repoPath) return;
    if (!newSkillName.trim()) {
      setCreateSkillError("Name is required.");
      return;
    }
    if (!newSkillDescription.trim()) {
      setCreateSkillError("Description is required.");
      return;
    }

    setIsCreatingSkill(true);
    setCreateSkillError(null);
    try {
      const createdPath = await invoke<string>("create_skill_scaffold", {
        name: newSkillName,
        description: newSkillDescription,
        repoPath,
      });
      const result = await invoke<RepoScanResult>("scan_repository", {
        repoPath,
      });
      setScanResult(result);
      setIsCreateSkillOpen(false);
      setNewSkillName("");
      setNewSkillDescription("");
      showToast({
        title: "Skill created",
        description: createdPath.replace(`${repoPath}/`, ""),
      });
    } catch (error) {
      setCreateSkillError(String(error));
    } finally {
      setIsCreatingSkill(false);
    }
  }

  const agentItems: FileItem[] = (scanResult?.agents ?? []).map((a) => ({
    name: formatName(a.raw_name),
    raw_name: a.raw_name,
    path: a.path,
    relative_path: a.relative_path,
    type: "agent",
    size_bytes: a.size_bytes,
  }));
  const pinnedAgents: FileItem[] = PINNED_AGENT_ORDER.map((wantedKey) =>
    agentItems.find((item) => getAgentKey(item.raw_name) === wantedKey),
  ).filter((item): item is FileItem => Boolean(item));
  const regularAgents = agentItems.filter(
    (item) =>
      !PINNED_AGENT_ORDER.includes(
        getAgentKey(item.raw_name) as (typeof PINNED_AGENT_ORDER)[number],
      ),
  );

  const skillItems: FileItem[] = (scanResult?.skills ?? []).map((s) => ({
    name: formatName(s.raw_name),
    raw_name: s.raw_name,
    path: s.readme_path,
    relative_path: s.readme_relative,
    type: "skill",
    size_bytes: s.size_bytes,
    skill: s,
  }));

  const [searchOpen, setSearchOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const deferredQuery = useDeferredValue(paletteQuery.trim());
  const searchablePaths = useMemo(
    () => (scanResult ? collectSearchablePaths(scanResult) : []),
    [scanResult],
  );
  const [contentHits, setContentHits] = useState<FileSearchHit[]>([]);
  const [contentSearchLoading, setContentSearchLoading] = useState(false);

  const hitsByAgentPath = useMemo(() => {
    const next = new Set<string>();
    for (const h of contentHits) next.add(h.file_path);
    return next;
  }, [contentHits]);

  const visibleAgents = useMemo(() => {
    const raw = deferredQuery;
    if (!raw) return agentItems;
    const ql = raw.toLowerCase();
    const contentOk = raw.length >= 2;
    return agentItems.filter(
      (item) =>
        item.name.toLowerCase().includes(ql) ||
        item.raw_name.toLowerCase().includes(ql) ||
        normPath(item.relative_path).toLowerCase().includes(ql) ||
        (contentOk && hitsByAgentPath.has(item.path)),
    );
  }, [agentItems, deferredQuery, hitsByAgentPath]);

  const visibleSkills = useMemo(() => {
    const raw = deferredQuery;
    if (!raw) return skillItems;
    const ql = raw.toLowerCase();
    const contentOk = raw.length >= 2;
    return skillItems.filter(
      (item) =>
        item.name.toLowerCase().includes(ql) ||
        item.raw_name.toLowerCase().includes(ql) ||
        normPath(item.relative_path).toLowerCase().includes(ql) ||
        (contentOk &&
          !!item.skill &&
          contentHits.some((h) =>
            hitBelongsToSkill(item.skill!.readme_relative, h.relative_path),
          )),
    );
  }, [skillItems, deferredQuery, contentHits]);

  useEffect(() => {
    if (!searchOpen || !repoPath || !scanResult) {
      setContentHits([]);
      return;
    }
    const needle = deferredQuery;
    if (needle.length < 2) {
      setContentHits([]);
      setContentSearchLoading(false);
      return;
    }

    let cancelled = false;
    setContentSearchLoading(true);
    invoke<FileSearchHit[]>("search_files_content", {
      repoPath,
      filePaths: searchablePaths,
      query: needle,
      maxHits: 80,
    })
      .then((hits) => {
        if (!cancelled) setContentHits(hits);
      })
      .catch(() => {
        if (!cancelled) setContentHits([]);
      })
      .finally(() => {
        if (!cancelled) setContentSearchLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [searchOpen, repoPath, scanResult, deferredQuery, searchablePaths]);

  const isAppleOs =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);

  function openSearchHit(hit: FileSearchHit) {
    setSearchOpen(false);
    const agent = agentItems.find((i) => i.path === hit.file_path);
    if (agent) {
      setSidebarTab("agents");
      void openItem(agent);
      return;
    }
    const skillItem = skillItems.find(
      (si) =>
        si.skill &&
        hitBelongsToSkill(si.skill.readme_relative, hit.relative_path),
    );
    const nameSeg =
      hit.relative_path.split("/").pop() ?? skillItem?.name ?? "File";
    setCurrentView("explorer");
    if (skillItem) {
      setSidebarTab("skills");
      selectItem(skillItem);
    } else {
      selectItem(null);
      setSidebarTab("agents");
    }
    void loadFile(hit.file_path, {
      name: nameSeg,
      path: hit.file_path,
      relative_path: hit.relative_path,
    });
  }

  function selectFromPalette(item: FileItem) {
    setSearchOpen(false);
    setSidebarTab(item.type === "agent" ? "agents" : "skills");
    void openItem(item);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      const t = e.target;
      if (t instanceof HTMLElement) {
        if (t.isContentEditable) return;
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (t.closest(".cm-editor")) return;
      }
      e.preventDefault();
      setPaletteQuery("");
      setSearchOpen(true);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const paletteNoResults =
    !contentSearchLoading &&
    visibleAgents.length === 0 &&
    visibleSkills.length === 0 &&
    contentHits.length === 0;

  return (
    <Sidebar variant="floating" collapsible="offcanvas">
      {/* Top nav */}
      <SidebarHeader className="px-3 py-3">
        <div className="flex w-full min-w-0 items-center gap-2">
          <span
            className="block h-6 w-6 shrink-0 bg-sidebar-foreground"
            style={{
              WebkitMaskImage: `url("${appIconUrl}")`,
              maskImage: `url("${appIconUrl}")`,
              WebkitMaskSize: "contain",
              maskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
              maskPosition: "center",
            }}
            role="img"
            aria-label="Agenture"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="ml-auto shrink-0"
            onClick={cycleTheme}
            aria-label={
              isDarkTheme ? "Passer en thème clair" : "Passer en thème sombre"
            }
            title={
              isDarkTheme ? "Passer en thème clair" : "Passer en thème sombre"
            }
          >
            {isDarkTheme ? (
              <Sun className="size-4 shrink-0" />
            ) : (
              <Moon className="size-4 shrink-0" />
            )}
          </Button>
        </div>

        <button
          type="button"
          onClick={() => {
            setPaletteQuery("");
            setSearchOpen(true);
          }}
          disabled={!repoPath}
          title="Search agents & skills"
          aria-label="Search agents & skills"
          className={cn(
            "flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2.5 text-left text-xs text-muted-foreground transition-colors",
            "hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
            "disabled:pointer-events-none disabled:opacity-50",
            "outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
          )}
        >
          <Search className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-normal">
            Agents, skills & file content…
          </span>
          <KbdGroup className="pointer-events-none hidden shrink-0 gap-0.5 sm:flex">
            {isAppleOs ? (
              <Kbd className="h-5 min-w-5 justify-center px-1 text-[10px]">
                ⌘
              </Kbd>
            ) : (
              <Kbd className="h-5 px-1 text-[10px]">Ctrl</Kbd>
            )}
            <Kbd className="h-5 w-5 justify-center p-0 text-[10px]">K</Kbd>
          </KbdGroup>
        </button>

        <SidebarMenu className="gap-1">
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Search & install skills from skills.sh"
              isActive={currentView === "skills"}
              onClick={() => switchTopView("skills")}
              size="default"
              className="h-9"
            >
              <Brain />
              <span>Skills registry</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Open an AI coding assistant terminal"
              isActive={currentView === "terminal"}
              onClick={() => {
                selectItem(null);
                if (terminalSessions.length > 0) {
                  setCurrentView("terminal");
                  return;
                }
                setTerminalDialogCallback((tool) => {
                  addTerminalSession(tool);
                  setCurrentView("terminal");
                });
                setIsTerminalDialogOpen(true);
              }}
              size="default"
              className="h-9"
            >
              <TerminalSquare />
              <span>AI Terminal</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Visualize Git history (commits and branches)"
              isActive={currentView === "git"}
              onClick={() => switchTopView("git")}
              size="default"
              className="h-9"
            >
              <GitGraph />
              <span>Git graph</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Manage MCP servers for this project"
              isActive={currentView === "mcp"}
              onClick={() => switchTopView("mcp")}
              size="default"
              className="h-9"
            >
              <Plug />
              <span>MCP Servers</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {scanResult && (
        <>
          <SidebarSeparator className="w-full mx-auto" />
          <SidebarContent className="px-1">
            <SidebarGroup className="py-2">
              <SidebarGroupContent>
                <Tabs
                  value={sidebarTab}
                  onValueChange={(v) => setSidebarTab(v as "agents" | "skills")}
                >
                  <TabsList className="w-full h-8 mb-1">
                    <TabsTrigger
                      value="agents"
                      className="flex-1 text-xs gap-1"
                    >
                      <Bot className="h-3 w-3" />
                      Agents
                      {agentItems.length > 0 && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          {agentItems.length}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger
                      value="skills"
                      className="flex-1 text-xs gap-1"
                    >
                      <Brain className="h-2 w-2" />
                      Skills
                      {skillItems.length > 0 && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          {skillItems.length}
                        </span>
                      )}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="agents" className="mt-0">
                    <SidebarMenu className="gap-0.5">
                      {agentItems.length === 0 ? (
                        <p className="px-2 py-4 text-xs text-muted-foreground">
                          No agents found
                        </p>
                      ) : (
                        <>
                          {pinnedAgents.map((item) => (
                            <SidebarMenuItem key={item.path}>
                              <ContextMenu>
                                <ContextMenuTrigger className="w-full">
                                  <SidebarMenuButton
                                    isActive={selectedItem?.path === item.path}
                                    onClick={() => void openItem(item)}
                                    tooltip={item.name}
                                    className="h-8"
                                  >
                                    {getAgentIcon(
                                      item.raw_name,
                                      item.relative_path,
                                    )}
                                    <span className="truncate">
                                      {item.name}
                                    </span>
                                  </SidebarMenuButton>
                                </ContextMenuTrigger>
                                <ContextMenuContent>
                                  <ContextMenuItem
                                    onClick={() => openRenameDialog(item)}
                                  >
                                    <Pencil /> Rename
                                  </ContextMenuItem>
                                  <ContextMenuSeparator />
                                  <ContextMenuItem
                                    variant="destructive"
                                    onClick={() => setDeletingItem(item)}
                                  >
                                    <Trash2 /> Delete
                                  </ContextMenuItem>
                                </ContextMenuContent>
                              </ContextMenu>
                            </SidebarMenuItem>
                          ))}
                          {pinnedAgents.length > 0 &&
                            regularAgents.length > 0 && (
                              <SidebarSeparator className="my-1 w-full" />
                            )}
                          {regularAgents.map((item) => (
                            <SidebarMenuItem key={item.path}>
                              <ContextMenu>
                                <ContextMenuTrigger className="w-full">
                                  <SidebarMenuButton
                                    isActive={selectedItem?.path === item.path}
                                    onClick={() => void openItem(item)}
                                    tooltip={item.name}
                                    className="h-8"
                                  >
                                    <Bot className="h-3.5 w-3.5 shrink-0" />
                                    <span className="truncate">
                                      {item.name}
                                    </span>
                                  </SidebarMenuButton>
                                </ContextMenuTrigger>
                                <ContextMenuContent>
                                  <ContextMenuItem
                                    onClick={() => openRenameDialog(item)}
                                  >
                                    <Pencil /> Rename
                                  </ContextMenuItem>
                                  <ContextMenuSeparator />
                                  <ContextMenuItem
                                    variant="destructive"
                                    onClick={() => setDeletingItem(item)}
                                  >
                                    <Trash2 /> Delete
                                  </ContextMenuItem>
                                </ContextMenuContent>
                              </ContextMenu>
                            </SidebarMenuItem>
                          ))}
                        </>
                      )}
                    </SidebarMenu>
                  </TabsContent>

                  <TabsContent value="skills" className="mt-0">
                    <SidebarMenu className="gap-0.5">
                      {skillItems.length === 0 ? (
                        <div className="px-2 py-4 space-y-3">
                          <p className="text-xs text-muted-foreground">
                            No installed skills
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => switchTopView("skills")}
                          >
                            <Plus className="h-3.5 w-3.5 shrink-0" />
                            Install skills
                          </Button>
                        </div>
                      ) : (
                        skillItems.map((item) => (
                          <SidebarMenuItem key={item.path}>
                            <ContextMenu>
                              <ContextMenuTrigger className="w-full">
                                <SidebarMenuButton
                                  isActive={selectedItem?.path === item.path}
                                  onClick={() => void openItem(item)}
                                  tooltip={item.name}
                                  className="h-8"
                                >
                                  <Brain className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">{item.name}</span>
                                </SidebarMenuButton>
                              </ContextMenuTrigger>
                              <ContextMenuContent>
                                <ContextMenuItem
                                  onClick={() => openRenameDialog(item)}
                                >
                                  <Pencil /> Rename
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                  variant="destructive"
                                  onClick={() => setDeletingItem(item)}
                                >
                                  <Trash2 /> Delete
                                </ContextMenuItem>
                              </ContextMenuContent>
                            </ContextMenu>
                          </SidebarMenuItem>
                        ))
                      )}
                    </SidebarMenu>
                  </TabsContent>
                </Tabs>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </>
      )}

      {!scanResult && (
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="px-3 py-6 text-xs text-muted-foreground flex flex-col items-center gap-3 text-center">
                <FolderOpen className="h-6 w-6 opacity-40" />
                <span>Open a repository to explore agent context</span>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      )}
      {sidebarTab === "agents" && (
        <>
          <SidebarSeparator className="w-full mx-auto" />
          <SidebarFooter className="p-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCreateAgentError(null);
                setNewAgentName("");
                setIsCreateAgentOpen(true);
              }}
              disabled={!repoPath}
            >
              <FilePlus2 className="h-4 w-4" />
              Create agent
            </Button>
          </SidebarFooter>
        </>
      )}
      {sidebarTab === "skills" && (
        <>
          <SidebarSeparator className="w-full mx-auto" />
          <SidebarFooter className="p-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCreateSkillError(null);
                setNewSkillName("");
                setNewSkillDescription("");
                setIsCreateSkillOpen(true);
              }}
              disabled={!repoPath}
            >
              <FilePlus2 className="h-4 w-4" />
              Create skill
            </Button>
          </SidebarFooter>
        </>
      )}

      {/* Rename dialog */}
      <Dialog
        open={renamingItem !== null}
        onOpenChange={(open) => {
          if (!open) setRenamingItem(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename file</DialogTitle>
            <DialogDescription>
              Enter a new name for{" "}
              <code className="font-mono">{renamingItem?.raw_name}</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitRename();
                }
              }}
              disabled={isRenaming}
              autoFocus
            />
            {renameError && (
              <p className="text-xs text-destructive">{renameError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenamingItem(null)}
              disabled={isRenaming}
            >
              Cancel
            </Button>
            <Button onClick={() => void commitRename()} disabled={isRenaming}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deletingItem !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingItem(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete file</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <code className="font-mono">{deletingItem?.raw_name}</code>? This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingItem(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void commitDelete()}
              disabled={isDeleting}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateAgentOpen} onOpenChange={setIsCreateAgentOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create agent</DialogTitle>
            <DialogDescription>
              Enter a file name. <code className="font-mono">.md</code> will be
              added automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              placeholder="e.g. TEAM_AGENT"
              value={newAgentName}
              onChange={(e) => setNewAgentName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreateAgentFile();
                }
              }}
              disabled={isCreatingAgent}
            />
            {createAgentError && (
              <p className="text-xs text-destructive">{createAgentError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateAgentOpen(false)}
              disabled={isCreatingAgent}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreateAgentFile()}
              disabled={isCreatingAgent}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateSkillOpen} onOpenChange={setIsCreateSkillOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create skill</DialogTitle>
            <DialogDescription>
              Create a new skill in{" "}
              <code className="font-mono">.agents/skills</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="space-y-1">
              <p className="text-xs font-medium">Name</p>
              <Input
                placeholder="e.g. My Skill"
                value={newSkillName}
                onChange={(e) => setNewSkillName(e.target.value)}
                disabled={isCreatingSkill}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Description</p>
              <Textarea
                placeholder="What this skill does and when to use it."
                value={newSkillDescription}
                onChange={(e) => setNewSkillDescription(e.target.value)}
                disabled={isCreatingSkill}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                This description is important: it helps the agent know when to
                trigger the skill.
              </p>
            </div>
            {createSkillError && (
              <p className="text-xs text-destructive">{createSkillError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateSkillOpen(false)}
              disabled={isCreatingSkill}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreateSkill()}
              disabled={
                isCreatingSkill ||
                !newSkillName.trim() ||
                !newSkillDescription.trim()
              }
            >
              {isCreatingSkill ? <LoadingSpinner size="sm" /> : "Create skill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CommandDialog
        open={searchOpen}
        onOpenChange={(open) => {
          setSearchOpen(open);
          if (!open) setPaletteQuery("");
        }}
        title="Search repository"
        description="Agents, skills, and full-text in context files."
        showCloseButton={false}
        className="sm:max-w-lg"
      >
        <Command loop shouldFilter={false}>
          <CommandInput
            placeholder="Names, paths, or 2+ characters to search inside files…"
            value={paletteQuery}
            onValueChange={setPaletteQuery}
          />
          {contentSearchLoading && deferredQuery.length >= 2 && (
            <p className="px-3 pb-1 text-[11px] text-muted-foreground">
              Searching in files…
            </p>
          )}
          <CommandList className="max-h-[min(24rem,calc(100vh-12rem))]">
            {paletteNoResults && (
              <CommandEmpty>
                {!repoPath
                  ? "Open a repository first."
                  : !scanResult
                    ? "Nothing to search yet."
                    : deferredQuery.length >= 2
                      ? "No matches in names, paths, or file contents."
                      : "No matching agents or skills."}
              </CommandEmpty>
            )}
            {visibleAgents.length > 0 && (
              <CommandGroup heading="Agents">
                {visibleAgents.map((item) => (
                  <CommandItem
                    key={`agent:${item.path}`}
                    value={`agent ${item.name} ${item.raw_name} ${item.relative_path}`}
                    onSelect={() => selectFromPalette(item)}
                  >
                    <span className="inline-flex shrink-0">
                      {getAgentIcon(item.raw_name, item.relative_path)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <CommandShortcut className="max-w-[42%] truncate font-mono normal-case opacity-70">
                      {item.relative_path}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {visibleAgents.length > 0 && visibleSkills.length > 0 ? (
              <CommandSeparator alwaysRender />
            ) : null}
            {visibleSkills.length > 0 && (
              <CommandGroup heading="Skills">
                {visibleSkills.map((item) => (
                  <CommandItem
                    key={`skill:${item.path}`}
                    value={`skill ${item.name} ${item.raw_name} ${item.relative_path}`}
                    onSelect={() => selectFromPalette(item)}
                  >
                    <Brain className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <CommandShortcut className="max-w-[42%] truncate font-mono normal-case opacity-70">
                      {item.relative_path}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {deferredQuery.length >= 2 &&
            (contentHits.length > 0 || contentSearchLoading) ? (
              <>
                {(visibleAgents.length > 0 || visibleSkills.length > 0) && (
                  <CommandSeparator alwaysRender />
                )}
                <CommandGroup heading="In files">
                  {contentHits.map((hit) => (
                    <CommandItem
                      key={`hit:${hit.file_path}:${hit.line}`}
                      value={`${hit.relative_path} ${hit.line} ${hit.preview}`}
                      onSelect={() => openSearchHit(hit)}
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[11px] text-muted-foreground">
                          {hit.relative_path}:{hit.line}
                        </span>
                        <span className="block truncate text-sm">
                          {hit.preview}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </CommandDialog>
    </Sidebar>
  );
}
