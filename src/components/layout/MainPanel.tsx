import type { ReactNode } from "react";
import { useAppStore } from "@/store";
import { EmptyState } from "@/components/common/EmptyState";
import { WelcomeScreen } from "@/components/common/WelcomeScreen";
import { MarkdownViewer } from "@/components/explorer/MarkdownViewer";
import { SetupCTA } from "@/components/setup/SetupCTA";
import { SkillsPage } from "@/components/skills/SkillsPage";
import { TerminalView } from "@/components/terminal/TerminalView";
import { MCPView } from "@/components/mcp/MCPView";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { cn } from "@/lib/utils";

export function MainPanel() {
  const {
    repoPath,
    scanResult,
    isScanning,
    currentView,
    viewerFile,
    isLoadingFile,
    terminalSessions,
  } = useAppStore();

  /** Keep PTYs alive when leaving the terminal view (hidden layer). */
  function mainWithPersistentTerminals(primary: ReactNode | null) {
    const persistShell =
      terminalSessions.length > 0 || currentView === "terminal";
    const terminalInFront = currentView === "terminal";

    if (!persistShell) {
      return <>{primary}</>;
    }

    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        {primary != null && (
          <div
            className={cn(
              "relative z-2 flex min-h-0 flex-1 flex-col overflow-hidden bg-background",
              terminalInFront && "hidden",
            )}
          >
            {primary}
          </div>
        )}
        <div
          aria-hidden={!terminalInFront}
          className={cn(
            "flex min-h-0 flex-col overflow-hidden bg-background",
            terminalInFront
              ? "relative z-1 min-h-0 flex-1"
              : "pointer-events-none absolute inset-0 z-1 min-h-0 w-full opacity-0",
          )}
          {...(!terminalInFront ? { inert: true as const } : {})}
        >
          <TerminalView />
        </div>
      </div>
    );
  }

  if (isScanning) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!repoPath || !scanResult) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <WelcomeScreen />
      </div>
    );
  }

  if (currentView === "skills") {
    return mainWithPersistentTerminals(
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SkillsPage />
      </div>,
    );
  }

  if (currentView === "terminal") {
    return mainWithPersistentTerminals(null);
  }

  if (currentView === "mcp") {
    return mainWithPersistentTerminals(
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <MCPView />
      </div>,
    );
  }

  if (!scanResult.has_agent_context) {
    return mainWithPersistentTerminals(
      <div className="flex-1">
        <SetupCTA />
      </div>,
    );
  }

  if (isLoadingFile || viewerFile) {
    return mainWithPersistentTerminals(
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <MarkdownViewer />
      </div>,
    );
  }

  return mainWithPersistentTerminals(
    <div className="flex-1">
      <EmptyState
        title="Select a file"
        description="Choose an agent or skill from the sidebar to view its content."
      />
    </div>,
  );
}
