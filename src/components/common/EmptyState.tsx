import type { LucideIcon } from "lucide-react";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: LucideIcon;
  /** Shown instead of `icon` when set (e.g. `/agenture.png` from `public/`) */
  imageSrc?: string;
  imageAlt?: string;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon: Icon = FolderOpen,
  imageSrc,
  imageAlt,
}: EmptyStateProps) {
  const imageLabel = imageAlt ?? title;
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      {imageSrc ? (
        <div
          className="mb-6 size-28 shrink-0 overflow-hidden rounded-[30%] shadow-md ring-1 ring-black/10 dark:ring-white/10"
          role="img"
          aria-label={imageLabel}
        >
          <img
            src={imageSrc}
            alt=""
            className="size-full object-cover"
            draggable={false}
          />
        </div>
      ) : (
        <Icon className="h-12 w-12 text-muted-foreground/30 mb-4" />
      )}
      <h2 className="text-lg font-semibold text-foreground mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-md">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  );
}
