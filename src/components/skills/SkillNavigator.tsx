import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, FileText, BookOpen } from "lucide-react";
import { useAppStore } from "@/store";
import { formatName } from "@/lib/format";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { SkillFile } from "@/types";

export function SkillNavigator() {
  const {
    selectedItem,
    repoPath,
    viewerFile,
    setViewerFile,
    setFileContent,
    setIsLoadingFile,
  } = useAppStore();

  // Default all folders open
  const skill = selectedItem?.skill;
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(
    () => {
      const init: Record<string, boolean> = {};
      skill?.folders.forEach((f) => {
        init[f.name] = true;
      });
      return init;
    },
  );

  if (!selectedItem || selectedItem.type !== "skill" || !skill) return null;
  const hasFolders = skill.folders.length > 0 || skill.root_files.length > 0;
  if (!hasFolders) return null;

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

  function toggleFolder(name: string) {
    setOpenFolders((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  return (
    <aside className="w-56 border-r flex flex-col shrink-0 overflow-y-auto bg-background">
      {/* Header */}
      <div className="px-3 py-2 border-b">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {selectedItem.name}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto py-1 pr-1">
        {/* Readme link */}
        <FileButton
          label="Overview"
          icon={<BookOpen className="h-3.5 w-3.5 shrink-0" />}
          isActive={viewerFile?.path === skill.readme_path}
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
          <FileButton
            key={file.path}
            label={formatName(file.raw_name)}
            icon={<FileText className="h-3.5 w-3.5 shrink-0" />}
            isActive={viewerFile?.path === file.path}
            onClick={() => openFile(file)}
          />
        ))}

        {/* Sub-folders as collapsibles */}
        {skill.folders.map((folder) => (
          <Collapsible
            key={folder.name}
            open={openFolders[folder.name] ?? true}
            onOpenChange={() => toggleFolder(folder.name)}
          >
            <CollapsibleTrigger className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer group">
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-transform duration-150",
                  openFolders[folder.name] && "rotate-90",
                )}
              />
              <span className="uppercase tracking-wider">
                {formatName(folder.name)}
              </span>
              <span className="ml-auto text-[10px]">{folder.files.length}</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {folder.files.map((file) => (
                <FileButton
                  key={file.path}
                  label={formatName(file.raw_name)}
                  icon={<FileText className="h-3.5 w-3.5 shrink-0" />}
                  isActive={viewerFile?.path === file.path}
                  onClick={() => openFile(file)}
                  indent
                />
              ))}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    </aside>
  );
}

function FileButton({
  label,
  icon,
  isActive,
  onClick,
  indent = false,
}: {
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
  indent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full text-left text-xs py-1.5 pr-3 rounded-sm transition-colors cursor-pointer",
        indent ? "pl-7" : "pl-3",
        isActive
          ? "bg-accent text-accent-foreground font-medium"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}
