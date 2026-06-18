import './FieldDataContextStrip.css'

export type FieldDataContextStripProps = {
  variant: 'satellite' | 'gis'
  imageryDateLabel: string
  layerLabel: string
  timeRangeLabel: string
  onOpenRemoteSensing?: () => void
  onOpenTimelineCharts?: () => void
}

/**
 * Compact “spectral context” strip above Field drawing tools — mirrors the
 * Remote Sensing card (imagery date, layer, timeline) without duplicating
 * the full processing stack.
 */
export default function FieldDataContextStrip({
  variant,
  imageryDateLabel,
  layerLabel,
  timeRangeLabel,
  onOpenRemoteSensing,
  onOpenTimelineCharts,
}: FieldDataContextStripProps) {
  return (
    <section className="gs-field-context-strip" aria-label="Field spectral context">
      <div className="gs-field-context-strip__grid">
        <div className="gs-field-context-strip__field">
          <span className="gs-field-context-strip__kicker">Imagery date</span>
          <span className="gs-field-context-strip__value" dir="ltr">
            {imageryDateLabel || '—'}
          </span>
        </div>
        <div className="gs-field-context-strip__field gs-field-context-strip__field--span">
          <span className="gs-field-context-strip__kicker">Layer</span>
          <span className="gs-field-context-strip__value gs-field-context-strip__value--layer" title={layerLabel}>
            {layerLabel || '—'}
          </span>
        </div>
        <div className="gs-field-context-strip__field gs-field-context-strip__field--span">
          <span className="gs-field-context-strip__kicker">Time-series</span>
          <span className="gs-field-context-strip__value" dir="ltr">
            {timeRangeLabel || '—'}
          </span>
        </div>
      </div>
      <div className="gs-field-context-strip__actions" role="group" aria-label="Open related tools">
        {variant === 'satellite' && onOpenRemoteSensing ? (
          <button type="button" className="gs-field-context-strip__btn" onClick={onOpenRemoteSensing}>
            <i className="fa-solid fa-satellite-dish" aria-hidden />
            <span>Remote sensing</span>
          </button>
        ) : null}
        {onOpenTimelineCharts ? (
          <button type="button" className="gs-field-context-strip__btn gs-field-context-strip__btn--accent" onClick={onOpenTimelineCharts}>
            <i className="fa-solid fa-chart-line" aria-hidden />
            <span>Charts</span>
          </button>
        ) : null}
      </div>
    </section>
  )
}
