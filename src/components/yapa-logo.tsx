import { cn } from "@/lib/cn";

/** Marca do Yapa: uma garrafa/brinde minimalista (traço único) + wordmark. */
export function YapaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn("size-7", className)} aria-hidden>
      {/* garrafa estilizada */}
      <path
        d="M13 3h6M14.5 3v4.2c0 .8-.3 1.5-.9 2.1l-2 2c-.7.7-1.1 1.7-1.1 2.7V26a3 3 0 0 0 3 3h5a3 3 0 0 0 3-3V14c0-1-.4-2-1.1-2.7l-2-2c-.6-.6-.9-1.3-.9-2.1V3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* nível de bebida */}
      <path d="M10.5 17.5h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

export function YapaLogo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-primary", className)}>
      <YapaMark />
      {!compact && (
        <span className="font-display text-lg font-semibold tracking-tight text-foreground">
          Yapa
        </span>
      )}
    </span>
  );
}
