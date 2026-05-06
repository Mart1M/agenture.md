import { invoke } from "@tauri-apps/api/core";
import { GitGraph as GitGraphIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store";
import { formatGitCommitDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  defaultGraphConfig,
  GitGraphLayout,
} from "@/lib/git-graph/graph-layout";

const ROW_H = defaultGraphConfig().grid.y;
/** Extra SVG width so row bands and strokes are not clipped past the last commit column. */
const GRAPH_RIGHT_PAD = 14;
/** Minimum space reserved beside the graph so the commit list truncates inside the viewport when possible */
const COMMIT_COL_MIN_W = 280;

function branchColorForNode(n: { fill: string; stroke?: string }): string {
  if (n.stroke && (n.fill === "transparent" || n.fill === "none"))
    return n.stroke;
  return n.fill;
}

function branchTintRgba(branchHex: string, alpha: number): string {
  const x = branchHex.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(x)) return `rgba(128,128,128,${alpha})`;
  const r = parseInt(x.slice(0, 2), 16);
  const g = parseInt(x.slice(2, 4), 16);
  const b = parseInt(x.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export interface GitGraphCommitDto {
  id: string;
  parents: string[];
  subject: string;
  authorName: string;
  authorEmail: string;
  committedAt: string;
}

export interface GitGraphRefDto {
  tip: string;
  name: string;
  fullName: string;
}

export interface GitGraphSnapshotDto {
  commits: GitGraphCommitDto[];
  refs: GitGraphRefDto[];
  headId: string | null;
}

export function GitGraphView() {
  const repoPath = useAppStore((s) => s.repoPath);
  const [snapshot, setSnapshot] = useState<GitGraphSnapshotDto | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!repoPath) return;
    setBusy(true);
    setLoadErr(null);
    try {
      const data = await invoke<GitGraphSnapshotDto>("git_graph_snapshot", {
        repoPath,
      });
      setSnapshot(data);
      if (data.commits.length > 0) {
        setSelectedId(data.headId ?? data.commits[0].id);
      } else {
        setSelectedId(null);
      }
    } catch (e) {
      setSnapshot(null);
      setLoadErr(e instanceof Error ? e.message : String(e));
      setSelectedId(null);
    } finally {
      setBusy(false);
    }
  }, [repoPath]);

  useEffect(() => {
    void load();
  }, [load]);

  const refsByTip = useMemo(() => {
    const m = new Map<string, GitGraphRefDto[]>();
    if (!snapshot) return m;
    for (const r of snapshot.refs) {
      const list = m.get(r.tip) ?? [];
      list.push(r);
      m.set(r.tip, list);
    }
    return m;
  }, [snapshot]);

  const layout = useMemo(() => {
    const g = new GitGraphLayout(defaultGraphConfig());
    if (!snapshot || snapshot.commits.length === 0) {
      g.loadCommits([], null);
      return g;
    }
    g.loadCommits(
      snapshot.commits.map((c) => ({ hash: c.id, parents: c.parents })),
      snapshot.headId,
    );
    return g;
  }, [snapshot]);

  const branchLayers =
    snapshot && snapshot.commits.length > 0 ? layout.pathsForBranches(-1) : [];
  const nodes =
    snapshot && snapshot.commits.length > 0 ? layout.circles(-1) : [];

  const graphW = (() => {
    const fallback = Math.max(
      ROW_H + 40,
      defaultGraphConfig().grid.offsetX * 4,
    );
    if (!snapshot || snapshot.commits.length === 0) return fallback;
    const base = layout.getContentWidth();
    if (nodes.length === 0) return Math.max(base, fallback);
    const maxRight = Math.max(
      ...nodes.map((n) => n.cx + n.r + GRAPH_RIGHT_PAD),
    );
    return Math.max(base, maxRight, fallback);
  })();

  const graphH =
    snapshot && snapshot.commits.length > 0 ? layout.getHeight(-1) : 120;

  const nodeByRow = useMemo(() => {
    const m = new Map<number, (typeof nodes)[number]>();
    for (const n of nodes) m.set(n.row, n);
    return m;
  }, [nodes]);

  const selected = snapshot?.commits.find((c) => c.id === selectedId) ?? null;
  const currentBranch = useMemo(() => {
    if (!snapshot?.headId) return null;
    const localHeadRef = snapshot.refs.find(
      (ref) =>
        ref.tip === snapshot.headId && ref.fullName.startsWith("refs/heads/"),
    );
    return localHeadRef?.name ?? null;
  }, [snapshot]);

  if (!repoPath) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <GitGraphIcon className="size-4 text-muted-foreground" aria-hidden />
          <span>Git graph</span>
        </div>
        <Button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          variant="outline"
          size="sm"
        >
          Refresh
        </Button>
      </header>

      {busy && !snapshot && (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading history…
        </div>
      )}

      {loadErr && (
        <div className="m-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {loadErr}
        </div>
      )}

      {snapshot && snapshot.commits.length === 0 && !busy && (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
          No commits to display.
        </div>
      )}

      {snapshot && snapshot.commits.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:flex-row">
          <div className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain">
            <div
              className="flex"
              style={{
                minWidth: `max(100%, ${graphW + COMMIT_COL_MIN_W}px)`,
              }}
            >
              <div
                className="sticky left-0 z-[1] shrink-0 bg-background"
                style={{ width: graphW }}
              >
                <svg width={graphW} height={graphH} className="block shrink-0">
                  <g className="pointer-events-none" aria-hidden>
                    {snapshot.commits.map((c, row) => {
                      const n = nodeByRow.get(row);
                      if (!n) return null;
                      const rgb = branchColorForNode(n);
                      const y = n.cy - ROW_H / 2;
                      const isSel = selectedId === c.id;
                      return (
                        <rect
                          key={`graph-row-bg-${c.id}`}
                          x={0}
                          y={y}
                          width={graphW}
                          height={ROW_H}
                          fill={rgb}
                          opacity={isSel ? 0.16 : 0.1}
                        />
                      );
                    })}
                  </g>
                  {branchLayers.map((layer, bi) =>
                    layer.segments.map((d, si) => (
                      <path
                        key={`b-${bi}-s-${si}`}
                        d={d}
                        fill="none"
                        stroke={layer.colour}
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="opacity-92"
                      />
                    )),
                  )}
                  {nodes.map((n) => {
                    const c = snapshot.commits[n.row];
                    if (!c) return null;
                    return (
                      <g
                        key={n.hash}
                        role="button"
                        cursor="pointer"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(n.hash);
                        }}
                      >
                        <circle
                          cx={n.cx}
                          cy={n.cy}
                          r={n.r}
                          fill={n.fill}
                          stroke={n.stroke ?? "none"}
                          strokeWidth={n.stroke ? 2 : 0}
                        />
                        <title>{`${c.authorName}${c.authorEmail ? ` <${c.authorEmail}>` : ""}`}</title>
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div className="flex min-h-0 min-w-[240px] max-w-none flex-1 basis-64 flex-col divide-y divide-border bg-background">
                {snapshot.commits.map((c, row) => {
                  const tipRefs = refsByTip.get(c.id) ?? [];
                  const isSel = selectedId === c.id;
                  const isHeadRow = snapshot.headId === c.id;
                  const rowNode = nodeByRow.get(row);
                  const rowBg =
                    rowNode !== undefined
                      ? branchTintRgba(
                          branchColorForNode(rowNode),
                          isSel ? 0.13 : 0.08,
                        )
                      : undefined;
                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      style={{ height: ROW_H, backgroundColor: rowBg }}
                      className={cn(
                        "flex w-full max-w-full min-w-0 items-center gap-2 px-2 text-left text-sm transition-colors",
                        isSel && "ring-1 ring-inset ring-primary/35",
                      )}
                    >
                      <div className="flex shrink-0 flex-nowrap items-center gap-1">
                        {isHeadRow && currentBranch && (
                          <Badge
                            className="shrink-0 whitespace-nowrap font-mono text-[10px]"
                            title={`Current branch: ${currentBranch}`}
                          >
                            Current branch
                          </Badge>
                        )}
                        {tipRefs.slice(0, 6).map((r) => (
                          <Badge
                            key={`${r.fullName}-${r.tip}`}
                            variant="secondary"
                            className="shrink-0 whitespace-nowrap font-mono text-[10px]"
                            title={r.fullName}
                          >
                            {r.name}
                          </Badge>
                        ))}
                        {tipRefs.length > 6 && (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            +{tipRefs.length - 6}
                          </span>
                        )}
                      </div>
                      <span
                        className="min-w-0 flex-1 truncate font-medium"
                        title={c.subject || "(no message)"}
                      >
                        {c.subject || "(no message)"}
                      </span>
                      <span className="hidden min-w-0 max-w-[6.5rem] shrink-0 truncate text-xs text-muted-foreground sm:inline">
                        {c.authorName}
                      </span>
                      <span className="hidden w-14 shrink-0 truncate text-right font-mono text-[10px] text-muted-foreground lg:inline">
                        {c.id.slice(0, 7)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <aside
            className={cn(
              "flex h-52 min-h-0 w-full shrink-0 flex-col overflow-hidden border-border border-t bg-muted/20 px-4 py-4 text-sm",
              "sm:h-64",
              "xl:h-auto xl:w-72 xl:min-w-[18rem] xl:max-w-72 xl:shrink-0 xl:border-l xl:border-t-0",
            )}
          >
            <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
              {selected ? (
                <>
                  <div className="min-w-0 space-y-1 border-b pb-3">
                    <p className="break-words font-medium text-foreground">
                      {selected.subject || "(no message)"}
                    </p>
                  </div>
                  <dl className="mt-3 min-w-0 space-y-2 text-muted-foreground">
                    <div className="min-w-0">
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                        Author
                      </dt>
                      <dd className="min-w-0 break-words">
                        {selected.authorName}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                        Email
                      </dt>
                      <dd className="min-w-0 break-all">
                        {selected.authorEmail}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                        Date
                      </dt>
                      <dd className="min-w-0 break-words">
                        {formatGitCommitDate(selected.committedAt)}
                      </dd>
                    </div>
                  </dl>
                  {(refsByTip.get(selected.id) ?? []).length > 0 && (
                    <div className="mt-4 min-w-0 border-t pt-4">
                      <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                        References
                      </p>
                      <ul className="flex min-w-0 flex-col gap-2">
                        {(refsByTip.get(selected.id) ?? []).map((r) => (
                          <li key={r.fullName} className="min-w-0">
                            <span className="break-words font-mono text-xs">
                              {r.name}
                            </span>
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              {r.fullName.startsWith("refs/remotes/")
                                ? "remote"
                                : "local"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">
                  Select a commit in the list.
                </p>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
