/** Skeleton genérico de página — fallback de carregamento (loading.tsx). */
export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden>
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-56 rounded-lg bg-muted" />
          <div className="h-4 w-72 rounded bg-muted/70" />
        </div>
        <div className="h-10 w-44 rounded-lg bg-muted" />
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-border bg-card p-4">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="mt-3 h-7 w-28 rounded-lg bg-muted" />
          </div>
        ))}
      </div>

      {/* Conteúdo */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-72 rounded-2xl border border-border bg-card lg:col-span-2" />
        <div className="h-72 rounded-2xl border border-border bg-card" />
      </div>
    </div>
  );
}
