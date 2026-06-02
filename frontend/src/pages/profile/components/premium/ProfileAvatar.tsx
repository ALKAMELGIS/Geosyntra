import { useEffect, useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { motion } from 'framer-motion'
import { accountProfileInitials } from '../../../../lib/account/geosyntraAccountProfile'
import { cn } from '../../../../lib/utils'
import { AvatarUploader } from './AvatarUploader'

type ProfileAvatarProps = {
  fullName: string
  avatarUrl?: string
  saving?: boolean
  onPick: (file: File) => void
  onMediaError?: () => void
  className?: string
  variant?: 'default' | 'hero'
}

export function ProfileAvatar({
  fullName,
  avatarUrl,
  saving,
  onPick,
  onMediaError,
  className,
  variant = 'default',
}: ProfileAvatarProps) {
  const initials = accountProfileInitials(fullName)
  const [mediaBroken, setMediaBroken] = useState(false)

  useEffect(() => {
    setMediaBroken(false)
  }, [avatarUrl])

  const showMedia = Boolean(avatarUrl) && !mediaBroken

  const handleMediaError = () => {
    setMediaBroken(true)
    onMediaError?.()
  }

  if (variant === 'hero') {
    return (
      <motion.div
        className={cn('profile-avatar--hero relative shrink-0', className)}
        initial={{ opacity: 0, y: 12, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="profile-avatar__halo" aria-hidden />
        <div className="profile-avatar__ring">
          <motion.div
            className="profile-avatar__inner group relative"
            whileHover={{ scale: 1.02 }}
            transition={{ type: 'spring', stiffness: 380, damping: 24 }}
          >
            {showMedia ? (
              <img
                src={avatarUrl}
                alt=""
                className="profile-avatar__media"
                onError={handleMediaError}
              />
            ) : (
              <motion.div className="profile-avatar__initials" aria-hidden>
                {initials}
              </motion.div>
            )}
            <span className="profile-avatar__status" title="Online" aria-hidden />
            <HeroAvatarCamera saving={saving} onPick={onPick} />
          </motion.div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      className={cn('relative shrink-0', className)}
      initial={{ opacity: 0, y: 16, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        className="absolute -inset-1 rounded-full bg-gradient-to-br from-indigo-400/50 via-zinc-400/20 to-cyan-400/40 blur-md"
        animate={{ opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden
      />
      <div className="relative rounded-full bg-gradient-to-br from-white/25 via-white/10 to-transparent p-[3px] shadow-[0_20px_50px_rgba(0,0,0,0.55)] ring-1 ring-white/20 backdrop-blur-xl">
        <motion.div
          className="group relative"
          whileHover={{ scale: 1.03 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
        >
          {showMedia ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-[7.5rem] w-[7.5rem] rounded-full border-2 border-[#07080c]/80 object-cover sm:h-36 sm:w-36"
              onError={handleMediaError}
            />
          ) : (
            <div className="flex h-[7.5rem] w-[7.5rem] items-center justify-center rounded-full border-2 border-[#07080c]/80 bg-gradient-to-br from-zinc-800 to-zinc-950 text-2xl font-bold tracking-wide text-white sm:h-36 sm:w-36 sm:text-3xl">
              {initials}
            </div>
          )}
          <span
            className="absolute bottom-2 right-2 h-4 w-4 rounded-full border-2 border-[#07080c] bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.65)]"
            title="Online"
            aria-hidden
          />
          <AvatarUploader saving={saving} onPick={onPick} />
        </motion.div>
      </div>
    </motion.div>
  )
}

function HeroAvatarCamera({ saving, onPick }: { saving?: boolean; onPick: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        onChange={e => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onPick(file)
        }}
      />
      <button
        type="button"
        disabled={saving}
        onClick={() => inputRef.current?.click()}
        className="profile-avatar__camera"
        aria-label="Change profile photo"
      >
        <Camera className="h-4 w-4" aria-hidden />
      </button>
    </>
  )
}
