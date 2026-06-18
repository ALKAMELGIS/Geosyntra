type GeoGroundingSuggestionChipsProps = {
  chips: string[]
  disabled?: boolean
  onSelect: (text: string) => void
}

export function GeoGroundingSuggestionChips({
  chips,
  disabled,
  onSelect,
}: GeoGroundingSuggestionChipsProps) {
  if (!chips.length) return null
  return (
    <div className="geo-grounding-chips" role="list" aria-label="Grounded geographic suggestions">
      {chips.map(chip => (
        <button
          key={chip}
          type="button"
          role="listitem"
          className="geo-grounding-chip"
          disabled={disabled}
          onClick={() => onSelect(chip)}
        >
          {chip}
        </button>
      ))}
    </div>
  )
}
