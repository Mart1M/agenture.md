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
  DatabaseZap,
  BookOpen,
  GitFork,
  Shapes,
  Sliders,
  Wand2,
  type LucideIcon,
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
  MemoryFile,
  RepoScanResult,
  SkillFolder,
  ViewerFile,
} from "@/types";
import { SetupAgentureDialog } from "@/components/setup/SetupAgentureDialog";
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

const DESIGN_MD_TEMPLATE = `---
version: "alpha"
name: My Design System
description: Visual identity for this project

colors:
  primary: "#000000"
  secondary: "#FFFFFF"
  accent: "#0066CC"
  neutral: "#6B7280"
  surface: "#F9FAFB"
  on-primary: "#FFFFFF"

typography:
  h1:
    fontFamily: "Inter"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.2
  h2:
    fontFamily: "Inter"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Inter"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4

rounded:
  sm: "4px"
  md: "8px"
  lg: "16px"
  full: "9999px"

spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
---

## Overview

[Describe your design philosophy and visual direction. What feeling should the UI convey? What are the core principles?]

## Colors

[Describe each color token and its role in the interface.]

- **Primary** (\`#000000\`): Main brand color, used for CTAs, active states, and key UI elements.
- **Secondary** (\`#FFFFFF\`): Background and inverse surfaces.
- **Accent** (\`#0066CC\`): Interactive highlights, links, and focus states.
- **Neutral** (\`#6B7280\`): Text, borders, and subtle backgrounds.
- **Surface** (\`#F9FAFB\`): Page and card backgrounds.

## Typography

[Describe the font families and when to use each text style.]

Use **Inter** as the primary typeface. Reserve \`h1\` for page titles, \`h2\` for section headings, \`body\` for all running text, and \`label\` for form labels and captions.

## Layout

[Describe spacing scale, grid, and composition principles.]

Follow the spacing scale defined in the tokens. Components should use \`sm\` padding for compact elements and \`md\`/\`lg\` for spacious layouts.

## Elevation & Depth

[Describe shadow strategy and layering.]

Use minimal elevation: flat surfaces for most components, subtle shadows (\`0 1px 3px rgba(0,0,0,0.1)\`) for cards and dropdowns.

## Shapes

[Describe border radius usage.]

Prefer \`md\` (8px) for cards and buttons, \`sm\` (4px) for inputs and badges, and \`full\` for pills and avatars.

## Components

[Describe component-level styling guidelines.]

Buttons use solid fills for primary actions and outlined/ghost variants for secondary actions. Maintain consistent padding and rounded values across all interactive elements.

## Do's and Don'ts

**Do:**
- Maintain color contrast ratios ≥ 4.5:1 for text
- Use spacing tokens instead of arbitrary pixel values
- Reference tokens using \`{path.to.token}\` syntax

**Don't:**
- Use colors outside the defined palette
- Mix font families without adding them to the \`typography\` tokens
- Override spacing with hardcoded values
`;

const MEMORY_FOLDER_ICONS: Record<string, LucideIcon> = {
  context: BookOpen,
  decision: GitFork,
  pattern: Shapes,
  preference: Sliders,
};

function getMemoryFolderIcon(name: string): LucideIcon {
  return MEMORY_FOLDER_ICONS[name.toLowerCase()] ?? DatabaseZap;
}

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
    selectedMemoryFolder,
    setSelectedMemoryFolder,
  } = useAppStore();

  const memory = scanResult?.memory ?? null;
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isCreateAgentOpen, setIsCreateAgentOpen] = useState(false);
  const [isCreateCustomAgentOpen, setIsCreateCustomAgentOpen] = useState(false);
  const [newCustomAgentName, setNewCustomAgentName] = useState("");
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
      if (renamingItem.type === "skill") {
        const oldReadmePath = renamingItem.path;
        const oldSkillDir = oldReadmePath.slice(0, oldReadmePath.lastIndexOf("/"));
        const parentDir = oldSkillDir.slice(0, oldSkillDir.lastIndexOf("/"));
        const newSkillDir = `${parentDir}/${newName}`;
        const newReadmePath = `${newSkillDir}/${oldReadmePath.split("/").pop()}`;
        await invoke<string>("move_path", {
          oldPath: oldSkillDir,
          newPath: newSkillDir,
          repoPath,
        });
        // If the renamed skill readme is currently open in the viewer, update it
        if (viewerFile?.path === oldReadmePath) {
          const oldReadmeRelative = renamingItem.relative_path;
          const oldSkillDirRelative = oldReadmeRelative.slice(
            0,
            oldReadmeRelative.lastIndexOf("/"),
          );
          const parentRelative = oldSkillDirRelative.slice(
            0,
            oldSkillDirRelative.lastIndexOf("/"),
          );
          const newReadmeRelative = `${parentRelative}/${newName}/${oldReadmePath.split("/").pop()}`;
          setViewerFile({
            name: newName,
            path: newReadmePath,
            relative_path: newReadmeRelative,
          });
        }
      } else {
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

  async function openMemoryFile(file: MemoryFile) {
    setCurrentView("explorer");
    selectItem(null);
    setSelectedMemoryFolder(null);
    await loadFile(file.path, {
      name: file.raw_name,
      path: file.path,
      relative_path: file.relative_path,
    });
  }

  function switchTopView(
    view: "explorer" | "skills" | "terminal" | "mcp" | "git",
  ) {
    selectItem(null);
    setCurrentView(view);
  }

  async function handleCreateDesignMd() {
    if (!repoPath) return;
    const filePath = `${repoPath}/DESIGN.md`;
    setIsCreatingAgent(true);
    setCreateAgentError(null);
    try {
      await invoke("write_file", {
        filePath,
        content: DESIGN_MD_TEMPLATE,
        repoPath,
      });
      setIsCreateAgentOpen(false);
      void rescan();
    } catch (error) {
      setCreateAgentError(String(error));
    } finally {
      setIsCreatingAgent(false);
    }
  }

  async function handleCreateAgentsMd() {
    if (!repoPath) return;
    const filePath = `${repoPath}/AGENTS.md`;
    setIsCreatingAgent(true);
    setCreateAgentError(null);
    try {
      await invoke("write_file", {
        filePath,
        content: "",
        repoPath,
      });
      setIsCreateAgentOpen(false);
      void rescan();
    } catch (error) {
      setCreateAgentError(String(error));
    } finally {
      setIsCreatingAgent(false);
    }
  }

  async function handleCreateCustomAgent() {
    if (!repoPath) return;
    const baseName = newCustomAgentName.trim().replace(/\.md$/i, "");
    if (!baseName) {
      setCreateAgentError("Please enter an agent name.");
      return;
    }

    const filePath = `${repoPath}/.agents/${baseName}.md`;
    setIsCreatingAgent(true);
    setCreateAgentError(null);
    try {
      // Ensure the .agents folder exists for custom agents.
      try {
        await invoke("create_directory", {
          directoryPath: `${repoPath}/.agents`,
          repoPath,
        });
      } catch {
        // Ignore if it already exists.
      }

      await invoke("write_file", {
        filePath,
        content: "",
        repoPath,
      });
      setIsCreateCustomAgentOpen(false);
      setIsCreateAgentOpen(false);
      setNewCustomAgentName("");
      void rescan();
      showToast({
        title: "Custom agent created",
        description: `.agents/${baseName}.md`,
      });
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
                  onValueChange={(v) => setSidebarTab(v as "agents" | "skills" | "memory")}
                >
                  <div className="flex items-center gap-1 mb-1">
                    <TabsList className="h-8 flex-1">
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
                        <Brain className="h-3 w-3" />
                        Skills
                        {skillItems.length > 0 && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            {skillItems.length}
                          </span>
                        )}
                      </TabsTrigger>
                    </TabsList>
                    <button
                      type="button"
                      title="Memory"
                      aria-label="Memory"
                      onClick={() =>
                        setSidebarTab(sidebarTab === "memory" ? "agents" : "memory")
                      }
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors",
                        sidebarTab === "memory"
                          ? "border-foreground/30 bg-accent text-foreground"
                          : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <DatabaseZap className="h-3.5 w-3.5" />
                    </button>
                  </div>

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

                  <TabsContent value="memory" className="mt-0">
                    {!memory ? (
                      <div className="px-2 py-4 space-y-3">
                        <p className="text-xs text-muted-foreground">
                          No .memory/ folder found.
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => setIsSetupOpen(true)}
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                          Setup Agenture
                        </Button>
                      </div>
                    ) : (
                      <SidebarMenu className="gap-0.5">
                        {memory.index_file && (
                          <SidebarMenuItem>
                            <SidebarMenuButton
                              isActive={
                                viewerFile?.path === memory.index_file.path &&
                                selectedMemoryFolder === null
                              }
                              onClick={() => void openMemoryFile(memory.index_file!)}
                              className="h-8"
                            >
                              <FileText className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">INDEX.md</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )}
                        {memory.index_file && memory.folders.length > 0 && (
                          <SidebarSeparator className="my-1 w-full" />
                        )}
                        {memory.folders.map((folder) => {
                          const FolderIcon = getMemoryFolderIcon(folder.name);
                          return (
                          <SidebarMenuItem key={folder.name}>
                            <SidebarMenuButton
                              isActive={selectedMemoryFolder === folder.name}
                              onClick={() =>
                                setSelectedMemoryFolder(
                                  selectedMemoryFolder === folder.name
                                    ? null
                                    : folder.name,
                                )
                              }
                              className="h-8"
                            >
                              <FolderIcon className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate capitalize">
                                {folder.name}
                              </span>
                              {folder.files.length > 0 && (
                                <span className="ml-auto text-[10px] text-muted-foreground">
                                  {folder.files.length}
                                </span>
                              )}
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          );
                        })}
                      </SidebarMenu>
                    )}
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
                setNewCustomAgentName("");
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
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create agent file</DialogTitle>
            <DialogDescription>
              Choose the type of agent file to create.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-3">
            <button
              type="button"
              className={cn(
                "flex flex-col gap-2 rounded-lg border border-border p-4 text-left transition-colors",
                "hover:border-foreground/40 hover:bg-accent",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
              onClick={() => void handleCreateDesignMd()}
              disabled={isCreatingAgent}
            >
              <Palette className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">DESIGN.md</p>
                <p className="text-xs text-muted-foreground">
                  Pre-filled design system template (Google Stitch format)
                </p>
              </div>
            </button>
            <button
              type="button"
              className={cn(
                "flex flex-col gap-2 rounded-lg border border-border p-4 text-left transition-colors",
                "hover:border-foreground/40 hover:bg-accent",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
              onClick={() => void handleCreateAgentsMd()}
              disabled={isCreatingAgent}
            >
              <FilePlus2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">AGENTS.md</p>
                <p className="text-xs text-muted-foreground">
                  Blank agent file for coding assistant instructions
                </p>
              </div>
            </button>
            <button
              type="button"
              className={cn(
                "flex flex-col gap-2 rounded-lg border border-border p-4 text-left transition-colors",
                "hover:border-foreground/40 hover:bg-accent",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
              onClick={() => {
                setCreateAgentError(null);
                setNewCustomAgentName("");
                setIsCreateCustomAgentOpen(true);
              }}
              disabled={isCreatingAgent}
            >
              <Bot className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Custom agent</p>
                <p className="text-xs text-muted-foreground">
                  Create <code className="font-mono">.agents/&lt;name&gt;.md</code>
                </p>
              </div>
            </button>
          </div>
          {createAgentError && (
            <p className="text-xs text-destructive">{createAgentError}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateAgentOpen(false)}
              disabled={isCreatingAgent}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCreateCustomAgentOpen}
        onOpenChange={(open) => {
          setIsCreateCustomAgentOpen(open);
          if (!open) {
            setNewCustomAgentName("");
            setCreateAgentError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create custom agent</DialogTitle>
            <DialogDescription>
              Enter a name. The file will be created in{" "}
              <code className="font-mono">.agents/</code> with{" "}
              <code className="font-mono">.md</code> appended automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              placeholder="e.g. team-assistant"
              value={newCustomAgentName}
              onChange={(e) => setNewCustomAgentName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreateCustomAgent();
                }
              }}
              disabled={isCreatingAgent}
              autoFocus
            />
            {createAgentError && (
              <p className="text-xs text-destructive">{createAgentError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateCustomAgentOpen(false)}
              disabled={isCreatingAgent}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreateCustomAgent()}
              disabled={isCreatingAgent || !newCustomAgentName.trim()}
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

      <SetupAgentureDialog open={isSetupOpen} onOpenChange={setIsSetupOpen} />
    </Sidebar>
  );
}
