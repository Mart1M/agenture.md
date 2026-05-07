import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { TerminalSquare, AlertCircle } from "lucide-react";
import { useAppStore } from "@/store";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

interface AiTool {
  id: string;
  label: string;
  command: string;
  args: string[];
  detected: boolean;
}

// Simple Icons brand hex colors
const BRAND_COLORS: Record<string, string> = {
  shell: "#0EA5E9",
  claude: "#D97757", // Claude
  codex: "#412991", // OpenAI
  gemini: "#8E75B2", // Google Gemini
  opencode: "#000000",
  aider: "#24A47F",
  mistral: "#FA520F", // Mistral AI
  "amazon-q": "#FF9900", // AWS
  continue: "#1B1F23",
  copilot: "#181717", // GitHub
  codeium: "#09B6A2", // Windsurf / Codeium
  cursor: "#000000", // Cursor
};

const LOGOS: Record<string, string> = {
  claude: "/tools/claude.svg",
  codex: "/tools/openai.svg",
  gemini: "/tools/googlegemini.svg",
  opencode: "/tools/opencode.svg",
  aider: "/tools/aider.svg",
  mistral: "/tools/mistralai.svg",
  "amazon-q": "/tools/aws.svg",
  continue: "/tools/continue.svg",
  copilot: "/tools/githubcopilot.svg",
  codeium: "/tools/windsurf.svg",
  cursor: "/tools/cursor.svg",
};

function isDarkColor(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.25;
}

export function TerminalDialog() {
  const {
    isTerminalDialogOpen,
    setIsTerminalDialogOpen,
    setCurrentView,
    terminalDialogCallback,
    setTerminalDialogCallback,
    addTerminalSession,
  } = useAppStore();

  const [tools, setTools] = useState<AiTool[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains("dark")),
    );
    obs.observe(document.documentElement, { attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!isTerminalDialogOpen) return;
    setIsDetecting(true);
    invoke<AiTool[]>("detect_ai_tools")
      .then(setTools)
      .finally(() => setIsDetecting(false));
  }, [isTerminalDialogOpen]);

  function selectTool(tool: AiTool) {
    if (!tool.detected) return;
    setIsTerminalDialogOpen(false);

    if (terminalDialogCallback) {
      terminalDialogCallback(tool);
      setTerminalDialogCallback(null);
    } else {
      // Initial launch from sidebar: create first session and navigate
      addTerminalSession(tool);
      setCurrentView("terminal");
    }
  }

  const detected = tools.filter((t) => t.detected);

  return (
    <Dialog open={isTerminalDialogOpen} onOpenChange={setIsTerminalDialogOpen}>
      <DialogContent className="sm:max-w-none w-[820px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TerminalSquare className="h-4 w-4" />
            Open AI Terminal
          </DialogTitle>
          <DialogDescription>
            Select an AI assistant or plain shell for the embedded terminal.
          </DialogDescription>
        </DialogHeader>

        {isDetecting ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="space-y-4">
            {detected.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Detected on this machine
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {detected.map((tool) => (
                    <ToolCard
                      key={tool.id}
                      tool={tool}
                      isDark={isDark}
                      onClick={() => selectTool(tool)}
                    />
                  ))}
                </div>
              </div>
            )}

            {detected.length === 0 && !isDetecting && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
                <div>
                  <p className="text-sm font-medium">No AI tools found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Install Claude Code, Gemini CLI, Aider or another supported
                    tool to get started.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ToolCard({
  tool,
  isDark,
  onClick,
}: {
  tool: AiTool;
  isDark: boolean;
  onClick: () => void;
}) {
  const logoSrc = LOGOS[tool.id];
  const brandColor = BRAND_COLORS[tool.id] ?? "#888888";
  const logoColor = isDark && isDarkColor(brandColor) ? "#ffffff" : brandColor;

  return (
    <button
      onClick={onClick}
      disabled={!tool.detected}
      className={cn(
        "flex flex-row items-center gap-3 rounded-lg border p-3 text-left transition-colors",
        tool.detected
          ? "cursor-pointer hover:bg-accent hover:border-accent-foreground/20"
          : "opacity-40 cursor-not-allowed",
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center">
        {logoSrc ? (
          <div
            style={{
              width: 28,
              height: 28,
              backgroundColor: logoColor,
              WebkitMaskImage: `url(${logoSrc})`,
              maskImage: `url(${logoSrc})`,
              maskSize: "contain",
              maskRepeat: "no-repeat",
              maskPosition: "center",
            }}
          />
        ) : (
          <TerminalSquare
            className={cn(
              "shrink-0",
              tool.id === "shell" ? "h-6 w-6" : "h-5 w-5 text-muted-foreground",
            )}
            {...(tool.id === "shell" ? { style: { color: logoColor } } : {})}
          />
        )}
      </div>

      <p className="min-w-0 flex-1 text-xs font-semibold truncate">
        {tool.label}
      </p>
    </button>
  );
}
