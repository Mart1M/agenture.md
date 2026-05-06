/**
 * Lane / branch layout for SVG git graphs.
 * Derived from mhutchie/vscode-git-graph (MIT) — simplified to layout + SVG path output only.
 */
export const GRAPH_DEFAULT_COLOURS = [
  "#22d3ee",
  "#60a5fa",
  "#a78bfa",
  "#f472b6",
  "#fb923c",
  "#facc15",
  "#4ade80",
  "#2dd4bf",
  "#e879f9",
  "#f87171",
] as const;

export const enum GraphStyle {
  Angular = 0,
  Rounded = 1,
}

export interface GraphGrid {
  readonly x: number;
  readonly y: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly expandY: number;
}

export interface GraphConfig {
  readonly style: GraphStyle;
  readonly colours: readonly string[];
  readonly grid: GraphGrid;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Line {
  readonly p1: Point;
  readonly p2: Point;
  readonly lockedFirst: boolean;
}

interface Pixel {
  x: number;
  y: number;
}

interface PlacedLine {
  readonly p1: Pixel;
  readonly p2: Pixel;
  readonly isCommitted: boolean;
  readonly lockedFirst: boolean;
}

interface UnavailablePoint {
  readonly connectsTo: Vertex | null;
  readonly onBranch: Branch;
}

type VertexOrNull = Vertex | null;

const NULL_VERTEX_ID = -1;

class Branch {
  private readonly colour: number;
  private lines: Line[] = [];
  private numUncommitted = 0;

  constructor(colour: number) {
    this.colour = colour;
  }

  addLine(p1: Point, p2: Point, isCommitted: boolean, lockedFirst: boolean) {
    this.lines.push({ p1, p2, lockedFirst });
    if (isCommitted) {
      if (p2.x === 0 && p2.y < this.numUncommitted) this.numUncommitted = p2.y;
    } else {
      this.numUncommitted++;
    }
  }

  getColour() {
    return this.colour;
  }

  buildPaths(config: GraphConfig, expandAt: number): string[] {
    const paths: string[] = [];
    const dFrac = config.grid.y * (config.style === GraphStyle.Angular ? 0.38 : 0.8);
    const lines = this.flattenLines(config, expandAt);

    let curPath = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let x1 = line.p1.x;
      let y1 = line.p1.y;
      let x2 = line.p2.x;
      let y2 = line.p2.y;

      if (curPath !== "" && i > 0 && line.isCommitted !== lines[i - 1].isCommitted) {
        paths.push(curPath);
        curPath = "";
      }

      if (curPath === "" || (i > 0 && (x1 !== lines[i - 1].p2.x || y1 !== lines[i - 1].p2.y))) {
        curPath += `M${x1.toFixed(0)},${y1.toFixed(1)}`;
      }

      if (x1 === x2) {
        curPath += `L${x2.toFixed(0)},${y2.toFixed(1)}`;
      } else if (config.style === GraphStyle.Angular) {
        curPath +=
          `L${(line.lockedFirst ? x2 : x1).toFixed(0)},${(line.lockedFirst ? y2 - dFrac : y1 + dFrac).toFixed(1)}` +
          `L${x2.toFixed(0)},${y2.toFixed(1)}`;
      } else {
        curPath += `C${x1.toFixed(0)},${(y1 + dFrac).toFixed(1)} ${x2.toFixed(0)},${(y2 - dFrac).toFixed(1)} ${x2.toFixed(0)},${y2.toFixed(1)}`;
      }
    }

    if (curPath !== "") {
      paths.push(curPath);
    }
    return paths;
  }

  private flattenLines(config: GraphConfig, expandAt: number): PlacedLine[] {
    const out: PlacedLine[] = [];
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      let x1 = line.p1.x * config.grid.x + config.grid.offsetX;
      let y1 = line.p1.y * config.grid.y + config.grid.offsetY;
      let x2 = line.p2.x * config.grid.x + config.grid.offsetX;
      let y2 = line.p2.y * config.grid.y + config.grid.offsetY;

      if (expandAt > -1) {
        if (line.p1.y > expandAt) {
          y1 += config.grid.expandY;
          y2 += config.grid.expandY;
        } else if (line.p2.y > expandAt) {
          if (x1 === x2) {
            y2 += config.grid.expandY;
          } else if (line.lockedFirst) {
            out.push({ p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, isCommitted: i >= this.numUncommitted, lockedFirst: line.lockedFirst });
            out.push({
              p1: { x: x2, y: y1 + config.grid.y },
              p2: { x: x2, y: y2 + config.grid.expandY },
              isCommitted: i >= this.numUncommitted,
              lockedFirst: line.lockedFirst,
            });
            continue;
          } else {
            out.push({
              p1: { x: x1, y: y1 },
              p2: { x: x1, y: y2 - config.grid.y + config.grid.expandY },
              isCommitted: i >= this.numUncommitted,
              lockedFirst: line.lockedFirst,
            });
            y1 += config.grid.expandY;
            y2 += config.grid.expandY;
          }
        }
      }
      out.push({ p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, isCommitted: i >= this.numUncommitted, lockedFirst: line.lockedFirst });
    }

    let i = 0;
    while (i < out.length - 1) {
      const line = out[i];
      const nextLine = out[i + 1];
      if (
        line.p1.x === line.p2.x &&
        line.p2.x === nextLine.p1.x &&
        nextLine.p1.x === nextLine.p2.x &&
        line.p2.y === nextLine.p1.y &&
        line.isCommitted === nextLine.isCommitted
      ) {
        line.p2.y = nextLine.p2.y;
        out.splice(i + 1, 1);
      } else {
        i++;
      }
    }
    return out;
  }
}

class Vertex {
  public readonly id: number;
  public readonly isStash: boolean;

  private x = 0;
  private children: Vertex[] = [];
  private parents: Vertex[] = [];
  private nextParent = 0;
  private onBranch: Branch | null = null;
  private isCommitted = true;
  private isCurrent = false;
  private nextX = 0;
  private connections: (UnavailablePoint | undefined)[] = [];

  constructor(id: number, isStash: boolean) {
    this.id = id;
    this.isStash = isStash;
  }

  addChild(vertex: Vertex) {
    this.children.push(vertex);
  }

  addParent(vertex: Vertex) {
    this.parents.push(vertex);
  }

  getNextParent(): Vertex | null {
    if (this.nextParent < this.parents.length) return this.parents[this.nextParent];
    return null;
  }

  registerParentProcessed() {
    this.nextParent++;
  }

  isMerge() {
    return this.parents.length > 1;
  }

  addToBranch(branch: Branch, x: number) {
    if (this.onBranch === null) {
      this.onBranch = branch;
      this.x = x;
    }
  }

  isNotOnBranch() {
    return this.onBranch === null;
  }

  isOnThisBranch(branch: Branch) {
    return this.onBranch === branch;
  }

  getBranch() {
    return this.onBranch;
  }

  getPoint(): Point {
    return { x: this.x, y: this.id };
  }

  getNextPoint(): Point {
    return { x: this.nextX, y: this.id };
  }

  getPointConnectingTo(vertex: VertexOrNull, onBranch: Branch): Point | null {
    for (let i = 0; i < this.connections.length; i++) {
      const c = this.connections[i];
      if (c && c.connectsTo === vertex && c.onBranch === onBranch) {
        return { x: i, y: this.id };
      }
    }
    return null;
  }

  registerUnavailablePoint(x: number, connectsToVertex: VertexOrNull, onBranch: Branch) {
    if (x === this.nextX) {
      this.nextX = x + 1;
      this.connections[x] = { connectsTo: connectsToVertex, onBranch };
    }
  }

  getColour() {
    return this.onBranch !== null ? this.onBranch.getColour() : 0;
  }

  getIsCommitted() {
    return this.isCommitted;
  }

  setCurrent() {
    this.isCurrent = true;
  }

  circleProps(config: GraphConfig, expandAt: number): { cx: number; cy: number; r: number; fill: string; stroke?: string } | null {
    if (this.onBranch === null) return null;
    const colour = config.colours[this.onBranch.getColour() % config.colours.length];
    let cy = this.id * config.grid.y + config.grid.offsetY;
    if (expandAt > -1 && this.id > expandAt) cy += config.grid.expandY;
    const cx = this.x * config.grid.x + config.grid.offsetX;
    if (this.isCurrent) {
      return { cx, cy, r: 4, fill: "transparent", stroke: colour };
    }
    return { cx, cy, r: 4, fill: colour };
  }
}

export interface CommitGraphRow {
  readonly hash: string;
  readonly parents: readonly string[];
}

export interface GitGraphNodeCircle {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  stroke?: string;
  hash: string;
  row: number;
}

export class GitGraphLayout {
  private readonly config: GraphConfig;
  private vertices: Vertex[] = [];
  private branches: Branch[] = [];
  private availableColours: number[] = [];
  private commits: CommitGraphRow[] = [];
  private commitLookup: Record<string, number> = {};

  constructor(config: GraphConfig) {
    this.config = config;
  }

  loadCommits(commits: readonly CommitGraphRow[], commitHead: string | null) {
    const rows = commits.map((c) => ({
      hash: c.hash,
      parents: [...c.parents],
    }));
    this.commits = rows;
    this.commitLookup = {};
    rows.forEach((c, i) => {
      this.commitLookup[c.hash] = i;
    });

    this.vertices = [];
    this.branches = [];
    this.availableColours = [];
    if (rows.length === 0) return;

    const nullVertex = new Vertex(NULL_VERTEX_ID, false);
    for (let i = 0; i < rows.length; i++) {
      this.vertices.push(new Vertex(i, false));
    }
    for (let i = 0; i < rows.length; i++) {
      const parents = rows[i].parents;
      for (let j = 0; j < parents.length; j++) {
        const parentHash = parents[j];
        const pIx = this.commitLookup[parentHash];
        if (typeof pIx === "number") {
          this.vertices[i].addParent(this.vertices[pIx]);
          this.vertices[pIx].addChild(this.vertices[i]);
        } else {
          this.vertices[i].addParent(nullVertex);
        }
      }
    }

    if (commitHead !== null && typeof this.commitLookup[commitHead] === "number") {
      this.vertices[this.commitLookup[commitHead]].setCurrent();
    }

    let i = 0;
    while (i < this.vertices.length) {
      if (this.vertices[i].getNextParent() !== null || this.vertices[i].isNotOnBranch()) {
        this.determinePath(i);
      } else {
        i++;
      }
    }
  }

  getContentWidth(): number {
    const { offsetX, x: gx } = this.config.grid;
    let maxCol = 1;
    for (let i = 0; i < this.vertices.length; i++) {
      maxCol = Math.max(maxCol, this.vertices[i].getNextPoint().x);
      if (!this.vertices[i].isNotOnBranch()) {
        maxCol = Math.max(maxCol, this.vertices[i].getPoint().x + 3);
      }
    }
    return Math.ceil(2 * offsetX + Math.max(0, maxCol - 1) * gx);
  }

  getHeight(expandedRow: number): number {
    return (
      this.vertices.length * this.config.grid.y +
      this.config.grid.offsetY -
      this.config.grid.y / 2 +
      (expandedRow > -1 ? this.config.grid.expandY : 0)
    );
  }

  pathsForBranches(expandedRow = -1): { colour: string; segments: string[] }[] {
    return this.branches.map((b) => ({
      colour: this.config.colours[b.getColour() % this.config.colours.length],
      segments: b.buildPaths(this.config, expandedRow),
    }));
  }

  circles(expandedRow = -1): GitGraphNodeCircle[] {
    const out: GitGraphNodeCircle[] = [];
    for (let i = 0; i < this.vertices.length; i++) {
      const props = this.vertices[i].circleProps(this.config, expandedRow);
      if (props) {
        out.push({ ...props, hash: this.commits[i].hash, row: i });
      }
    }
    return out;
  }

  private determinePath(startAt: number) {
    let i = startAt;
    let vertex = this.vertices[i];
    let parentVertex = this.vertices[i].getNextParent();
    let lastPoint = vertex.isNotOnBranch() ? vertex.getNextPoint() : vertex.getPoint();
    let curVertex: Vertex;

    if (
      parentVertex !== null &&
      parentVertex.id !== NULL_VERTEX_ID &&
      vertex.isMerge() &&
      !vertex.isNotOnBranch() &&
      !parentVertex.isNotOnBranch()
    ) {
      const parentBranch = parentVertex.getBranch()!;
      let foundPointToParent = false;
      for (i = startAt + 1; i < this.vertices.length; i++) {
        curVertex = this.vertices[i];
        let curPoint = curVertex.getPointConnectingTo(parentVertex, parentBranch);
        if (curPoint !== null) {
          foundPointToParent = true;
        } else {
          curPoint = curVertex.getNextPoint();
        }
        parentBranch.addLine(
          lastPoint,
          curPoint,
          vertex.getIsCommitted(),
          !foundPointToParent && curVertex !== parentVertex ? lastPoint.x < curPoint.x : true,
        );
        curVertex.registerUnavailablePoint(curPoint.x, parentVertex, parentBranch);
        lastPoint = curPoint;

        if (foundPointToParent) {
          vertex.registerParentProcessed();
          break;
        }
      }
    } else {
      const branch = new Branch(this.getAvailableColour(startAt));
      vertex.addToBranch(branch, lastPoint.x);
      vertex.registerUnavailablePoint(lastPoint.x, vertex, branch);
      for (i = startAt + 1; i < this.vertices.length; i++) {
        curVertex = this.vertices[i];
        const curPoint =
          parentVertex === curVertex && !parentVertex.isNotOnBranch() ? curVertex.getPoint() : curVertex.getNextPoint();
        branch.addLine(lastPoint, curPoint, vertex.getIsCommitted(), lastPoint.x < curPoint.x);
        curVertex.registerUnavailablePoint(curPoint.x, parentVertex, branch);
        lastPoint = curPoint;

        if (parentVertex === curVertex) {
          vertex.registerParentProcessed();
          const parentVertexOnBranch = !parentVertex.isNotOnBranch();
          parentVertex.addToBranch(branch, curPoint.x);
          vertex = parentVertex;
          parentVertex = vertex.getNextParent();
          if (parentVertex === null || parentVertexOnBranch) {
            break;
          }
        }
      }
      if (i === this.vertices.length && parentVertex !== null && parentVertex.id === NULL_VERTEX_ID) {
        vertex.registerParentProcessed();
      }
      this.branches.push(branch);
      this.availableColours[branch.getColour()] = i;
    }
  }

  private getAvailableColour(startAt: number) {
    for (let i = 0; i < this.availableColours.length; i++) {
      if (startAt > this.availableColours[i]) {
        return i;
      }
    }
    this.availableColours.push(0);
    return this.availableColours.length - 1;
  }
}

export function defaultGraphConfig(): GraphConfig {
  return {
    style: GraphStyle.Rounded,
    colours: GRAPH_DEFAULT_COLOURS,
    grid: {
      x: 16,
      y: 28,
      offsetX: 10,
      offsetY: 14,
      expandY: 120,
    },
  };
}
