import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Update } from "@tauri-apps/plugin-updater";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAppStore } from "./store";
import { AppSidebar } from "./components/layout/AppSidebar";
import { TopBar } from "./components/layout/TopBar";
import { MainPanel } from "./components/layout/MainPanel";
import { SkillNavigator } from "./components/skills/SkillNavigator";
import { MemoryNavigator } from "./components/memory/MemoryNavigator";
import { TerminalDialog } from "./components/terminal/TerminalDialog";
import { Toaster } from "./components/common/Toaster";
import { SettingsDialog } from "./components/settings/SettingsDialog";
import { SetupAgentureDialog } from "./components/setup/SetupAgentureDialog";
import { UpdateDialog } from "./components/update/UpdateDialog";
import { applySettings, loadSettings } from "./lib/settings";
import {
  CHECK_UPDATES_EVENT,
  fetchAvailableUpdate,
  installUpdate,
} from "./lib/updates";
import { showToast } from "./components/common/Toaster";

function App() {
  const { selectedItem, repoPath, scanResult } = useAppStore();
  const isAutoRescanningRef = useRef(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState<number | null>(null);

  const checkForUpdates = useCallback(async (manual = false) => {
    try {
      const update = await fetchAvailableUpdate();
      if (update) {
        setPendingUpdate(update);
        setInstallError(null);
        return;
      }
      setPendingUpdate(null);
      if (manual) {
        showToast({
          title: "You're up to date",
          description: "Agenture is running the latest version.",
          duration: 4000,
        });
      }
    } catch (err) {
      if (manual) {
        showToast({
          title: "Could not check for updates",
          description: err instanceof Error ? err.message : String(err),
          duration: 6000,
        });
      }
    }
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    if (!pendingUpdate || installing) return;

    setInstalling(true);
    setInstallError(null);
    setDownloadedBytes(0);
    setTotalBytes(null);

    try {
      await installUpdate(pendingUpdate, ({ downloadedBytes: done, totalBytes: total }) => {
        setDownloadedBytes(done);
        setTotalBytes(total);
      });
    } catch (err) {
      console.error("[updater]", err);
      setInstallError("The update could not be installed. Please try again or download the latest version manually.");
      setInstalling(false);
    }
  }, [pendingUpdate, installing]);

  useEffect(() => {
    const settings = loadSettings();
    applySettings(settings);

    if (settings.reopenLastRepo) {
      const last = useAppStore.getState().recentRepos[0];
      if (last) void useAppStore.getState().openRecentRepo(last);
    }

    if (settings.autoCheckUpdates) {
      void checkForUpdates();
    }
  }, [checkForUpdates]);

  useEffect(() => {
    const pending = listen("open-repository", () => {
      void useAppStore.getState().openRepository();
    });

    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    const pending = listen("open-settings", () => {
      setIsSettingsOpen(true);
    });

    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    const pending = listen("open-setup-agenture", () => {
      setIsSetupOpen(true);
    });

    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    const pending = listen("check-for-updates", () => {
      void checkForUpdates(true);
    });

    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, [checkForUpdates]);

  useEffect(() => {
    function handleCheckUpdates() {
      void checkForUpdates(true);
    }

    window.addEventListener(CHECK_UPDATES_EVENT, handleCheckUpdates);
    return () => window.removeEventListener(CHECK_UPDATES_EVENT, handleCheckUpdates);
  }, [checkForUpdates]);

  useEffect(() => {
    if (!repoPath || !scanResult) return;

    const tick = () => {
      if (isAutoRescanningRef.current) return;
      if (document.hidden) return;
      isAutoRescanningRef.current = true;
      void useAppStore
        .getState()
        .rescan({ silent: true })
        .finally(() => {
          isAutoRescanningRef.current = false;
        });
    };

    const interval = window.setInterval(tick, 2500);
    return () => {
      window.clearInterval(interval);
    };
  }, [repoPath, scanResult]);

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
            <MemoryNavigator />
            <MainPanel />
          </div>
        </SidebarInset>
        <TerminalDialog />
        <SetupAgentureDialog open={isSetupOpen} onOpenChange={setIsSetupOpen} />
        <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
        <UpdateDialog
          update={pendingUpdate}
          installing={installing}
          installError={installError}
          downloadedBytes={downloadedBytes}
          totalBytes={totalBytes}
          onInstall={() => void handleInstallUpdate()}
          onDismiss={() => setPendingUpdate(null)}
        />
        <Toaster />
      </SidebarProvider>
    </TooltipProvider>
  );
}

export default App;
