import {
  useState,
  useRef,
  useEffect,
  type ReactNode,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronRight,
  FileText,
  BookOpen,
  FolderPlus,
  FilePlus2,
  Trash2,
  Pencil,
} from "lucide-react";
import { useAppStore } from "@/store";
import { formatName } from "@/lib/format";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { SkillFile, SkillFolder, DetectedSkill } from "@/types";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/common/Toaster";

type DragPayload = {
  path: string;
  name: string;
};

const SKILL_NAV_MIME = "application/x-agenture-skill-nav";

function countMdInTree(folder: SkillFolder): number {
  return (
    folder.files.length +
    (folder.folders ?? []).reduce((n, f) => n + countMdInTree(f), 0)
  );
}

function flattenSkillMdFiles(skill: DetectedSkill): SkillFile[] {
  function fromFolder(f: SkillFolder): SkillFile[] {
    return [...f.files, ...(f.folders ?? []).flatMap(fromFolder)];
  }
  return [
    ...(skill.root_files ?? []),
    ...(skill.folders ?? []).flatMap(fromFolder),
  ];
}

function collectFolderRelPaths(folders: SkillFolder[]): string[] {
  const keys: string[] = [];
  for (const f of folders) {
    keys.push(f.rel_path);
    keys.push(...collectFolderRelPaths(f.folders ?? []));
  }
  return keys;
}

export function SkillNavigator() {
  const {
    selectedItem,
    repoPath,
    viewerFile,
    setViewerFile,
    setFileContent,
    setIsLoadingFile,
    rescan,
    selectItem,
  } = useAppStore();

  // Default all folders open
  const skill = selectedItem?.skill;
  const skillRoot = skill
    ? skill.readme_path.slice(0, skill.readme_path.lastIndexOf("/"))
    : "";
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [createTargetDir, setCreateTargetDir] = useState<string | null>(null);
  const [createType, setCreateType] = useState<"file" | "folder">("file");
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [renameTarget, setRenameTarget] = useState<SkillFile | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SkillFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [dragOverDir, setDragOverDir] = useState<string | null>(null);
  /** Synchronous during drag — `getData` is unavailable during dragover in WebKit. */
  const draggingRef = useRef<DragPayload | null>(null);

  const folderLayoutSig = skill
    ? collectFolderRelPaths(skill.folders ?? []).join("/")
    : "";

  useEffect(() => {
    if (!skill) return;
    setOpenFolders((prev) => {
      const next = { ...prev };
      for (const rel of collectFolderRelPaths(skill.folders ?? [])) {
        if (next[rel] === undefined) next[rel] = true;
      }
      return next;
    });
  }, [skill?.readme_path, folderLayoutSig]);

  if (!selectedItem || selectedItem.type !== "skill" || !skill) return null;

  const allSkillMdFiles = flattenSkillMdFiles(skill);

  async function openFile(file: SkillFile) {
    setViewerFile({
      name: formatName(file.raw_name),
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
      console.error("Failed to read file:", e);
    } finally {
      setIsLoadingFile(false);
    }
  }

  function openCreateDialog(targetDir: string, type: "file" | "folder") {
    setCreateTargetDir(targetDir);
    setCreateType(type);
    setCreateName("");
    setCreateError(null);
  }

  function refreshSelectedSkillFromScan() {
    const latestScan = useAppStore.getState().scanResult;
    const currentSelected = selectedItem;
    if (!latestScan || !currentSelected || currentSelected.type !== "skill")
      return;
    const updated = latestScan.skills.find(
      (s) => s.readme_path === currentSelected.skill?.readme_path,
    );
    if (!updated) return;
    selectItem({
      name: currentSelected.name,
      raw_name: currentSelected.raw_name,
      path: updated.readme_path,
      relative_path: updated.readme_relative,
      type: "skill",
      size_bytes: updated.size_bytes,
      skill: updated,
    });
  }

  async function commitCreate() {
    if (!repoPath || !createTargetDir) return;
    const raw = createName.trim();
    if (!raw) {
      setCreateError("Name is required.");
      return;
    }
    const name =
      createType === "file" ? raw.replace(/\.md$/i, "") + ".md" : raw;
    const targetPath = `${createTargetDir}/${name}`;

    setIsCreating(true);
    setCreateError(null);
    try {
      if (createType === "folder") {
        await invoke("create_directory", {
          directoryPath: targetPath,
          repoPath,
        });
      } else {
        await invoke("write_file", {
          filePath: targetPath,
          content: "",
          repoPath,
        });
      }
      await rescan();
      refreshSelectedSkillFromScan();
      setCreateTargetDir(null);
      showToast({
        title: createType === "folder" ? "Folder created" : "File created",
        description: name,
      });
    } catch (e) {
      setCreateError(String(e));
    } finally {
      setIsCreating(false);
    }
  }

  async function commitRename() {
    if (!repoPath || !renameTarget) return;
    const next = renameValue.trim();
    if (!next || next === renameTarget.raw_name) {
      setRenameTarget(null);
      return;
    }

    setIsRenaming(true);
    setRenameError(null);
    try {
      const newPath = await invoke<string>("rename_file", {
        oldPath: renameTarget.path,
        newName: next,
        repoPath,
      });

      if (viewerFile?.path === renameTarget.path) {
        const newRelative = renameTarget.relative_path
          .split("/")
          .slice(0, -1)
          .concat(next)
          .join("/");
        setViewerFile({
          name: formatName(next),
          path: newPath,
          relative_path: newRelative,
        });
      }

      await rescan();
      refreshSelectedSkillFromScan();
      setRenameTarget(null);
      showToast({ title: "File renamed", description: next });
    } catch (e) {
      setRenameError(String(e));
    } finally {
      setIsRenaming(false);
    }
  }

  async function commitDelete() {
    if (!repoPath || !deleteTarget) return;
    setIsDeleting(true);
    try {
      await invoke("delete_file", {
        filePath: deleteTarget.path,
        repoPath,
      });
      if (viewerFile?.path === deleteTarget.path) {
        setViewerFile(null);
        setFileContent(null);
      }
      await rescan();
      refreshSelectedSkillFromScan();
      setDeleteTarget(null);
      showToast({ title: "File deleted", description: deleteTarget.raw_name });
    } catch (e) {
      showToast({ title: "Delete failed", description: String(e) });
    } finally {
      setIsDeleting(false);
    }
  }

  function getParentDir(path: string) {
    const idx = path.lastIndexOf("/");
    return idx >= 0 ? path.slice(0, idx) : "";
  }

  async function moveFileToDir(file: SkillFile, targetDir: string) {
    if (!repoPath) return;
    const currentDir = getParentDir(file.path);
    if (!targetDir || currentDir === targetDir) return;
    const newPath = `${targetDir}/${file.raw_name}.md`;

    try {
      const movedPath = await invoke<string>("move_path", {
        oldPath: file.path,
        newPath,
        repoPath,
      });

      if (viewerFile?.path === file.path) {
        const newRelative = movedPath.startsWith(`${repoPath}/`)
          ? movedPath.slice(repoPath.length + 1)
          : viewerFile.relative_path;
        setViewerFile({
          name: formatName(file.raw_name),
          path: movedPath,
          relative_path: newRelative,
        });
      }

      await rescan();
      refreshSelectedSkillFromScan();
      showToast({ title: "File moved", description: `${file.raw_name}.md` });
    } catch (e) {
      showToast({ title: "Move failed", description: String(e) });
    } finally {
      setDragOverDir(null);
    }
  }

  function handleDragStart(e: DragEvent, file: SkillFile) {
    const payload: DragPayload = {
      path: file.path,
      name: file.raw_name,
    };
    draggingRef.current = payload;
    e.dataTransfer.effectAllowed = "move";
    const json = JSON.stringify(payload);
    try {
      e.dataTransfer.setData(SKILL_NAV_MIME, json);
    } catch {
      /* Some WebViews reject non-standard types */
    }
    e.dataTransfer.setData("text/plain", json);
  }

  /** During dragover, `getData` is often empty; use types list + ref. */
  function isSkillNavDrag(e: DragEvent): boolean {
    if (draggingRef.current) return true;
    const types = Array.from(e.dataTransfer.types);
    return types.includes(SKILL_NAV_MIME);
  }

  function parseDropPayload(e: DragEvent): DragPayload | null {
    let raw = "";
    try {
      raw = e.dataTransfer.getData(SKILL_NAV_MIME);
    } catch {
      raw = "";
    }
    if (!raw) raw = e.dataTransfer.getData("text/plain");
    if (!raw && draggingRef.current) return draggingRef.current;
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DragPayload;
    } catch {
      return null;
    }
  }

  function handleDragEnd() {
    draggingRef.current = null;
    setDragOverDir(null);
  }

  function renderSkillFolder(folder: SkillFolder, depth: number) {
    const dropPath = `${skillRoot}/${folder.rel_path}`;
    const mdCount = countMdInTree(folder);
    const rowPad = { paddingLeft: `${0.5 + depth * 0.5}rem` } as const;

    return (
      <Collapsible
        key={folder.rel_path}
        open={openFolders[folder.rel_path] ?? true}
        onOpenChange={(open) =>
          setOpenFolders((prev) => ({ ...prev, [folder.rel_path]: open }))
        }
      >
        <ContextMenu>
          <ContextMenuTrigger>
            <CollapsibleTrigger
              className={cn(
                "flex items-center gap-1.5 w-full py-1.5 pr-3 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer group",
                dragOverDir === dropPath && "bg-accent/40",
              )}
              style={rowPad}
              onDragOver={(e) => {
                if (!isSkillNavDrag(e)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverDir(dropPath);
              }}
              onDragLeave={() =>
                setDragOverDir((prev) => (prev === dropPath ? null : prev))
              }
              onDrop={async (e) => {
                e.preventDefault();
                const payload = parseDropPayload(e);
                handleDragEnd();
                if (!payload) return;
                const source = allSkillMdFiles.find(
                  (f) => f.path === payload.path,
                );
                if (!source) return;
                await moveFileToDir(source, dropPath);
              }}
            >
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-transform duration-150",
                  openFolders[folder.rel_path] && "rotate-90",
                )}
              />
              <span className="uppercase tracking-wider">
                {formatName(folder.name)}
              </span>
              <span className="ml-auto text-[10px]">{mdCount}</span>
            </CollapsibleTrigger>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem
              onClick={() => openCreateDialog(dropPath, "file")}
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              New file
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => openCreateDialog(dropPath, "folder")}
            >
              <FolderPlus className="h-3.5 w-3.5" />
              New folder
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <CollapsibleContent>
          <div>
            {folder.files.map((file) => (
              <ContextMenu key={file.path}>
                <ContextMenuTrigger>
                  <FileButton
                    label={formatName(file.raw_name)}
                    icon={<FileText className="h-3.5 w-3.5 shrink-0" />}
                    isActive={viewerFile?.path === file.path}
                    draggable={file.raw_name.toLowerCase() !== "skill"}
                    onDragStart={(e) => handleDragStart(e, file)}
                    onDragEnd={handleDragEnd}
                    onClick={() => openFile(file)}
                    indentDepth={depth + 1}
                  />
                </ContextMenuTrigger>
                {file.raw_name.toLowerCase() !== "skill" && (
                  <ContextMenuContent>
                    <ContextMenuItem
                      onClick={() => {
                        setRenameTarget(file);
                        setRenameValue(file.raw_name);
                        setRenameError(null);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Rename
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={() => setDeleteTarget(file)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </ContextMenuItem>
                  </ContextMenuContent>
                )}
              </ContextMenu>
            ))}
            {(folder.folders ?? []).map((sub) =>
              renderSkillFolder(sub, depth + 1),
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <aside className="w-56 border-r flex flex-col shrink-0 overflow-y-auto bg-background">
      {/* Header */}
      <div className="px-3 py-2 border-b">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {selectedItem.name}
        </p>
      </div>

      <ContextMenu>
        <ContextMenuTrigger
          className={cn(
            "flex-1 overflow-y-auto py-1 pr-1",
            dragOverDir === skillRoot && "bg-accent/20",
          )}
          onDragOver={(e) => {
            if (!isSkillNavDrag(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDragOverDir(skillRoot);
          }}
          onDragLeave={() =>
            setDragOverDir((prev) => (prev === skillRoot ? null : prev))
          }
          onDrop={async (e) => {
            e.preventDefault();
            const payload = parseDropPayload(e);
            handleDragEnd();
            if (!payload) return;
            const source = allSkillMdFiles.find((f) => f.path === payload.path);
            if (!source) return;
            await moveFileToDir(source, skillRoot);
          }}
        >
          {/* Readme link */}
          <FileButton
            label="Overview"
            icon={<BookOpen className="h-3.5 w-3.5 shrink-0" />}
            isActive={viewerFile?.path === skill.readme_path}
            isDropTarget={dragOverDir === skillRoot}
            onDragOver={(e) => {
              if (!isSkillNavDrag(e)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOverDir(skillRoot);
            }}
            onDragLeave={() =>
              setDragOverDir((prev) => (prev === skillRoot ? null : prev))
            }
            onDrop={async (e) => {
              e.preventDefault();
              const payload = parseDropPayload(e);
              handleDragEnd();
              if (!payload) return;
              const source = allSkillMdFiles.find((f) => f.path === payload.path);
              if (!source) return;
              await moveFileToDir(source, skillRoot);
            }}
            onClick={async () => {
              setViewerFile({
                name: selectedItem.name,
                path: skill.readme_path,
                relative_path: skill.readme_relative,
              });
              setIsLoadingFile(true);
              try {
                const content = await invoke<string>("read_file", {
                  filePath: skill.readme_path,
                  repoPath,
                });
                setFileContent(content);
              } finally {
                setIsLoadingFile(false);
              }
            }}
          />

          {/* Root-level .md files (not the readme) */}
          {skill.root_files.map((file) => (
            <ContextMenu key={file.path}>
              <ContextMenuTrigger>
                <FileButton
                  label={formatName(file.raw_name)}
                  icon={<FileText className="h-3.5 w-3.5 shrink-0" />}
                  isActive={viewerFile?.path === file.path}
                  draggable={file.raw_name.toLowerCase() !== "skill"}
                  onDragStart={(e) => handleDragStart(e, file)}
                  onDragEnd={handleDragEnd}
                  onClick={() => openFile(file)}
                />
              </ContextMenuTrigger>
              {file.raw_name.toLowerCase() !== "skill" && (
                <ContextMenuContent>
                  <ContextMenuItem
                    onClick={() => {
                      setRenameTarget(file);
                      setRenameValue(file.raw_name);
                      setRenameError(null);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Rename
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => setDeleteTarget(file)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              )}
            </ContextMenu>
          ))}

          {/* Sub-folders (recursive) */}
          {(skill.folders ?? []).map((folder) => renderSkillFolder(folder, 0))}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => openCreateDialog(skillRoot, "file")}>
            <FilePlus2 className="h-3.5 w-3.5" />
            New file
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => openCreateDialog(skillRoot, "folder")}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            New folder
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog
        open={createTargetDir !== null}
        onOpenChange={(o) => !o && setCreateTargetDir(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {createType === "folder" ? "New folder" : "New file"}
            </DialogTitle>
            <DialogDescription>
              Create in this skill navigator.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              placeholder={
                createType === "folder" ? "folder-name" : "file-name.md"
              }
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              disabled={isCreating}
            />
            {createError && (
              <p className="text-xs text-destructive">{createError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateTargetDir(null)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void commitCreate()}
              disabled={isCreating || !createName.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(o) => !o && setRenameTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename file</DialogTitle>
            <DialogDescription>Enter a new file name.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              disabled={isRenaming}
            />
            {renameError && (
              <p className="text-xs text-destructive">{renameError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameTarget(null)}
              disabled={isRenaming}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void commitRename()}
              disabled={isRenaming || !renameValue.trim()}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete file</DialogTitle>
            <DialogDescription>
              Delete <code className="font-mono">{deleteTarget?.raw_name}</code>
              ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
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
    </aside>
  );
}

function FileButton({
  label,
  icon,
  isActive,
  onClick,
  draggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  isDropTarget = false,
  indentDepth = 0,
}: {
  label: string;
  icon: ReactNode;
  isActive: boolean;
  onClick: () => void;
  draggable?: boolean;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: (e: DragEvent) => void;
  onDragOver?: (e: DragEvent) => void;
  onDragLeave?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
  isDropTarget?: boolean;
  /** Nesting level for skill subfolder files (0 = root row padding). */
  indentDepth?: number;
}) {
  const rowPad =
    indentDepth > 0
      ? ({ paddingLeft: `${0.75 + indentDepth * 0.5}rem` } as const)
      : undefined;

  const className = cn(
    "flex items-center gap-2 w-full text-left text-xs py-1.5 pr-3 rounded-sm transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring",
    indentDepth === 0 && "pl-3",
    isDropTarget && "ring-1 ring-ring bg-accent/40",
    isActive
      ? "bg-accent text-accent-foreground font-medium"
      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
  );

  const onKeyDownRow = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  if (draggable) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={onKeyDownRow}
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={className}
        style={rowPad}
      >
        {icon}
        <span className="truncate">{label}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={className}
      style={rowPad}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}
