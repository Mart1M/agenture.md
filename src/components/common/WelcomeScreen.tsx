import { Clock, FolderOpen } from "lucide-react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { DottedGlowBackground } from "@/components/ui/dotted-glow-background";
import appIconUrl from "../../../resources/icon.svg?url";

export function WelcomeScreen() {
  const { recentRepos, openRepository, openRecentRepo } = useAppStore();

  return (
    <div className="relative isolate flex min-h-0 flex-1 flex-col items-center overflow-hidden px-8 py-8 text-center">
      <DottedGlowBackground
        className="pointer-events-none mask-radial-to-90% mask-radial-at-center opacity-20 dark:opacity-100"
        gap={20}
        radius={1}
        opacity={0.55}
        colorLightVar="muted-foreground"
        colorDarkVar="muted-foreground"
        glowColor="rgba(56, 189, 248, 0.75)"
        darkGlowColor="rgba(125, 211, 252, 0.85)"
      />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-0">
        <div className="mb-6 flex size-28 shrink-0 items-center justify-center overflow-hidden">
          <img
            src={appIconUrl}
            alt=""
            className="size-16 object-contain"
            draggable={false}
          />
        </div>

        <h2 className="text-lg font-semibold text-foreground mb-2">
          Welcome to Agenture
        </h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-md">
          Open a repository to explore and manage your AI agent context files.
        </p>

        <Button onClick={() => void openRepository()}>
          <FolderOpen className="h-4 w-4 mr-2" />
          Open Repository
        </Button>

        {recentRepos.length > 0 && (
          <div className="mt-8 w-full max-w-sm border-t border-border/60 pt-6">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                Recent
              </span>
            </div>
            <ul className="space-y-1">
              {recentRepos.map((path) => {
                const parts = path.replace(/\\/g, "/").split("/");
                const name = parts[parts.length - 1] ?? path;
                const parent = parts.slice(0, -1).join("/");
                return (
                  <li key={path}>
                    <button
                      className="w-full flex items-start gap-2 rounded-lg px-3 py-2 text-left hover:bg-accent transition-colors group"
                      onClick={() => void openRecentRepo(path)}
                    >
                      <FolderOpen className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {parent}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
