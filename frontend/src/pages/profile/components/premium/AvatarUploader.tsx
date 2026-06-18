import { useRef } from 'react'
import { Camera } from 'lucide-react'
import { cn } from '../../../../lib/utils'

type AvatarUploaderProps = {
  saving?: boolean
  onPick: (file: File) => void
  className?: string
  size?: 'md' | 'lg'
}

export function AvatarUploader({ saving, onPick, className, size = 'lg' }: AvatarUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const btn =
    size === 'lg'
      ? 'h-10 w-10 border-2 border-[#07080c]'
      : 'h-8 w-8 border-2 border-[#07080c]'

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
        className={cn(
          'absolute bottom-1 right-1 flex items-center justify-center rounded-full bg-zinc-900/90 text-white shadow-lg ring-1 ring-white/20 transition hover:scale-105 hover:bg-zinc-800',
          btn,
          className,
        )}
        aria-label="Change profile photo"
      >
        <Camera className={size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5'} aria-hidden />
      </button>
    </>
  )
}
