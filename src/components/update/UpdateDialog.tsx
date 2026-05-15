import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import type { Update } from "@tauri-apps/plugin-updater";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

interface Props {
  update: Update | null;
  installing: boolean;
  installError: string | null;
  downloadedBytes: number;
  totalBytes: number | null;
  onInstall: () => void;
}

export function UpdateDialog({
  update,
  installing,
  installError,
  downloadedBytes,
  totalBytes,
  onInstall,
}: Props) {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);

  useEffect(() => {
    void getVersion().then(setCurrentVersion);
  }, []);

  const progressPercent =
    totalBytes && totalBytes > 0
      ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
      : null;

  return (
    <Dialog open={!!update} onOpenChange={() => {}}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update available</DialogTitle>
          <DialogDescription>
            A new version of Agenture is ready to install.
            {currentVersion && update && (
              <>
                {" "}
                You are on v{currentVersion}; v{update.version} is available.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {installing && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoadingSpinner size="sm" />
              <span>
                {progressPercent != null
                  ? `Downloading… ${progressPercent}%`
                  : "Downloading update…"}
              </span>
            </div>
            {progressPercent != null && (
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}
          </div>
        )}

        {installError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {installError}
          </p>
        )}

        <DialogFooter className="sm:justify-start">
          <Button onClick={onInstall} disabled={installing}>
            {installing ? (
              <>
                <LoadingSpinner size="sm" />
                Installing…
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Install and restart
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
