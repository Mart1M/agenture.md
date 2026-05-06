import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAppStore } from "./store";
import { AppSidebar } from "./components/layout/AppSidebar";
import { TopBar } from "./components/layout/TopBar";
import { MainPanel } from "./components/layout/MainPanel";
import { SkillNavigator } from "./components/skills/SkillNavigator";
import { TerminalDialog } from "./components/terminal/TerminalDialog";
import { Toaster } from "./components/common/Toaster";

function App() {
  const { selectedItem, repoPath, scanResult } = useAppStore();

  useEffect(() => {
    const pending = listen("open-repository", () => {
      void useAppStore.getState().openRepository();
    });

    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, []);

  const showTopBar = Boolean(repoPath && scanResult);

  const showSkillNavigator = selectedItem?.type === "skill";

  return (
    <TooltipProvider>
      <SidebarProvider className="h-screen overflow-hidden">
        {repoPath && <AppSidebar />}
        <SidebarInset className="min-h-0 overflow-hidden">
          {showTopBar && <TopBar />}
          <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
            {showSkillNavigator && <SkillNavigator />}
            <MainPanel />
          </div>
        </SidebarInset>
        <TerminalDialog />
        <Toaster />
      </SidebarProvider>
    </TooltipProvider>
  );
}

export default App;
