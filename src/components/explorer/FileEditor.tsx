import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Save,
  Strikethrough,
  Underline,
} from "lucide-react";
import { EditorState } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  drawSelection,
  keymap,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { useAppStore } from "@/store";
import { EDITOR_FONT_SIZE_PX } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Kbd } from "@/components/ui/kbd";
import { showToast } from "@/components/common/Toaster";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const markdownHighlightStyle = HighlightStyle.define([
  {
    tag: tags.heading1,
    fontSize: "1.45em",
    fontWeight: "700",
    color: "var(--foreground)",
  },
  {
    tag: tags.heading2,
    fontSize: "1.25em",
    fontWeight: "700",
    color: "var(--foreground)",
  },
  {
    tag: tags.heading3,
    fontSize: "1.12em",
    fontWeight: "650",
    color: "var(--foreground)",
  },
  { tag: tags.heading, fontWeight: "650", color: "var(--foreground)" },
  { tag: tags.strong, fontWeight: "700", color: "var(--foreground)" },
  { tag: tags.emphasis, fontStyle: "italic", color: "var(--foreground)" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  {
    tag: tags.link,
    color: "oklch(0.55 0.18 260)",
    textDecoration: "underline",
  },
  { tag: tags.url, color: "oklch(0.55 0.18 260)" },
  {
    tag: tags.monospace,
    color: "oklch(0.5 0.16 150)",
    backgroundColor: "var(--muted)",
  },
  { tag: tags.quote, color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: tags.contentSeparator, color: "var(--muted-foreground)" },
  {
    tag: tags.processingInstruction,
    color: "oklch(0.6 0.16 35)",
    fontSize: "0.9em",
    fontWeight: "500",
  },
]);

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    color: "var(--foreground)",
  },
  ".cm-scroller": {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    lineHeight: "1.7",
    paddingBottom: "96px",
  },
  ".cm-content": {
    minHeight: "100%",
    padding: "24px",
    caretColor: "var(--foreground)",
  },
  ".cm-line": {
    padding: "0 2px",
  },
  ".cm-selectionBackground": {
    backgroundColor: "oklch(0.72 0.12 260 / 0.28) !important",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--foreground)",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--muted)",
  },
  ".cm-gutters": {
    display: "none",
  },
  ".cm-focused": {
    outline: "none",
  },
  ".cm-frontmatter-line": {
    fontSize: "12px",
    lineHeight: "1.45",
    color: "var(--muted-foreground)",
  },
  ".cm-frontmatter-line *": {
    fontSize: "12px !important",
    fontWeight: "400 !important",
    fontStyle: "normal !important",
    color: "var(--muted-foreground) !important",
    backgroundColor: "transparent !important",
    textDecoration: "none !important",
  },
  ".cm-frontmatter-line span[class]": {
    fontSize: "12px !important",
    fontWeight: "400 !important",
    fontStyle: "normal !important",
    color: "var(--muted-foreground) !important",
    backgroundColor: "transparent !important",
    textDecoration: "none !important",
  },
});

const frontmatterPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = getFrontmatterDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = getFrontmatterDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

function getFrontmatterDecorations(view: EditorView) {
  const decorations = [];
  const firstLine = view.state.doc.line(1);

  if (firstLine.text.trim() !== "---") {
    return Decoration.none;
  }

  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber++) {
    const line = view.state.doc.line(lineNumber);
    decorations.push(
      Decoration.line({ class: "cm-frontmatter-line" }).range(line.from),
    );

    if (lineNumber > 1 && line.text.trim() === "---") {
      break;
    }
  }

  return Decoration.set(decorations, true);
}

type ToolbarAction = {
  label: string;
  icon: React.ReactNode;
  action: () => void;
};

type SkillFrontmatter = {
  entries: Array<{ key: string; value: string }>;
  body: string;
};

function formatTokenCount(chars: number): string {
  const tokens = Math.round(chars / 4);
  if (tokens >= 1000) return `≈ ${(tokens / 1000).toFixed(1)}k tokens`;
  return `≈ ${tokens} tokens`;
}

function estimateTokens(input: string): number {
  return Math.round(input.length / 4);
}

function extractSkillFrontmatter(content: string): SkillFrontmatter {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") {
    return { entries: [], body: content };
  }
  const end = lines.findIndex(
    (line, index) => index > 0 && line.trim() === "---",
  );
  if (end < 0) {
    return { entries: [], body: content };
  }
  const entries: Array<{ key: string; value: string }> = [];
  for (let i = 1; i < end; i++) {
    const match = lines[i].match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!match) continue;
    entries.push({ key: match[1].toLowerCase(), value: match[2] });
  }
  return {
    entries,
    body: lines
      .slice(end + 1)
      .join("\n")
      .trimStart(),
  };
}

function TinyTokenGauge({ value, limit }: { value: number; limit: number }) {
  const size = 16;
  const stroke = 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.min(value / limit, 1);
  const dash = ratio * circumference;
  const usage = value / limit;
  const progressClass =
    usage < 0.6
      ? "stroke-emerald-500"
      : usage < 0.8
        ? "stroke-lime-500"
        : usage < 0.95
          ? "stroke-amber-500"
          : usage <= 1
            ? "stroke-orange-500"
            : "stroke-destructive";

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        className="stroke-border"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        className={progressClass}
        strokeDasharray={`${dash} ${circumference - dash}`}
      />
    </svg>
  );
}

export function FileEditor() {
  const {
    viewerFile,
    editContent,
    isDirty,
    repoPath,
    setEditContent,
    setFileContent,
    editorFontSize,
  } = useAppStore();
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const latestStateRef = useRef({ viewerFile, editContent, repoPath });
  const [saving, setSaving] = useState(false);

  latestStateRef.current = { viewerFile, editContent, repoPath };

  async function save() {
    const { viewerFile, editContent, repoPath } = latestStateRef.current;
    if (!viewerFile || editContent === null) return;
    setSaving(true);
    try {
      await invoke("write_file", {
        filePath: viewerFile.path,
        content: editContent,
        repoPath,
      });
      setFileContent(editContent);
      showToast({
        title: "File saved",
        description: viewerFile.relative_path,
      });
    } catch (e) {
      console.error("Failed to save:", e);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!editorHostRef.current || editContent === null) return;

    const view = new EditorView({
      parent: editorHostRef.current,
      state: EditorState.create({
        doc: editContent,
        extensions: [
          history(),
          drawSelection(),
          markdown(),
          syntaxHighlighting(markdownHighlightStyle),
          editorTheme,
          frontmatterPlugin,
          EditorView.lineWrapping,
          keymap.of([
            {
              key: "Mod-s",
              run: () => {
                void save();
                return true;
              },
            },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              setEditContent(update.state.doc.toString());
            }
          }),
        ],
      }),
    });

    editorViewRef.current = view;

    return () => {
      view.destroy();
      editorViewRef.current = null;
    };
  }, [setEditContent]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view || editContent === null) return;

    const current = view.state.doc.toString();
    if (current !== editContent) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: editContent },
      });
    }
  }, [editContent]);

  useEffect(() => {
    editorViewRef.current?.requestMeasure();
  }, [editorFontSize]);

  if (!viewerFile || editContent === null) return null;
  const isSkillReadme = /(^|\/)skills?\.md$/i.test(viewerFile.relative_path);
  const isAgentsMd = /(^|\/)agents\.md$/i.test(viewerFile.relative_path);
  const frontmatter = isSkillReadme
    ? extractSkillFrontmatter(editContent)
    : { entries: [], body: editContent };
  const frontmatterName =
    frontmatter.entries.find((e) => e.key === "name")?.value ?? "";
  const frontmatterDescription =
    frontmatter.entries.find((e) => e.key === "description")?.value ?? "";
  const metadataTokens = estimateTokens(
    `${frontmatterName}\n${frontmatterDescription}`.trim(),
  );
  const skillBodyTokens = estimateTokens(frontmatter.body);
  const skillLineCount = frontmatter.body.split("\n").length;
  const metadataRatio = metadataTokens / 100;
  const skillRatio = skillBodyTokens / 5000;
  const linesRatio = skillLineCount / 500;
  const overallRatio = Math.max(metadataRatio, skillRatio, linesRatio);
  const agentsLineCount = editContent.split("\n").length;
  const agentsLineRatio = agentsLineCount / 200;

  function focusEditor(view: EditorView) {
    window.requestAnimationFrame(() => view.focus());
  }

  function replaceSelection(
    insertText: string,
    anchorOffset = 0,
    headOffset = insertText.length,
  ) {
    const view = editorViewRef.current;
    if (!view) return;

    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: insertText },
      selection: {
        anchor: from + anchorOffset,
        head: from + headOffset,
      },
    });
    focusEditor(view);
  }

  function wrapSelection(before: string, after = before, placeholder = "text") {
    const view = editorViewRef.current;
    if (!view) return;

    const selection = view.state.selection.main;
    const selected = view.state.doc.sliceString(selection.from, selection.to);
    const body = selected || placeholder;
    const insertText = `${before}${body}${after}`;
    const bodyStart = before.length;
    const bodyEnd = bodyStart + body.length;

    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: insertText },
      selection: selected
        ? { anchor: selection.from + insertText.length }
        : {
            anchor: selection.from + bodyStart,
            head: selection.from + bodyEnd,
          },
    });
    focusEditor(view);
  }

  function transformSelectedLines(transform: (lineText: string) => string) {
    const view = editorViewRef.current;
    if (!view) return;

    const { from, to } = view.state.selection.main;
    const startLine = view.state.doc.lineAt(from);
    const endLine = view.state.doc.lineAt(to);
    const changes = [];

    for (
      let lineNumber = startLine.number;
      lineNumber <= endLine.number;
      lineNumber++
    ) {
      const line = view.state.doc.line(lineNumber);
      changes.push({
        from: line.from,
        to: line.to,
        insert: transform(line.text),
      });
    }

    view.dispatch({ changes });
    focusEditor(view);
  }

  function setHeading(level: 1 | 2 | 3) {
    const hashes = "#".repeat(level);
    transformSelectedLines(
      (line) => `${hashes} ${line.replace(/^#{1,6}\s+/, "")}`,
    );
  }

  function prefixLines(prefix: string) {
    transformSelectedLines((line) => `${prefix}${line}`);
  }

  function insertCodeBlock() {
    const view = editorViewRef.current;
    if (!view) return;

    const selection = view.state.selection.main;
    const selected = view.state.doc.sliceString(selection.from, selection.to);
    const body = selected || "code";
    const insertText = `\`\`\`\n${body}\n\`\`\``;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: insertText },
      selection: selected
        ? { anchor: selection.from + insertText.length }
        : {
            anchor: selection.from + 4,
            head: selection.from + 4 + body.length,
          },
    });
    focusEditor(view);
  }

  const toolbarActions: ToolbarAction[] = [
    {
      label: "H1",
      icon: <Heading1 className="h-3.5 w-3.5" />,
      action: () => setHeading(1),
    },
    {
      label: "H2",
      icon: <Heading2 className="h-3.5 w-3.5" />,
      action: () => setHeading(2),
    },
    {
      label: "H3",
      icon: <Heading3 className="h-3.5 w-3.5" />,
      action: () => setHeading(3),
    },
    {
      label: "Bold",
      icon: <Bold className="h-3.5 w-3.5" />,
      action: () => wrapSelection("**"),
    },
    {
      label: "Italic",
      icon: <Italic className="h-3.5 w-3.5" />,
      action: () => wrapSelection("_"),
    },
    {
      label: "Underline",
      icon: <Underline className="h-3.5 w-3.5" />,
      action: () => wrapSelection("<u>", "</u>"),
    },
    {
      label: "Strike",
      icon: <Strikethrough className="h-3.5 w-3.5" />,
      action: () => wrapSelection("~~"),
    },
    {
      label: "Inline code",
      icon: <Code2 className="h-3.5 w-3.5" />,
      action: () => wrapSelection("`"),
    },
    {
      label: "Link",
      icon: <Link className="h-3.5 w-3.5" />,
      action: () => replaceSelection("[link text](https://)", 1, 10),
    },
    {
      label: "Quote",
      icon: <Quote className="h-3.5 w-3.5" />,
      action: () => prefixLines("> "),
    },
    {
      label: "Bulleted list",
      icon: <List className="h-3.5 w-3.5" />,
      action: () => prefixLines("- "),
    },
    {
      label: "Numbered list",
      icon: <ListOrdered className="h-3.5 w-3.5" />,
      action: () => prefixLines("1. "),
    },
    {
      label: "Task",
      icon: <ListChecks className="h-3.5 w-3.5" />,
      action: () => prefixLines("- [ ] "),
    },
    {
      label: "Code block",
      icon: <Code2 className="h-3.5 w-3.5" />,
      action: insertCodeBlock,
    },
    {
      label: "Rule",
      icon: <Minus className="h-3.5 w-3.5" />,
      action: () => replaceSelection("\n---\n"),
    },
  ];

  return (
    <div className="relative h-full overflow-hidden bg-background">
      <div
        ref={editorHostRef}
        className="h-full"
        style={{ fontSize: EDITOR_FONT_SIZE_PX[editorFontSize] }}
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-linear-to-b from-transparent via-background/55 to-background" />
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
        <div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border bg-popover/95 p-1.5 text-popover-foreground shadow-lg backdrop-blur">
          {toolbarActions.map((item) => (
            <Button
              key={item.label}
              type="button"
              variant="ghost"
              size="icon-sm"
              title={item.label}
              onClick={item.action}
            >
              {item.icon}
              <span className="sr-only">{item.label}</span>
            </Button>
          ))}
          <div className="mx-1 h-6 w-px bg-border" />
          <span className="pl-2 text-xs text-muted-foreground whitespace-nowrap">
            {formatTokenCount(editContent.length)}
          </span>
          {(isSkillReadme || isAgentsMd) && (
            <>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-accent/50"
                      aria-label={
                        isSkillReadme
                          ? "Skill token budget details"
                          : "AGENTS.md size details"
                      }
                    />
                  }
                >
                  <TinyTokenGauge
                    value={Math.round(
                      (isSkillReadme ? overallRatio : agentsLineRatio) * 100,
                    )}
                    limit={100}
                  />
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="max-w-sm border bg-background p-3 text-xs leading-5 text-foreground shadow-lg [--tooltip-bg:var(--background)]"
                >
                  {isSkillReadme ? (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold">
                        Skill size details
                      </p>
                      <div className="space-y-1">
                        <p>
                          <span className="font-medium text-muted-foreground">
                            Metadata:
                          </span>
                        </p>
                        <p className="font-medium">
                          {metadataTokens}/100 tokens
                        </p>
                      </div>
                      <Separator />
                      <div className="space-y-1">
                        <p>
                          <span className="font-medium text-muted-foreground">
                            Body:
                          </span>
                        </p>
                        <p className="font-medium">
                          {skillBodyTokens}/5000 tokens
                        </p>
                        <p>
                          <span className="font-medium">Lines:</span>{" "}
                          {skillLineCount}/500
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold">
                        AGENTS.md size details
                      </p>
                      <p>
                        <span className="font-medium text-muted-foreground">
                          Lines:
                        </span>{" "}
                        <span className="font-medium">
                          {agentsLineCount}/200
                        </span>
                      </p>
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            </>
          )}
          <div className="mx-1 h-6 w-px bg-border" />
          {isDirty ? (
            <span className="px-2 text-xs text-muted-foreground whitespace-nowrap">
              {saving ? "Saving…" : "Unsaved"}
            </span>
          ) : (
            <span className="px-2 text-xs text-muted-foreground/50 whitespace-nowrap">
              Saved
            </span>
          )}
          <Button
            onClick={save}
            disabled={!isDirty || saving}
            size="sm"
            className="pr-1"
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            Save
            {!saving && <Kbd className="ml-1">⌘S</Kbd>}
          </Button>
        </div>
      </div>
    </div>
  );
}
