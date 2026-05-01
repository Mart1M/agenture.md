import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import {
  Plug,
  Plus,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronRight,
  Terminal,
  Globe,
} from "lucide-react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type McpServerType = "stdio" | "http";

interface McpServerStdio {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface McpServerRemote {
  type: "sse" | "http";
  url: string;
  headers?: Record<string, string>;
}

type McpServer = McpServerStdio | McpServerRemote;

interface McpConfig {
  mcpServers: Record<string, McpServer>;
}

const EMPTY_CONFIG: McpConfig = { mcpServers: {} };

// ── Installed server card ──────────────────────────────────────────────────────

function ServerCard({
  name,
  server,
  onEdit,
  onDelete,
}: {
  name: string;
  server: McpServer;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const remote = isRemote(server);
  const extras = remote ? server.headers : server.env;
  const hasExtras = extras && Object.keys(extras).length > 0;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold truncate">{name}</p>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
              {remote ? "HTTP" : "stdio"}
            </Badge>
            {hasExtras && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                {Object.keys(extras!).length} {remote ? "headers" : "env"}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {remote ? (
              <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
            ) : (
              <Terminal className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            <code className="text-xs text-muted-foreground truncate font-mono">
              {remote ? (
                server.url
              ) : (
                <>
                  {server.command}
                  {server.args && server.args.length > 0 && (
                    <span className="text-muted-foreground/60"> {server.args.join(" ")}</span>
                  )}
                </>
              )}
            </code>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 sm:self-center">
          {hasExtras && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-xs"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Details
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </div>
      {expanded && hasExtras && (
        <div className="border-t px-4 py-2 bg-muted/30">
          {Object.entries(extras!).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 py-0.5">
              <code className="text-xs font-mono text-foreground">{k}</code>
              <span className="text-muted-foreground text-xs">=</span>
              <code className="text-xs font-mono text-muted-foreground truncate">{v}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseKvText(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    result[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return result;
}

function stringifyKv(record?: Record<string, string>) {
  return Object.entries(record ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

function isRemote(server: McpServer): server is McpServerRemote {
  return "url" in server;
}

function getServerType(server?: McpServer | null): McpServerType {
  return server && isRemote(server) ? "http" : "stdio";
}

// ── Field group ───────────────────────────────────────────────────────────────

function FieldGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <Label>
        {label}{" "}
        {hint && <span className="text-muted-foreground font-normal">{hint}</span>}
      </Label>
      {children}
    </div>
  );
}

// ── Add / Edit dialog ──────────────────────────────────────────────────────────

function AddServerDialog({
  open,
  onOpenChange,
  onAdd,
  initialName = "",
  initialServer = null,
  title = "Add MCP Server",
  description = "Configure a new Model Context Protocol server for this project.",
  submitLabel = "Add server",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (name: string, server: McpServer) => void;
  initialName?: string;
  initialServer?: McpServer | null;
  title?: string;
  description?: string;
  submitLabel?: string;
}) {
  const [tab, setTab] = useState<McpServerType>(getServerType(initialServer));
  const [name, setName] = useState(initialName);
  const [command, setCommand] = useState(
    initialServer && !isRemote(initialServer) ? initialServer.command : "",
  );
  const [args, setArgs] = useState(
    initialServer && !isRemote(initialServer) ? (initialServer.args?.join("\n") ?? "") : "",
  );
  const [envText, setEnvText] = useState(
    initialServer && !isRemote(initialServer) ? stringifyKv(initialServer.env) : "",
  );
  const [url, setUrl] = useState(
    initialServer && isRemote(initialServer) ? initialServer.url : "",
  );
  const [headersText, setHeadersText] = useState(
    initialServer && isRemote(initialServer) ? stringifyKv(initialServer.headers) : "",
  );

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    if (!initialServer) {
      setTab("stdio"); setCommand(""); setArgs(""); setEnvText(""); setUrl(""); setHeadersText("");
      return;
    }
    if (isRemote(initialServer)) {
      setTab("http"); setCommand(""); setArgs(""); setEnvText("");
      setUrl(initialServer.url); setHeadersText(stringifyKv(initialServer.headers));
    } else {
      setTab("stdio");
      setCommand(initialServer.command);
      setArgs(initialServer.args?.join("\n") ?? "");
      setEnvText(stringifyKv(initialServer.env));
      setUrl(""); setHeadersText("");
    }
  }, [initialName, initialServer, open]);

  function reset() {
    setTab("stdio"); setName(""); setCommand(""); setArgs("");
    setEnvText(""); setUrl(""); setHeadersText("");
  }

  const isValid = name.trim() && (tab === "stdio" ? command.trim() : url.trim());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    let server: McpServer;
    if (tab === "stdio") {
      const parsedArgs = args.split("\n").map((l) => l.trim()).filter(Boolean);
      const parsedEnv = parseKvText(envText);
      server = {
        command: command.trim(),
        ...(parsedArgs.length > 0 && { args: parsedArgs }),
        ...(Object.keys(parsedEnv).length > 0 && { env: parsedEnv }),
      };
    } else {
      const parsedHeaders = parseKvText(headersText);
      server = {
        type: "http",
        url: url.trim(),
        ...(Object.keys(parsedHeaders).length > 0 && { headers: parsedHeaders }),
      };
    }
    onAdd(name.trim(), server);
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="h-4 w-4" /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <FieldGroup label="Server name">
            <Input
              placeholder="e.g. filesystem"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </FieldGroup>

          <Tabs value={tab} onValueChange={(v) => setTab(v as McpServerType)}>
            <TabsList className="w-full">
              <TabsTrigger value="stdio" className="flex-1 text-xs">
                <Terminal className="h-3 w-3 mr-1.5" /> stdio
              </TabsTrigger>
              <TabsTrigger value="http" className="flex-1 text-xs">
                <Globe className="h-3 w-3 mr-1.5" /> HTTP
              </TabsTrigger>
            </TabsList>

            <TabsContent value="stdio" style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
              <FieldGroup label="Command">
                <Input placeholder="npx" value={command} onChange={(e) => setCommand(e.target.value)} className="font-mono text-sm" />
              </FieldGroup>
              <FieldGroup label="Arguments" hint="(one per line)">
                <Textarea
                  placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/path/to/dir"}
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  className="font-mono text-xs resize-none"
                  style={{ minHeight: "100px" }}
                />
              </FieldGroup>
              <FieldGroup label="Environment variables" hint="(KEY=value, one per line)">
                <Textarea
                  placeholder="API_KEY=your-key"
                  value={envText}
                  onChange={(e) => setEnvText(e.target.value)}
                  className="font-mono text-xs resize-none"
                  style={{ minHeight: "72px" }}
                />
              </FieldGroup>
            </TabsContent>

            <TabsContent value="http" style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
              <FieldGroup label="URL">
                <Input placeholder="https://example.com/mcp" value={url} onChange={(e) => setUrl(e.target.value)} className="font-mono text-sm" />
              </FieldGroup>
              <FieldGroup label="Headers" hint="(KEY=value, one per line)">
                <Textarea
                  placeholder="Authorization=Bearer token"
                  value={headersText}
                  onChange={(e) => setHeadersText(e.target.value)}
                  className="font-mono text-xs resize-none"
                  style={{ minHeight: "90px" }}
                />
              </FieldGroup>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!isValid}>{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function MCPView() {
  const { repoPath } = useAppStore();

  const [config, setConfig] = useState<McpConfig>(EMPTY_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<{ name: string; server: McpServer } | null>(null);

  const mcpPath = repoPath ? `${repoPath}/.mcp.json` : null;

  useEffect(() => {
    if (!mcpPath || !repoPath) return;
    setIsLoading(true);
    invoke<string>("read_file", { filePath: mcpPath, repoPath })
      .then((content) => {
        try {
          const parsed = JSON.parse(content) as McpConfig;
          setConfig({ mcpServers: parsed.mcpServers ?? {} });
        } catch {
          setConfig(EMPTY_CONFIG);
        }
      })
      .catch(() => setConfig(EMPTY_CONFIG))
      .finally(() => setIsLoading(false));
  }, [mcpPath, repoPath]);

  async function save(next: McpConfig) {
    if (!mcpPath || !repoPath) return;
    setIsSaving(true);
    try {
      await invoke("write_file", {
        filePath: mcpPath,
        content: JSON.stringify(next, null, 2),
        repoPath,
      });
      setConfig(next);
    } finally {
      setIsSaving(false);
    }
  }

  function handleAdd(name: string, server: McpServer) {
    void save({ mcpServers: { ...config.mcpServers, [name]: server } });
  }

  function handleDelete(name: string) {
    const { [name]: _, ...rest } = config.mcpServers;
    void save({ mcpServers: rest });
  }

  function handleEdit(previousName: string, nextName: string, server: McpServer) {
    const { [previousName]: _, ...rest } = config.mcpServers;
    void save({ mcpServers: { ...rest, [nextName]: server } });
  }

  const servers = Object.entries(config.mcpServers);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <div className="flex items-center gap-3">
          <Plug className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold">MCP Servers</h2>
            <p className="text-xs text-muted-foreground">
              {repoPath ? `.mcp.json — ${repoPath.split("/").pop()}` : "No repository open"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isSaving && <LoadingSpinner size="sm" />}
          <Button size="sm" onClick={() => setIsAddOpen(true)} disabled={isLoading}>
            <Plus className="h-4 w-4 mr-1.5" /> Add server
          </Button>
        </div>
      </div>

      {/* Server list */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : servers.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Plug className="h-10 w-10 text-muted-foreground opacity-30" />
            <div>
              <p className="text-sm font-medium">No MCP servers configured</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add a server to get started.
              </p>
            </div>
            <Button size="sm" onClick={() => setIsAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Add server
            </Button>
          </div>
        ) : (
          <div className={cn("space-y-2", isSaving && "opacity-60 pointer-events-none")}>
            {servers.map(([name, server]) => (
              <ServerCard
                key={name}
                name={name}
                server={server}
                onEdit={() => setEditingServer({ name, server })}
                onDelete={() => handleDelete(name)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add */}
      <AddServerDialog open={isAddOpen} onOpenChange={setIsAddOpen} onAdd={handleAdd} />

      {/* Edit */}
      <AddServerDialog
        key={editingServer ? `edit-${editingServer.name}-${getServerType(editingServer.server)}` : "edit-empty"}
        open={editingServer !== null}
        onOpenChange={(open) => { if (!open) setEditingServer(null); }}
        initialName={editingServer?.name}
        initialServer={editingServer?.server}
        title="Edit MCP Server"
        description="Update this MCP server configuration in .mcp.json."
        submitLabel="Save changes"
        onAdd={(name, server) => {
          if (!editingServer) return;
          handleEdit(editingServer.name, name, server);
          setEditingServer(null);
        }}
      />
    </div>
  );
}
