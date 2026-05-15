import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export const CHECK_UPDATES_EVENT = "agenture:check-for-updates";

export type InstallProgress = {
  downloadedBytes: number;
  totalBytes: number | null;
};

export async function fetchAvailableUpdate(): Promise<Update | null> {
  const update = await check();
  return update?.available ? update : null;
}

export async function installUpdate(
  update: Update,
  onProgress?: (progress: InstallProgress) => void,
): Promise<void> {
  let downloadedBytes = 0;
  let totalBytes: number | null = null;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        downloadedBytes = 0;
        totalBytes = event.data.contentLength ?? null;
        onProgress?.({ downloadedBytes, totalBytes });
        break;
      case "Progress":
        downloadedBytes += event.data.chunkLength;
        onProgress?.({ downloadedBytes, totalBytes });
        break;
      case "Finished":
        onProgress?.({ downloadedBytes, totalBytes });
        break;
    }
  });

  await relaunch();
}
