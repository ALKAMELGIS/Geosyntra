export function ProfileSkeleton() {
  return (
    <div className="animate-pulse space-y-8" aria-busy="true" aria-label="Loading profile">
      <div className="h-[min(42vw,320px)] min-h-[220px] max-h-[380px] rounded-2xl border border-white/10 bg-white/5 sm:rounded-3xl" />
      <div className="flex flex-col gap-6 md:flex-row md:items-end">
        <div className="mx-auto h-28 w-28 rounded-full bg-white/10 md:mx-0 md:-mt-20 md:h-36 md:w-36" />
        <div className="flex-1 space-y-3">
          <div className="h-5 w-40 rounded-lg bg-white/10" />
          <div className="h-4 w-28 rounded bg-white/5" />
          <div className="h-10 w-full max-w-md rounded-xl bg-white/5" />
          <div className="h-16 w-full max-w-lg rounded-2xl bg-white/5" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-white/10 bg-white/5" />
        ))}
      </div>
    </div>
  )
}

