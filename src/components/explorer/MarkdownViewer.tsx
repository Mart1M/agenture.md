import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Eye, Pencil } from "lucide-react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { FileEditor } from "./FileEditor";

type MetadataEntry = {
  key: string;
  value: string;
};

type MetadataPreview = {
  entries: MetadataEntry[];
  body: string;
};

function formatJson(value: string) {
  return JSON.stringify(JSON.parse(value), null, 2);
}

function getJsonPreview(value: string) {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return null;
  }

  try {
    return formatJson(trimmed);
  } catch {
    return null;
  }
}

function extractMetadata(content: string): MetadataPreview {
  const lines = content.split("\n");
  const entries: MetadataEntry[] = [];
  let bodyStart = 0;
  let start = 0;

  if (lines[0]?.trim() === "---") {
    start = 1;
    const end = lines.findIndex(
      (line, index) => index > 0 && line.trim() === "---",
    );
    if (end === -1) return { entries: [], body: content };
    bodyStart = end + 1;
  }

  for (let index = start; index < lines.length; index++) {
    const line = lines[index];
    const match = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);

    if (!match) {
      bodyStart = start === 0 ? index : bodyStart;
      break;
    }

    entries.push({ key: match[1], value: match[2] });
    bodyStart = index + 1;
  }

  if (entries.length < 2) return { entries: [], body: content };

  return {
    entries,
    body: lines.slice(bodyStart).join("\n").trimStart(),
  };
}

function getMetadataValue(metadata: MetadataPreview, key: string) {
  return metadata.entries.find((entry) => entry.key === key)?.value;
}

function formatMetadataLabel(key: string) {
  return key.replace(/-/g, " ");
}

function MetadataCard({ metadata }: { metadata: MetadataPreview }) {
  const name = getMetadataValue(metadata, "name");
  const description = getMetadataValue(metadata, "description");
  const tools = getMetadataValue(metadata, "tools")
    ?.split(",")
    .map((tool) => tool.trim())
    .filter(Boolean);
  const secondaryEntries = metadata.entries.filter(
    (entry) => !["name", "description", "tools"].includes(entry.key),
  );

  return (
    <section className="mb-6 overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="border-b bg-muted/40 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">
              {name ?? "Untitled skill"}
            </h1>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-3">
        {description && (
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Description
            </p>
            <p className="text-sm leading-6 text-foreground">{description}</p>
          </div>
        )}

        {tools && tools.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Tools
            </p>
            <div className="flex flex-wrap gap-2">
              {tools.map((tool) => (
                <Badge key={tool} variant="secondary" className="font-mono">
                  {tool}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {secondaryEntries.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {secondaryEntries.map((entry) => (
              <div
                key={entry.key}
                className="rounded-lg border bg-background p-2.5"
              >
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {formatMetadataLabel(entry.key)}
                </p>
                <p className="text-sm leading-6">{entry.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

const markdownComponents: Components = {
  h1({ children }) {
    return (
      <h1 className="mb-5 mt-8 border-b pb-3 text-3xl font-bold tracking-tight first:mt-0">
        {children}
      </h1>
    );
  },
  h2({ children }) {
    return (
      <h2 className="mb-4 mt-8 border-b pb-2 text-2xl font-semibold tracking-tight first:mt-0">
        {children}
      </h2>
    );
  },
  h3({ children }) {
    return <h3 className="mb-3 mt-6 text-xl font-semibold">{children}</h3>;
  },
  h4({ children }) {
    return <h4 className="mb-2 mt-5 text-base font-semibold">{children}</h4>;
  },
  p({ children }) {
    return <p className="my-3 leading-7 text-foreground">{children}</p>;
  },
  ul({ children }) {
    return <ul className="my-4 ml-6 list-disc space-y-2">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="my-4 ml-6 list-decimal space-y-2">{children}</ol>;
  },
  li({ children }) {
    return <li className="pl-1 leading-7">{children}</li>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-5 border-l-4 border-border pl-4 text-muted-foreground italic">
        {children}
      </blockquote>
    );
  },
  a({ children, href }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground"
      >
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className="my-5 overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return (
      <th className="border-b bg-muted px-3 py-2 text-left font-semibold">
        {children}
      </th>
    );
  },
  td({ children }) {
    return <td className="border-b px-3 py-2 align-top">{children}</td>;
  },
  pre({ children }) {
    return (
      <pre className="my-5 overflow-x-auto rounded-lg border bg-muted p-4 text-sm leading-relaxed shadow-sm">
        {children}
      </pre>
    );
  },
  code({ className, children }) {
    const code = String(children).replace(/\n$/, "");
    const language = /language-(\w+)/.exec(className ?? "")?.[1]?.toLowerCase();
    const content = language === "json" ? safeFormatJson(code) : code;

    return (
      <code
        className={
          className
            ? "font-mono text-sm"
            : "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]"
        }
      >
        {content}
      </code>
    );
  },
};

function safeFormatJson(value: string) {
  try {
    return formatJson(value);
  } catch {
    return value;
  }
}

export function MarkdownViewer() {
  const { viewerFile, fileContent, isLoadingFile, viewMode, setViewMode } =
    useAppStore();

  if (isLoadingFile) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner />
      </div>
    );
  }

  if (!viewerFile || fileContent === null) return null;
  const jsonPreview = getJsonPreview(fileContent);
  const metadataPreview = jsonPreview ? null : extractMetadata(fileContent);
  const previewBody = metadataPreview?.body ?? fileContent;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
        <span className="text-xs text-muted-foreground truncate font-mono">
          {viewerFile.relative_path}
        </span>
        <div className="flex gap-1">
          <Button
            variant={viewMode === "edit" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("edit")}
          >
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
          <Button
            variant={viewMode === "rendered" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("rendered")}
          >
            <Eye className="h-3.5 w-3.5 mr-1" /> Preview
          </Button>
        </div>
      </div>

      <div
        className={
          viewMode === "edit"
            ? "flex-1 min-h-0"
            : "flex-1 overflow-y-auto p-6"
        }
      >
        {viewMode === "edit" && <FileEditor />}
        {viewMode === "rendered" && (
          <div className="mx-auto max-w-4xl text-sm text-foreground">
            {jsonPreview ? (
              <pre className="overflow-x-auto rounded-lg border bg-muted p-4 text-sm leading-relaxed shadow-sm">
                <code className="font-mono">{jsonPreview}</code>
              </pre>
            ) : (
              <>
                {metadataPreview && metadataPreview.entries.length > 0 && (
                  <MetadataCard metadata={metadataPreview} />
                )}
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {previewBody}
                </ReactMarkdown>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
