export function ProfileSkeleton() {
  return (
    <div className="animate-pulse space-y-8" aria-busy="true" aria-label="Loading profile">
      <div className="flex flex-col gap-6 rounded-3xl border border-border/60 bg-card/40 p-6 md:flex-row md:items-center">
        <div className="h-24 w-24 rounded-full bg-muted/60" />
        <div className="flex-1 space-y-3">
          <div className="h-6 w-48 rounded-lg bg-muted/60" />
          <div className="h-4 w-64 rounded bg-muted/50" />
          <div className="h-2 w-full max-w-md rounded-full bg-muted/40" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-border/50 bg-muted/30" />
        ))}
      </div>
    </div>
  )
}
