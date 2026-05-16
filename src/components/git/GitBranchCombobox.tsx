import { useMemo, useState } from "react";
import { ChevronDown, GitBranch, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createBranch, formatBranchLabel } from "@/lib/git-panel";
import { cn } from "@/lib/utils";

interface Props {
  repoPath: string;
  currentBranch: string | null;
  localBranches: string[];
  remoteBranches: string[];
  disabled?: boolean;
  onBranchChange: (branch: string) => Promise<void>;
  onCreated?: () => void;
}

export function GitBranchCombobox({
  repoPath,
  currentBranch,
  localBranches,
  remoteBranches,
  disabled,
  onBranchChange,
  onCreated,
}: Props) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const remoteOnly = useMemo(() => {
    const local = new Set(localBranches);
    return remoteBranches.filter((remote) => {
      const short = remote.includes("/") ? remote.split("/").slice(1).join("/") : remote;
      return !local.has(short);
    });
  }, [localBranches, remoteBranches]);

  async function selectBranch(branch: string) {
    if (branch === currentBranch) {
      setOpen(false);
      return;
    }
    setOpen(false);
    await onBranchChange(branch);
  }

  async function handleCreate() {
    const name = newBranchName.trim();
    if (!name) {
      setCreateError("Enter a branch name.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await createBranch(repoPath, name);
      setCreateOpen(false);
      setNewBranchName("");
      setOpen(false);
      onCreated?.();
      await onBranchChange(name);
    } catch (e) {
      setCreateError(String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={disabled}
          className={cn(
            "flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 text-left text-sm font-medium outline-none",
            "hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
          title={currentBranch ?? undefined}
        >
          <span className="min-w-0 flex-1 truncate">
            {currentBranch ? formatBranchLabel(currentBranch, 32) : "Branch"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent className="p-0" align="start">
          <Command className="rounded-xl border-0 shadow-none">
            <CommandInput placeholder="Search branches…" />
            <CommandList className="max-h-72">
              <CommandEmpty>No branch found.</CommandEmpty>

              <CommandGroup>
                <CommandItem
                  value="__create_new_branch__"
                  onSelect={() => {
                    setCreateOpen(true);
                    setCreateError(null);
                  }}
                  className="font-medium"
                >
                  <Plus className="h-4 w-4 opacity-70" />
                  <span>Create new branch…</span>
                </CommandItem>
              </CommandGroup>

              <CommandSeparator alwaysRender />

              <CommandGroup heading="Local branches">
                {localBranches.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                    No local branches
                  </p>
                ) : (
                  localBranches.map((branch) => (
                    <CommandItem
                      key={`local:${branch}`}
                      value={`local ${branch}`}
                      onSelect={() => void selectBranch(branch)}
                      title={branch}
                    >
                      <GitBranch className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      <span className="min-w-0 flex-1 truncate">
                        {formatBranchLabel(branch, 36)}
                      </span>
                      {branch === currentBranch && (
                        <span className="shrink-0 text-xs font-medium text-primary">
                          Current
                        </span>
                      )}
                    </CommandItem>
                  ))
                )}
              </CommandGroup>

              <CommandSeparator alwaysRender />

              <CommandGroup heading="Remote branches">
                {remoteBranches.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                    No remote branches
                  </p>
                ) : (
                  <>
                    {remoteBranches.map((branch) => (
                      <CommandItem
                        key={`remote:${branch}`}
                        value={`remote ${branch}`}
                        onSelect={() => void selectBranch(branch)}
                        title={branch}
                      >
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                          {formatBranchLabel(branch, 36)}
                        </span>
                        {branch === currentBranch && (
                          <span className="shrink-0 text-xs font-medium text-primary">
                            Current
                          </span>
                        )}
                      </CommandItem>
                    ))}
                    {remoteOnly.length > 0 && localBranches.length > 0 && (
                      <p className="px-2 pt-1 text-[10px] text-muted-foreground">
                        Remote-only branches create a local copy when selected.
                      </p>
                    )}
                  </>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create new branch</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="branch-name"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
            }}
            autoFocus
          />
          {createError && (
            <p className="text-xs text-destructive">{createError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button disabled={creating} onClick={() => void handleCreate()}>
              {creating ? "Creating…" : "Create branch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
