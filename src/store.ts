import { create } from "zustand";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { FileItem, RepoScanResult, SkillSearchResult, ViewerFile } from "./types";
import { type EditorFontSize, loadSettings } from "./lib/settings";

// ── Recent repos helpers ──────────────────────────────────────────────────────
const RECENT_REPOS_KEY = "agenture_recent_repos";
const MAX_RECENT = 5;

function loadRecentRepos(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_REPOS_KEY);
    const parsed = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function persistRecentRepo(path: string): string[] {
  const prev = loadRecentRepos();
  const next = [path, ...prev.filter((p) => p !== path)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(next));
  } catch {
    /* quota exceeded — ignore */
  }
  return next;
}

type ViewMode = "rendered" | "edit";
type SidebarTab = "agents" | "skills" | "memory";
type CurrentView = "explorer" | "skills" | "terminal" | "mcp" | "git";

export interface AiToolBasic {
  id: string;
  label: string;
  command: string;
  args: string[];
}

export interface TerminalSessionInfo {
  id: string;
  tool: AiToolBasic;
  /** Working directory for spawn_terminal; when omitted, UI uses repo root */
  cwd?: string | null;
  /** Text to write to the terminal after the process spawns (e.g. a slash command) */
  initialInput?: string | null;
}

interface AppState {
  // Repo
  repoPath: string | null;
  scanResult: RepoScanResult | null;
  isScanning: boolean;
  recentRepos: string[];

  // Sidebar
  sidebarTab: SidebarTab;

  // Selected item in left sidebar (agent or skill entry point)
  selectedItem: FileItem | null;

  // The actual file being displayed in the markdown viewer
  viewerFile: ViewerFile | null;
  fileContent: string | null;
  isLoadingFile: boolean;
  viewMode: ViewMode;
  editContent: string | null;
  isDirty: boolean;

  // Current main panel view
  currentView: CurrentView;

  // Terminal tool selector dialog
  isTerminalDialogOpen: boolean;

  // Callback to call when a tool is selected in the terminal dialog
  terminalDialogCallback: ((tool: AiToolBasic) => void) | null;

  // Terminal sessions (tabs)
  terminalSessions: TerminalSessionInfo[];
  activeTerminalSessionId: string | null;

  // Memory
  selectedMemoryFolder: string | null;

  // Skills search
  skillQuery: string;
  skillResults: SkillSearchResult[];
  isSearchingSkills: boolean;

  // Settings
  editorFontSize: EditorFontSize;
  setEditorFontSize: (size: EditorFontSize) => void;

  // Actions
  setRepoPath: (path: string) => void;
  setScanResult: (result: RepoScanResult) => void;
  setIsScanning: (v: boolean) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  selectItem: (item: FileItem | null) => void;
  setViewerFile: (file: ViewerFile | null) => void;
  setFileContent: (content: string | null) => void;
  setIsLoadingFile: (v: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  setEditContent: (content: string) => void;
  setCurrentView: (view: CurrentView) => void;
  setIsTerminalDialogOpen: (v: boolean) => void;
  setTerminalDialogCallback: (cb: ((tool: AiToolBasic) => void) | null) => void;
  addTerminalSession: (tool: AiToolBasic, cwd?: string | null, initialInput?: string | null) => string;
  removeTerminalSession: (id: string) => void;
  replaceTerminalSession: (oldId: string, tool: AiToolBasic) => string;
  setActiveTerminalSessionId: (id: string) => void;
  setSelectedMemoryFolder: (folder: string | null) => void;
  setSkillQuery: (query: string) => void;
  setSkillResults: (results: SkillSearchResult[]) => void;
  setIsSearchingSkills: (v: boolean) => void;
  /** Native File menu / shared folder picker → scan_repository */
  openRepository: () => Promise<void>;
  /** Open a specific path directly (e.g. from recent repos list) */
  openRecentRepo: (path: string) => Promise<void>;
  /** Re-run scan_repository on the current repoPath (e.g. after rename/delete) */
  rescan: (options?: { silent?: boolean }) => Promise<void>;
  reset: () => void;
}

const initialState = {
  repoPath: null,
  scanResult: null,
  isScanning: false,
  recentRepos: loadRecentRepos(),
  currentView: "explorer" as CurrentView,
  sidebarTab: "agents" as SidebarTab,
  selectedItem: null,
  viewerFile: null,
  fileContent: null,
  isLoadingFile: false,
  viewMode: "edit" as ViewMode,
  editContent: null,
  isDirty: false,
  selectedMemoryFolder: null,
  skillQuery: "",
  skillResults: [],
  isSearchingSkills: false,
  isTerminalDialogOpen: false,
  terminalDialogCallback: null,
  terminalSessions: [],
  activeTerminalSessionId: null,
  editorFontSize: loadSettings().editorFontSize,
};

let sessionCounter = 0;
function newSessionId() {
  return `session-${Date.now()}-${++sessionCounter}`;
}

/** Prevents chained folder dialogs when duplicate menu / event listeners fire */
let openRepositoryInFlight = false;

export const useAppStore = create<AppState>((set) => ({
  ...initialState,

  setEditorFontSize: (size) => set({ editorFontSize: size }),
  setRepoPath: (path) => set({ repoPath: path }),
  setScanResult: (result) => set({ scanResult: result }),
  setIsScanning: (v) => set({ isScanning: v }),
  setSidebarTab: (tab) =>
    set({ sidebarTab: tab, selectedItem: null, viewerFile: null, fileContent: null }),

  selectItem: (item) =>
    set({
      selectedItem: item,
      viewerFile: null,
      fileContent: null,
      viewMode: "edit",
      editContent: null,
      isDirty: false,
    }),

  setViewerFile: (file) =>
    set(() => ({
      viewerFile: file,
      fileContent: null,
      editContent: null,
      isDirty: false,
      ...(file === null ? { viewMode: "edit" as ViewMode } : {}),
    })),

  setFileContent: (content) => set({ fileContent: content, editContent: content, isDirty: false }),
  setIsLoadingFile: (v) => set({ isLoadingFile: v }),
  setViewMode: (mode) => set({ viewMode: mode }),

  setEditContent: (content) =>
    set((state) => ({ editContent: content, isDirty: content !== state.fileContent })),

  setCurrentView: (view) => set({ currentView: view }),
  setIsTerminalDialogOpen: (v) => set({ isTerminalDialogOpen: v }),
  setTerminalDialogCallback: (cb) => set({ terminalDialogCallback: cb }),

  addTerminalSession: (tool, cwd, initialInput) => {
    const id = newSessionId();
    set((state) => ({
      terminalSessions: [...state.terminalSessions, { id, tool, cwd: cwd ?? null, initialInput: initialInput ?? null }],
      activeTerminalSessionId: id,
    }));
    return id;
  },

  removeTerminalSession: (id) =>
    set((state) => {
      const remaining = state.terminalSessions.filter((s) => s.id !== id);
      const activeId =
        state.activeTerminalSessionId === id
          ? (remaining[remaining.length - 1]?.id ?? null)
          : state.activeTerminalSessionId;
      return { terminalSessions: remaining, activeTerminalSessionId: activeId };
    }),

  replaceTerminalSession: (oldId, tool) => {
    const newId = newSessionId();
    set((state) => ({
      terminalSessions: state.terminalSessions.map((s) =>
        s.id === oldId ? { id: newId, tool, cwd: s.cwd ?? null } : s
      ),
      activeTerminalSessionId: newId,
    }));
    return newId;
  },

  setActiveTerminalSessionId: (id) => set({ activeTerminalSessionId: id }),

  setSelectedMemoryFolder: (folder) => set({ selectedMemoryFolder: folder }),
  setSkillQuery: (query) => set({ skillQuery: query }),
  setSkillResults: (results) => set({ skillResults: results }),
  setIsSearchingSkills: (v) => set({ isSearchingSkills: v }),

  openRepository: async () => {
    if (openRepositoryInFlight) return;
    openRepositoryInFlight = true;
    try {
      const selected = await open({ directory: true, multiple: false });
      if (!selected) return;
      set({ isScanning: true, scanResult: null });
      try {
        const result = await invoke<RepoScanResult>("scan_repository", {
          repoPath: selected,
        });
        const recentRepos = persistRecentRepo(selected as string);
        set({ repoPath: selected, scanResult: result, recentRepos });
      } catch (e) {
        console.error("Scan failed:", e);
      } finally {
        set({ isScanning: false });
      }
    } finally {
      openRepositoryInFlight = false;
    }
  },

  openRecentRepo: async (path) => {
    set({ isScanning: true, scanResult: null });
    try {
      const result = await invoke<RepoScanResult>("scan_repository", {
        repoPath: path,
      });
      const recentRepos = persistRecentRepo(path);
      set({ repoPath: path, scanResult: result, recentRepos });
    } catch (e) {
      console.error("Failed to open recent repo:", e);
    } finally {
      set({ isScanning: false });
    }
  },

  rescan: async (options) => {
    const { repoPath } = useAppStore.getState();
    if (!repoPath) return;
    const silent = options?.silent === true;
    if (!silent) set({ isScanning: true });
    try {
      const result = await invoke<RepoScanResult>("scan_repository", {
        repoPath,
      });
      set({ scanResult: result });
    } catch (e) {
      console.error("Rescan failed:", e);
    } finally {
      if (!silent) set({ isScanning: false });
    }
  },

  reset: () => set({ ...initialState }),
}));
