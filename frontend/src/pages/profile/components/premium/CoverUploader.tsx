import { useRef } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { cn } from '../../../../lib/utils'

type CoverUploaderProps = {
  hasCover: boolean
  saving?: boolean
  onPick: (file: File) => void
  onRemove: () => void
  className?: string
}

export function CoverUploader({ hasCover, saving, onPick, onRemove, className }: CoverUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
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
        className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs font-semibold text-white backdrop-blur-xl transition hover:border-white/25 hover:bg-black/55"
      >
        <ImagePlus className="h-3.5 w-3.5" aria-hidden />
        {hasCover ? 'Change cover' : 'Upload cover'}
      </button>
      {hasCover ? (
        <button
          type="button"
          disabled={saving}
          onClick={onRemove}
          className="inline-flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 backdrop-blur-xl transition hover:bg-rose-500/20"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Remove
        </button>
      ) : null}
    </div>
  )
}
