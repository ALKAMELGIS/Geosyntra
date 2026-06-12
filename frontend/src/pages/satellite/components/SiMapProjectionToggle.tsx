import { useLanguage } from '@/lib/i18n';
import type { SiMapProjectionMode } from '../utils/siMapProjectionTerrain';
import './SiMapProjectionToggle.css';

export type SiMapProjectionToggleProps = {
  mode: SiMapProjectionMode;
  disabled?: boolean;
  onToggle: () => void;
};

/**
 * Globe ↔ Mercator projection switcher — pairs with {@link setGeoSyntraMapProjection}.
 */
export function SiMapProjectionToggle({
  mode,
  disabled = false,
  onToggle,
}: SiMapProjectionToggleProps) {
  const { language } = useLanguage();
  const isGlobe = mode === 'globe';

  const title = isGlobe
    ? language === 'ar'
      ? 'التبديل إلى خريطة Mercator ثنائية الأبعاد'
      : 'Switch to 2D Mercator map'
    : language === 'ar'
      ? 'التبديل إلى كرة أرضية ثلاثية الأبعاد'
      : 'Switch to 3D Globe view';

  return (
    <button
      type="button"
      className={
        'si-basemap-button si-map-projection-toggle' +
        (isGlobe ? ' si-map-projection-toggle--globe active' : ' si-map-projection-toggle--mercator')
      }
      onClick={onToggle}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={isGlobe}
    >
      <span className="si-map-projection-toggle__glyph" aria-hidden>
        {isGlobe ? (
          <svg viewBox="0 0 16 16" width="14" height="14" focusable="false">
            <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <ellipse cx="8" cy="8" rx="2.2" ry="5.6" fill="none" stroke="currentColor" strokeWidth="0.9" />
            <path d="M2.4 8h11.2" stroke="currentColor" strokeWidth="0.9" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="14" height="14" focusable="false">
            <rect x="2.5" y="3.5" width="11" height="9" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M2.5 6.5h11" stroke="currentColor" strokeWidth="0.8" opacity="0.7" />
            <path d="M5.5 3.5v9" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
            <path d="M10.5 3.5v9" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
          </svg>
        )}
      </span>
    </button>
  );
}
