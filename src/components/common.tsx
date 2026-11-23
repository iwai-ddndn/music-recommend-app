"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-2" aria-busy>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-14 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-3 px-6 py-16 text-center">
      {icon && <span className="bg-muted flex size-16 items-center justify-center rounded-full">{icon}</span>}
      <p className="text-foreground font-semibold">{title}</p>
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="border-destructive/40 text-destructive rounded-2xl border px-4 py-6 text-center text-sm">
      {message}
      {onRetry && (
        <button className="ml-2 h-11 underline underline-offset-4" onClick={onRetry}>
          再読み込み
        </button>
      )}
    </div>
  );
}
