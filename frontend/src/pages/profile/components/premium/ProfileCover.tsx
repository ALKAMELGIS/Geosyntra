import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { MoveVertical } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import { CoverUploader } from './CoverUploader'

type ProfileCoverProps = {
  coverUrl?: string
  positionY: number
  saving?: boolean
  onPick: (file: File) => void
  onRemove: () => void
  onMediaError?: () => void
  onPositionChange: (y: number) => void
  scrollRef?: React.RefObject<HTMLElement | null>
  /** LinkedIn hero — flush inside profile card (no standalone rounded frame). */
  embedded?: boolean
  className?: string
}

export function ProfileCover({
  coverUrl,
  positionY,
  saving,
  onPick,
  onRemove,
  onMediaError,
  onPositionChange,
  scrollRef,
  embedded = false,
  className,
}: ProfileCoverProps) {
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [mediaBroken, setMediaBroken] = useState(false)
  const bannerRef = useRef<HTMLDivElement>(null)

  const showCover = Boolean(coverUrl) && !mediaBroken

  useEffect(() => {
    setMediaBroken(false)
  }, [coverUrl])

  const { scrollYProgress } = useScroll({
    target: scrollRef ?? bannerRef,
    offset: ['start start', 'end start'],
  })
  const parallaxY = useTransform(scrollYProgress, [0, 1], [0, embedded ? 28 : 48])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!showCover || !bannerRef.current) return
      e.preventDefault()
      setDragging(true)
      const rect = bannerRef.current.getBoundingClientRect()

      const update = (clientY: number) => {
        const rel = (clientY - rect.top) / rect.height
        onPositionChange(Math.round(Math.max(0, Math.min(1, rel)) * 100))
      }

      update(e.clientY)

      const onMove = (ev: PointerEvent) => update(ev.clientY)
      const onUp = () => {
        setDragging(false)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [showCover, onPositionChange],
  )

  return (
    <motion.div
      ref={bannerRef}
      className={cn(
        'profile-cover group relative w-full overflow-hidden',
        embedded
          ? 'profile-cover--embedded h-[min(38vw,300px)] min-h-[200px] max-h-[340px]'
          : 'h-[min(42vw,320px)] min-h-[220px] max-h-[380px] rounded-2xl border border-white/10 shadow-2xl shadow-black/50 sm:rounded-3xl',
        className,
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      initial={{ opacity: 0, scale: embedded ? 1 : 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div className="absolute inset-0" style={{ y: parallaxY }}>
        {showCover ? (
          <img
            src={coverUrl}
            alt=""
            className={cn(
              'h-[115%] w-full object-cover select-none',
              dragging ? 'cursor-grabbing' : 'cursor-grab',
            )}
            style={{ objectPosition: `center ${positionY}%` }}
            draggable={false}
            onPointerDown={onPointerDown}
            onError={() => {
              setMediaBroken(true)
              onMediaError?.()
            }}
          />
        ) : (
          <CoverFallback embedded={embedded} />
        )}
      </motion.div>

      {!embedded ? (
        <motion.div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#07080c] via-[#07080c]/55 to-[#07080c]/15"
          aria-hidden
        />
      ) : null}

      <motion.div
        className="pointer-events-none absolute inset-0 opacity-40"
        aria-hidden
        animate={{ opacity: [0.25, 0.45, 0.25] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 20% 0%, rgba(99, 102, 241, 0.35), transparent 55%), radial-gradient(ellipse 60% 50% at 85% 20%, rgba(56, 189, 248, 0.2), transparent 50%)',
        }}
      />

      <motion.div
        className={cn(
          'absolute inset-0 z-[2] flex flex-col items-center justify-center gap-3 bg-black/50 backdrop-blur-sm transition-opacity duration-300',
          hovered && !dragging ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        animate={{ opacity: hovered && !dragging ? 1 : 0 }}
      >
        {showCover ? (
          <p className="flex items-center gap-2 text-xs font-medium text-white/90">
            <MoveVertical className="h-4 w-4" aria-hidden />
            Drag to reposition
          </p>
        ) : null}
        <CoverUploader hasCover={showCover} saving={saving} onPick={onPick} onRemove={onRemove} />
      </motion.div>
    </motion.div>
  )
}

function CoverFallback({ embedded }: { embedded?: boolean }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#07080c]">
      <motion.div
        className="absolute inset-[-50%] opacity-80"
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 48, repeat: Infinity, ease: 'linear' }}
        style={{
          background:
            'conic-gradient(from 180deg at 50% 50%, #1e1b4b 0deg, #0c4a6e 120deg, #312e81 240deg, #1e1b4b 360deg)',
        }}
      />
      <motion.div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: embedded ? '40px 40px' : '48px 48px',
        }}
        aria-hidden
      />
      <motion.div
        className="absolute left-1/2 top-[42%] h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/20"
        animate={{ scale: [1, 1.06, 1], opacity: [0.35, 0.65, 0.35] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden
      />
    </div>
  )
}
