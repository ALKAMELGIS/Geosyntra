import './SiMapGlobe2D3DToggle.css';

export type SiMapGlobe2D3DToggleProps = {
  /** True when the globe is in pitched / terrain 3D mode. */
  is3d: boolean;
  /** Automatic zoom-based 2D ↔ 3D switching is active. */
  autoMode?: boolean;
  disabled?: boolean;
  onToggle: () => void;
  /** Shift+click — re-enable auto zoom switching. */
  onEnableAuto?: () => void;
  /** `dock` — stacked above left zoom controls; `map` — legacy overlay (unused). */
  variant?: 'dock' | 'map';
};

const LABELS = {
  enter3d: {
    title:
      'Enter 3D globe — or right-click / right-drag on the map · الدخول إلى 3D أو زر الماوس الأيمن على الخريطة',
    aria: 'Switch to 3D globe view',
  },
  return2d: {
    title: 'Return to 2D — or right-click on the map · العودة إلى 2D أو زر الماوس الأيمن',
    aria: 'Switch to 2D view',
  },
  autoOn: {
    title:
      'Auto view — zoom out for 3D globe, zoom in for 2D map · Click to lock manual · Shift+click to re-enable auto · تلقائي حسب التكبير',
    aria: 'Automatic 2D and 3D switching by zoom level',
  },
} as const;

/**
 * Google Earth–style 2D ↔ 3D control — manual toggle or auto zoom mode (label “A”).
 */
export function SiMapGlobe2D3DToggle({
  is3d,
  autoMode = false,
  disabled = false,
  onToggle,
  onEnableAuto,
  variant = 'dock',
}: SiMapGlobe2D3DToggleProps) {
  const nextLabel = autoMode ? 'A' : is3d ? '2D' : '3D';
  const copy = autoMode ? LABELS.autoOn : is3d ? LABELS.return2d : LABELS.enter3d;
  return (
    <button
      type="button"
      className={
        'si-map-globe-2d3d-toggle' +
        (variant === 'dock' ? ' si-map-globe-2d3d-toggle--in-dock' : '') +
        (autoMode
          ? ' si-map-globe-2d3d-toggle--auto'
          : is3d
            ? ' si-map-globe-2d3d-toggle--is3d'
            : ' si-map-globe-2d3d-toggle--is2d')
      }
      onClick={e => {
        if (e.shiftKey) {
          onEnableAuto?.();
          return;
        }
        onToggle();
      }}
      disabled={disabled}
      title={copy.title}
      aria-label={copy.aria}
      aria-pressed={is3d}
    >
      <span className="si-map-globe-2d3d-toggle__label" dir="ltr">
        {nextLabel}
      </span>
    </button>
  );
}
