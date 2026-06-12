import { useLanguage } from '@/lib/i18n';
import './SiMapFeatureInspectToolbar.css';

export type SiMapIdentifyCandidate = {
  id: string;
  title: string;
};

export type SiMapFeatureInspectToolbarProps = {
  candidates: SiMapIdentifyCandidate[];
  activeCandidateId: string;
  onSelectCandidate: (id: string) => void;
  onEdit: () => void;
  onZoomTo: () => void;
  onOpenTable: () => void;
  onCopyCoordinates?: () => void;
  onFlash?: () => void;
  onExport?: () => void;
  onCopyAll?: () => void;
  onExportCsv?: () => void;
  onPrevCandidate?: () => void;
  onNextCandidate?: () => void;
  candidateIndex?: number;
  candidateCount?: number;
  editActive?: boolean;
  editDisabled?: boolean;
  zoomDisabled?: boolean;
  tableDisabled?: boolean;
  exportDisabled?: boolean;
  compact?: boolean;
  /** ArcGIS-style: Table · Edit · Zoom to only (no extra action chips). */
  arcgisStyle?: boolean;
};

export type SiMapFeatureInspectFooterProps = {
  onPrevCandidate?: () => void;
  onNextCandidate?: () => void;
  candidateIndex?: number;
  candidateCount?: number;
};

function t(lang: string | undefined, en: string, ar: string): string {
  return lang === 'ar' ? ar : en;
}

export function SiMapFeatureInspectToolbar({
  candidates,
  activeCandidateId,
  onSelectCandidate,
  onEdit,
  onZoomTo,
  onOpenTable,
  onCopyCoordinates,
  onFlash,
  onExport,
  onCopyAll,
  onExportCsv,
  onPrevCandidate,
  onNextCandidate,
  candidateIndex = 0,
  candidateCount = 1,
  editActive = false,
  editDisabled = false,
  zoomDisabled = false,
  tableDisabled = false,
  exportDisabled = false,
  compact = false,
  arcgisStyle = false,
}: SiMapFeatureInspectToolbarProps) {
  const { direction, language } = useLanguage();
  const showLayerPicker = candidates.length > 1 && !arcgisStyle;

  return (
    <div
      className={
        'si-map-identify-toolbar' +
        (compact ? ' si-map-identify-toolbar--compact' : '') +
        (arcgisStyle ? ' si-map-identify-toolbar--arcgis' : '')
      }
      role="toolbar"
      aria-label={t(language, 'Feature popup actions', 'إجراءات نافذة المعلم')}
      dir={direction}
    >
      {showLayerPicker ? (
        <label className="si-map-identify-toolbar__layer-pick">
          <span className="si-map-identify-toolbar__layer-label">{t(language, 'Layer', 'الطبقة')}</span>
          <select
            className="si-map-identify-toolbar__layer-select"
            value={activeCandidateId}
            aria-label={t(language, 'Select feature layer at this location', 'اختر طبقة المعلم')}
            onClick={e => e.stopPropagation()}
            onChange={e => onSelectCandidate(e.target.value)}
          >
            {candidates.map(c => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="gis-map-popup-toolbar si-map-identify-toolbar__actions" role="presentation">
        <button
          type="button"
          className="gis-map-popup-toolbtn"
          title={t(language, 'Open layer attribute table', 'فتح جدول السمات')}
          aria-label={t(language, 'Open layer attribute table', 'فتح جدول السمات')}
          disabled={tableDisabled}
          onClick={e => {
            e.stopPropagation();
            onOpenTable();
          }}
        >
          <i className="fa-solid fa-table" aria-hidden />
          {!compact || arcgisStyle ? <span>{t(language, 'Table', 'جدول')}</span> : null}
        </button>
        {!arcgisStyle ? <span className="gis-map-popup-toolsep" aria-hidden /> : null}
        <button
          type="button"
          className={'gis-map-popup-toolbtn' + (editActive ? ' gis-map-popup-toolbtn--on' : '')}
          title={t(language, 'Edit attributes', 'تعديل البيانات')}
          aria-label={t(language, 'Edit attributes', 'تعديل البيانات')}
          aria-pressed={editActive}
          disabled={editDisabled}
          onClick={e => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <i className="fa-solid fa-pen" aria-hidden />
          {!compact || arcgisStyle ? <span>{t(language, 'Edit', 'تعديل')}</span> : null}
        </button>
        {!arcgisStyle ? <span className="gis-map-popup-toolsep" aria-hidden /> : null}
        <button
          type="button"
          className="gis-map-popup-toolbtn"
          title={t(language, 'Zoom to feature', 'تكبير إلى المعلم')}
          aria-label={t(language, 'Zoom to feature', 'تكبير إلى المعلم')}
          disabled={zoomDisabled}
          onClick={e => {
            e.stopPropagation();
            onZoomTo();
          }}
        >
          <i className="fa-solid fa-magnifying-glass-plus" aria-hidden />
          {!compact || arcgisStyle ? (
            <span>{arcgisStyle ? t(language, 'Zoom to', 'تكبير إلى') : t(language, 'Zoom', 'تكبير')}</span>
          ) : null}
        </button>
        {arcgisStyle ? null : onFlash ? (
          <>
            <span className="gis-map-popup-toolsep" aria-hidden />
            <button
              type="button"
              className="gis-map-popup-toolbtn"
              title={t(language, 'Flash feature on map', 'وميض المعلم')}
              aria-label={t(language, 'Flash feature', 'وميض')}
              onClick={e => {
                e.stopPropagation();
                onFlash();
              }}
            >
              <i className="fa-solid fa-bolt" aria-hidden />
              {!compact ? <span>{t(language, 'Flash', 'وميض')}</span> : null}
            </button>
          </>
        ) : null}
        {!arcgisStyle && onCopyCoordinates ? (
          <>
            <span className="gis-map-popup-toolsep" aria-hidden />
            <button
              type="button"
              className="gis-map-popup-toolbtn"
              title={t(language, 'Copy coordinates', 'نسخ الإحداثيات')}
              aria-label={t(language, 'Copy coordinates', 'نسخ الإحداثيات')}
              onClick={e => {
                e.stopPropagation();
                onCopyCoordinates();
              }}
            >
              <i className="fa-solid fa-location-crosshairs" aria-hidden />
              {!compact ? <span>{t(language, 'Coords', 'إحداثيات')}</span> : null}
            </button>
          </>
        ) : null}
        {!arcgisStyle && onCopyAll ? (
          <>
            <span className="gis-map-popup-toolsep" aria-hidden />
            <button
              type="button"
              className="gis-map-popup-toolbtn"
              title={t(language, 'Copy all attributes', 'نسخ كل البيانات')}
              aria-label={t(language, 'Copy all attributes', 'نسخ كل البيانات')}
              onClick={e => {
                e.stopPropagation();
                onCopyAll();
              }}
            >
              <i className="fa-solid fa-copy" aria-hidden />
              {!compact ? <span>{t(language, 'Copy', 'نسخ')}</span> : null}
            </button>
          </>
        ) : null}
        {!arcgisStyle && onExportCsv ? (
          <>
            <span className="gis-map-popup-toolsep" aria-hidden />
            <button
              type="button"
              className="gis-map-popup-toolbtn"
              title={t(language, 'Export attributes as CSV', 'تصدير CSV')}
              aria-label={t(language, 'Export CSV', 'تصدير CSV')}
              onClick={e => {
                e.stopPropagation();
                onExportCsv();
              }}
            >
              <i className="fa-solid fa-file-csv" aria-hidden />
              {!compact ? <span>CSV</span> : null}
            </button>
          </>
        ) : null}
        {!arcgisStyle && onExport ? (
          <>
            <span className="gis-map-popup-toolsep" aria-hidden />
            <button
              type="button"
              className="gis-map-popup-toolbtn"
              title={t(language, 'Export feature as GeoJSON', 'تصدير GeoJSON')}
              aria-label={t(language, 'Export GeoJSON', 'تصدير GeoJSON')}
              disabled={exportDisabled}
              onClick={e => {
                e.stopPropagation();
                onExport();
              }}
            >
              <i className="fa-solid fa-file-export" aria-hidden />
              {!compact ? <span>{t(language, 'Export', 'تصدير')}</span> : null}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** ArcGIS-style footer: previous / next + "1 of N" count. */
export function SiMapFeatureInspectFooter({
  onPrevCandidate,
  onNextCandidate,
  candidateIndex = 0,
  candidateCount = 1,
}: SiMapFeatureInspectFooterProps) {
  const { direction, language } = useLanguage();
  if (candidateCount <= 1 || !onPrevCandidate || !onNextCandidate) return null;

  return (
    <div
      className="si-map-identify-footer"
      aria-label={t(language, 'Feature navigation', 'تنقل بين المعالم')}
      dir={direction}
    >
      <div className="si-map-identify-footer__nav">
        <button
          type="button"
          className="si-map-identify-footer__nav-btn"
          onClick={e => {
            e.stopPropagation();
            onPrevCandidate();
          }}
          aria-label={t(language, 'Previous feature', 'المعلم السابق')}
          title={t(language, 'Previous', 'السابق')}
        >
          <i className="fa-solid fa-chevron-left" aria-hidden />
        </button>
        <button
          type="button"
          className="si-map-identify-footer__nav-btn"
          onClick={e => {
            e.stopPropagation();
            onNextCandidate();
          }}
          aria-label={t(language, 'Next feature', 'المعلم التالي')}
          title={t(language, 'Next', 'التالي')}
        >
          <i className="fa-solid fa-chevron-right" aria-hidden />
        </button>
      </div>
      <div className="si-map-identify-footer__count">
        <i className="fa-solid fa-bars" aria-hidden />
        <span>
          {candidateIndex + 1} {t(language, 'of', 'من')} {candidateCount}
        </span>
      </div>
    </div>
  );
}
