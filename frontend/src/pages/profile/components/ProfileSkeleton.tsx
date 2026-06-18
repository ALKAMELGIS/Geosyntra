import './premium/profile-premium.css'

export function ProfileSkeleton() {
  return (
    <div className="animate-pulse space-y-8" aria-busy="true" aria-label="Loading profile">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="profile-hero-skeleton__card">
          <div className="profile-hero-skeleton__cover" />
          <div className="profile-hero-skeleton__body">
            <div className="profile-hero-skeleton__avatar" aria-hidden />
            <div className="space-y-3 md:pl-[10.5rem]">
              <div className="mx-auto h-5 w-40 rounded-lg bg-white/10 md:mx-0" />
              <div className="mx-auto h-4 w-28 rounded bg-white/5 md:mx-0" />
              <div className="mx-auto h-10 w-full max-w-md rounded-xl bg-white/5 md:mx-0" />
              <div className="h-16 w-full max-w-lg rounded-2xl bg-white/5" />
            </div>
          </div>
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
