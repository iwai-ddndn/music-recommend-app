import { cn } from "@/lib/utils";
import type { Service } from "@/lib/types";

const STYLE: Record<Service, { short: string; label: string; cls: string }> = {
  apple: { short: "Apple", label: "Apple Music", cls: "text-rose-600 dark:text-rose-400 border-rose-500/30" },
  soundcloud: { short: "SC", label: "SoundCloud", cls: "text-orange-600 dark:text-orange-400 border-orange-500/30" },
  bandcamp: { short: "BC", label: "Bandcamp", cls: "text-sky-700 dark:text-sky-400 border-sky-500/30" },
};

export function ServiceBadge({ service, full, className }: { service: Service; full?: boolean; className?: string }) {
  const s = STYLE[service];
  return (
    <span
      title={s.label}
      className={cn(
        "inline-flex h-5 items-center rounded border px-1.5 text-[10px] font-semibold tracking-wide",
        s.cls,
        className,
      )}
    >
      {full ? s.label : s.short}
    </span>
  );
}
