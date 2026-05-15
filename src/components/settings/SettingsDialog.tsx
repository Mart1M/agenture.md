import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type AppSettings, loadSettings, saveSettings, applySettings } from "@/lib/settings";
import { CHECK_UPDATES_EVENT } from "@/lib/updates";
import { useAppStore } from "@/store";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-none">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
        {title}
      </p>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function SettingsDialog({ open, onOpenChange }: Props) {
  const setEditorFontSize = useAppStore((s) => s.setEditorFontSize);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  useEffect(() => {
    if (open) setSettings(loadSettings());
  }, [open]);

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function handleApply() {
    saveSettings(settings);
    applySettings(settings);
    setEditorFontSize(settings.editorFontSize);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-1">
          <Section title="Appearance">
            <Row label="Theme">
              <Select
                value={settings.theme}
                onValueChange={(v) => update("theme", v as AppSettings["theme"])}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </SelectContent>
              </Select>
            </Row>
          </Section>

          <Section title="Editor">
            <Row label="Font size">
              <Select
                value={settings.editorFontSize}
                onValueChange={(v) => update("editorFontSize", v as AppSettings["editorFontSize"])}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                </SelectContent>
              </Select>
            </Row>
          </Section>

          <Section title="Behavior">
            <Row
              label="Confirm before deleting"
              description="Show a confirmation prompt when removing files"
            >
              <Switch
                id="confirm-delete"
                checked={settings.confirmBeforeDelete}
                onCheckedChange={(v) => update("confirmBeforeDelete", v)}
              />
            </Row>
            <Row
              label="Reopen last repository"
              description="Automatically open the last used repo on startup"
            >
              <Switch
                id="reopen-last-repo"
                checked={settings.reopenLastRepo}
                onCheckedChange={(v) => update("reopenLastRepo", v)}
              />
            </Row>
          </Section>

          <Section title="Updates">
            <Row
              label="Check for updates automatically"
              description="Notify when a new version is available"
            >
              <Switch
                id="auto-updates"
                checked={settings.autoCheckUpdates}
                onCheckedChange={(v) => update("autoCheckUpdates", v)}
              />
            </Row>
            <Row
              label="Check now"
              description="Look for a new version on GitHub"
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent(CHECK_UPDATES_EVENT))
                }
              >
                Check for updates
              </Button>
            </Row>
          </Section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
