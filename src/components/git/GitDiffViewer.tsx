import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Props {
  diff: string;
  path: string;
  isEmpty: boolean;
}

export function GitDiffViewer({ diff, path, isEmpty }: Props) {
  if (isEmpty) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-8 text-center">
        <p className="text-xs text-muted-foreground">
          No line changes to show for <span className="font-mono">{path}</span>.
        </p>
      </div>
    );
  }

  const lines = diff.split("\n");

  return (
    <ScrollArea className="min-h-0 flex-1">
      <pre className="p-3 font-mono text-[11px] leading-relaxed">
        {lines.map((line, i) => (
          <div
            key={`${i}-${line.slice(0, 8)}`}
            className={cn(
              "-mx-1 whitespace-pre-wrap break-all rounded-sm px-1",
              line.startsWith("+++") || line.startsWith("---")
                ? "font-semibold text-muted-foreground"
                : line.startsWith("@@")
                  ? "bg-primary/5 text-primary/80"
                  : line.startsWith("+")
                    ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                    : line.startsWith("-")
                      ? "bg-red-500/10 text-red-800 dark:text-red-200"
                      : "text-foreground/80",
            )}
          >
            {line || " "}
          </div>
        ))}
      </pre>
    </ScrollArea>
  );
}
