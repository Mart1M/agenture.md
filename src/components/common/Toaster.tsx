import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type ToastOptions = {
  title: string;
  description?: string;
  duration?: number;
};

type Toast = ToastOptions & {
  id: string;
};

const TOAST_EVENT = "agenture:toast";

export function showToast(options: ToastOptions) {
  window.dispatchEvent(new CustomEvent<ToastOptions>(TOAST_EVENT, { detail: options }));
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    function handleToast(event: Event) {
      const { detail } = event as CustomEvent<ToastOptions>;
      const id = `${Date.now()}-${Math.random()}`;
      const toast = { id, ...detail };

      setToasts((current) => [...current, toast]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== id));
      }, detail.duration ?? 4000);
    }

    window.addEventListener(TOAST_EVENT, handleToast);
    return () => window.removeEventListener(TOAST_EVENT, handleToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-60 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-start gap-3 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{toast.title}</p>
            {toast.description && (
              <p className="mt-1 text-xs text-muted-foreground">{toast.description}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mr-1 -mt-1"
            onClick={() =>
              setToasts((current) => current.filter((item) => item.id !== toast.id))
            }
          >
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Dismiss</span>
          </Button>
        </div>
      ))}
    </div>
  );
}
