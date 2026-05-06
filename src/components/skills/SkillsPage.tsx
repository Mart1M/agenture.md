import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import {
  Search,
  Download,
  CheckCircle2,
  Brain,
  ExternalLink,
} from "lucide-react";
import { useAppStore } from "@/store";
import { formatName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { showToast } from "@/components/common/Toaster";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CommandOutput, RepoScanResult, SkillSearchResult } from "@/types";

const INSTALL_TARGETS = [
  { id: "universal", label: "Generic agent", description: ".agents/skills/" },
  { id: "claude-code", label: "Claude Code", description: ".claude/skills/" },
  { id: "cursor", label: "Cursor", description: ".cursor/skills/" },
  { id: "codex", label: "Codex", description: ".codex/skills/" },
  { id: "gemini-cli", label: "Gemini CLI", description: ".gemini/skills/" },
  { id: "opencode", label: "OpenCode", description: ".opencode/skills/" },
];

type SkillsLock = {
  skills?: Record<
    string,
    {
      source?: string;
      skillPath?: string;
    }
  >;
};

// ── ANSI stripping ──────────────────────────────────────────────────────────
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

// ── CLI output parser ───────────────────────────────────────────────────────
function parseSkillsOutput(stdout: string): SkillSearchResult[] {
  const results: SkillSearchResult[] = [];
  const lines = stdout
    .split("\n")
    .map(stripAnsi)
    .filter((l) => l.trim());

  for (const line of lines) {
    const match = line.match(/^([^/\s]+)\/([^@\s]+)@(\S+)\s*(.*)/);
    if (match) {
      const [, owner, repo, name, description] = match;
      results.push({
        name,
        description: description?.trim() ?? "",
        owner,
        repo,
        skill_id: `${owner}/${repo}@${name}`,
        install_command: `npx skills add ${owner}/${repo}@${name}`,
      });
    }
  }

  if (results.length === 0) {
    for (const line of lines) {
      const t = line.trim();
      if (
        t &&
        !t.toLowerCase().startsWith("searching") &&
        !t.toLowerCase().startsWith("no ")
      ) {
        results.push({
          name: t,
          description: "",
          owner: "",
          repo: "",
          skill_id: t,
          install_command: `npx skills add ${t}`,
        });
      }
    }
  }
  return results;
}

function getSkillLockIds(lockContent: string): Set<string> {
  const ids = new Set<string>();
  const lock = JSON.parse(lockContent) as SkillsLock;

  for (const [name, skill] of Object.entries(lock.skills ?? {})) {
    if (skill.source) {
      ids.add(`${skill.source}@${name}`);
    }

    const pathParts = skill.skillPath?.split("/") ?? [];
    const pathSkillName = pathParts[pathParts.length - 2];
    if (skill.source && pathSkillName) {
      ids.add(`${skill.source}@${pathSkillName}`);
    }
  }

  return ids;
}

// ── Component ───────────────────────────────────────────────────────────────
export function SkillsPage() {
  const {
    repoPath,
    skillQuery,
    skillResults,
    isSearchingSkills,
    setSkillQuery,
    setSkillResults,
    setIsSearchingSkills,
    setScanResult,
  } = useAppStore();

  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [selectedSkill, setSelectedSkill] = useState<SkillSearchResult | null>(
    null,
  );
  const [installTargetSkill, setInstallTargetSkill] =
    useState<SkillSearchResult | null>(null);
  const [selectedInstallTargets, setSelectedInstallTargets] = useState<
    string[]
  >([INSTALL_TARGETS[0].id]);
  const [installError, setInstallError] = useState<string | null>(null);
  /** Once true: top search bar layout; landing uses centered hero. */
  const [committedSearch, setCommittedSearch] = useState(false);
  const [draftQuery, setDraftQuery] = useState(() => skillQuery);

  async function refreshInstalledSkills() {
    if (!repoPath) {
      setInstalledIds(new Set());
      return;
    }

    try {
      const lockContent = await invoke<string>("read_file", {
        filePath: `${repoPath}/skills-lock.json`,
        repoPath,
      });
      setInstalledIds(getSkillLockIds(lockContent));
    } catch {
      setInstalledIds(new Set());
    }
  }

  useEffect(() => {
    void refreshInstalledSkills();
  }, [repoPath]);

  async function performSearch() {
    const query = draftQuery.trim();
    if (!query || !repoPath) return;

    setCommittedSearch(true);
    setSkillQuery(query);
    setSkillResults([]);
    setIsSearchingSkills(true);
    try {
      const result = await invoke<CommandOutput>("run_cli_command", {
        command: "npx",
        args: ["skills", "find", query],
        cwd: repoPath,
      });
      setSkillResults(parseSkillsOutput(result.stdout));
    } catch {
      setSkillResults([]);
    } finally {
      setIsSearchingSkills(false);
    }
  }

  function openDetail(skill: SkillSearchResult) {
    setSelectedSkill(skill);
    setInstallError(null);
  }

  function openInstallDialog(skill: SkillSearchResult) {
    setInstallTargetSkill(skill);
    setInstallError(null);
  }

  function toggleInstallTarget(targetId: string) {
    setSelectedInstallTargets((prev) =>
      prev.includes(targetId)
        ? prev.filter((id) => id !== targetId)
        : [...prev, targetId],
    );
  }

  async function install(skill: SkillSearchResult, agents: string[]) {
    if (!repoPath) return;
    if (agents.length === 0) {
      setInstallError("Select at least one install target.");
      return;
    }
    setInstallingId(skill.skill_id);
    setInstallError(null);
    try {
      const source =
        skill.owner && skill.repo
          ? `${skill.owner}/${skill.repo}`
          : skill.skill_id;
      const args =
        skill.owner && skill.repo
          ? [
              "--yes",
              "skills@latest",
              "add",
              source,
              "--skill",
              skill.name,
              "--agent",
              ...agents,
              "--yes",
            ]
          : [
              "--yes",
              "skills@latest",
              "add",
              source,
              "--agent",
              ...agents,
              "--yes",
            ];
      const result = await invoke<CommandOutput>("run_cli_command", {
        command: "npx",
        args,
        cwd: repoPath,
      });
      if (result.exit_code === 0) {
        const scan = await invoke<RepoScanResult>("scan_repository", {
          repoPath,
        });
        setScanResult(scan);
        await refreshInstalledSkills();
        setInstalledIds((prev) => new Set([...prev, skill.skill_id]));
        setInstallTargetSkill(null);
        showToast({
          title: "Skill installed",
          description: `${formatName(skill.name)} installed for ${INSTALL_TARGETS.filter((target) => agents.includes(target.id)).map((target) => target.label).join(", ")}.`,
        });
      } else {
        setInstallError(
          result.stderr ||
            result.stdout ||
            `Command exited with code ${result.exit_code}`,
        );
      }
    } catch (e) {
      setInstallError(String(e));
    } finally {
      setInstallingId(null);
    }
  }

  function isSkillInstalled(skill: SkillSearchResult) {
    if (!skill.owner || !skill.repo) return installedIds.has(skill.skill_id);

    return installedIds.has(`${skill.owner}/${skill.repo}@${skill.name}`);
  }

  const isInstalled = selectedSkill
    ? isSkillInstalled(selectedSkill)
    : false;
  const isInstalling = selectedSkill
    ? installingId === selectedSkill.skill_id
    : false;

  const registryBlurb = (
    <p
      className={cn(
        "max-w-xl text-xs text-muted-foreground",
        committedSearch ? "text-left" : "text-center",
      )}
    >
      Search and install skills from{" "}
      <a
        href="https://skills.sh"
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2 hover:text-foreground transition-colors"
      >
        skills.sh
      </a>{" "}
      into your repository.
    </p>
  );

  const searchControls = (
    <div className="flex w-full max-w-xl flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="skills-query"
          value={draftQuery}
          onChange={(e) => setDraftQuery(e.target.value)}
          placeholder="Search skills…"
          className="pl-9"
          disabled={isSearchingSkills}
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void performSearch();
            }
          }}
        />
      </div>
      <Button
        type="button"
        onClick={() => void performSearch()}
        disabled={
          !draftQuery.trim() || !repoPath || isSearchingSkills
        }
        className="sm:shrink-0"
      >
        {isSearchingSkills ? (
          <LoadingSpinner size="sm" />
        ) : (
          <>
            <Search className="mr-1.5 size-4" aria-hidden />
            Search
          </>
        )}
      </Button>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      {!committedSearch ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12">
          <div className="flex max-w-lg flex-col items-center gap-3 text-center">
            <Brain className="size-12 text-muted-foreground" aria-hidden />
            <h2 className="text-xl font-semibold tracking-tight">
              Skills Registry
            </h2>
            {registryBlurb}
          </div>
          {searchControls}
        </div>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-3 px-6 py-5">
            <Brain className="size-5 shrink-0 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-semibold">Skills Registry</h2>
              {registryBlurb}
            </div>
          </div>

          <div className="shrink-0 border-b px-6 pb-4">
            {searchControls}
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
        {isSearchingSkills && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}
        {!isSearchingSkills &&
          !!skillQuery &&
          skillResults.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">
            No skills found for "{skillQuery}"
          </p>
        )}
        {!isSearchingSkills && skillResults.length > 0 && (
          <div className="space-y-2">
            {skillResults.map((skill) => {
              const installed = isSkillInstalled(skill);
              const installing = installingId === skill.skill_id;
              return (
                <div
                  key={skill.skill_id}
                  onClick={() => openDetail(skill)}
                  className="flex items-start justify-between gap-3 rounded-lg border p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Brain className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {formatName(skill.name)}
                      </span>
                      {skill.owner && (
                        <Badge
                          variant="outline"
                          className="text-xs font-normal"
                        >
                          {skill.owner}/{skill.repo}
                        </Badge>
                      )}
                    </div>
                    {skill.description && (
                      <p className="text-xs text-muted-foreground mt-1 ml-5">
                        {skill.description}
                      </p>
                    )}
                  </div>
                  <div
                    className="shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {installed ? (
                      <Button size="sm" variant="secondary" disabled>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        Installed
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openInstallDialog(skill)}
                        disabled={installing}
                      >
                        {installing ? (
                          <LoadingSpinner size="sm" />
                        ) : (
                          <>
                            <Download className="h-3.5 w-3.5 mr-1" />
                            Install
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
          </div>
        </>
      )}

      {/* Detail dialog */}
      <Dialog
        open={!!selectedSkill}
        onOpenChange={(open) => !open && setSelectedSkill(null)}
      >
        {selectedSkill && (
          <DialogContent className="max-w-xl max-h-[80vh] flex flex-col gap-0 p-0">
            {/* Dialog header */}
            <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b">
              <DialogTitle className="flex items-center gap-2">
                <Brain className="h-4 w-4 shrink-0" />
                {formatName(selectedSkill.name)}
              </DialogTitle>
              {selectedSkill.owner && (
                <div className="flex flex-col items-start gap-2 pt-1">
                  <Badge variant="outline" className="text-xs font-normal">
                    {selectedSkill.owner}/{selectedSkill.repo}
                  </Badge>
                  <div className="flex items-center gap-3">
                    <a
                      href={`https://skills.sh/${selectedSkill.owner}/${selectedSkill.repo}/${selectedSkill.name}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      skills.sh
                    </a>
                    <a
                      href={`https://github.com/${selectedSkill.owner}/${selectedSkill.repo}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      GitHub
                    </a>
                  </div>
                </div>
              )}
            </DialogHeader>

            <div className="space-y-3 px-6 py-4 shrink-0 border-t">
              {installError && (
                <p className="text-xs text-destructive whitespace-pre-wrap">
                  {installError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedSkill(null)}
                >
                  Close
                </Button>
                {isInstalled ? (
                  <Button size="sm" disabled>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    Installed
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => openInstallDialog(selectedSkill)}
                    disabled={isInstalling}
                  >
                    {isInstalling ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      <>
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        Install
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={!!installTargetSkill}
        onOpenChange={(open) => !open && setInstallTargetSkill(null)}
      >
        {installTargetSkill && (
          <DialogContent className="max-w-md gap-0 p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b">
              <DialogTitle className="flex items-center gap-2">
                <Download className="h-4 w-4 shrink-0" />
                Install {formatName(installTargetSkill.name)}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Choose one or more places to install this skill in the opened
                codebase.
              </p>
            </DialogHeader>

            <div className="px-6 py-4 space-y-2">
              {INSTALL_TARGETS.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => toggleInstallTarget(target.id)}
                  className={[
                    "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition-colors",
                    selectedInstallTargets.includes(target.id)
                      ? "border-foreground bg-accent"
                      : "hover:bg-accent/50",
                  ].join(" ")}
                >
                  <span>
                    <span className="block text-sm font-medium">
                      {target.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {target.description}
                    </span>
                  </span>
                  {selectedInstallTargets.includes(target.id) && (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                </button>
              ))}
            </div>

            <div className="space-y-3 px-6 py-4 shrink-0 border-t">
              {installError && (
                <p className="text-xs text-destructive whitespace-pre-wrap">
                  {installError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInstallTargetSkill(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    install(installTargetSkill, selectedInstallTargets)
                  }
                  disabled={
                    installingId === installTargetSkill.skill_id ||
                    selectedInstallTargets.length === 0
                  }
                >
                  {installingId === installTargetSkill.skill_id ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Install
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

    </div>
  );
}
