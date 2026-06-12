import { useMemo, useRef, type ReactNode } from 'react';
import { useLanguage } from '@/lib/i18n';
import type { SiPopupInspectPayload } from '../../../lib/siLayerPopupInspect';
import { SiAttributePopupPanel } from './SiAttributePopupPanel';
import './SiMapFeaturePopup.css';

export type SiMapFeaturePopupProps = {
  layerName: string;
  featureName: string;
  lng: number;
  lat: number;
  areaName?: string;
  country?: string;
  rows: { label: string; value: string }[];
  inspect?: SiPopupInspectPayload | null;
  accentColor?: string;
  variant?: 'map' | 'side' | 'docked';
  pinned?: boolean;
  collapsed?: boolean;
  closing?: boolean;
  editMode?: boolean;
  toolbar?: ReactNode;
  footer?: ReactNode;
  popupRef?: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onTogglePin?: () => void;
  onToggleCollapse?: () => void;
  onEditSave?: (updates: Record<string, string>) => void;
  onEditCancel?: () => void;
  onZoomTo?: () => void;
  onCopyAll?: () => void;
  onExportCsv?: () => void;
};

export function SiMapFeaturePopup({
  layerName,
  featureName: _featureName,
  lng: _lng,
  lat: _lat,
  areaName: _areaName,
  country: _country,
  rows,
  inspect,
  accentColor = '#22c55e',
  variant = 'map',
  pinned = false,
  collapsed = false,
  closing = false,
  editMode = false,
  toolbar: _toolbar,
  footer: _footer,
  popupRef,
  onClose,
  onTogglePin: _onTogglePin,
  onToggleCollapse: _onToggleCollapse,
  onEditSave,
  onEditCancel,
  onZoomTo,
  onCopyAll,
  onExportCsv,
}: SiMapFeaturePopupProps) {
  const internalRef = useRef<HTMLDivElement | null>(null);
  const rootRef = popupRef ?? internalRef;
  const { direction, language } = useLanguage();

  const titleLayer = useMemo(
    () => layerName.trim() || 'Layer',
    [layerName],
  );

  const dir = direction;
  const t = (en: string, ar: string) => (language === 'ar' ? ar : en);

  return (
    <div
      ref={rootRef}
      className={
        'si-map-feature-popup si-map-feature-popup--glass si-geo-ai-inspect-card--map-anchor' +
        (variant !== 'map' ? ` si-map-feature-popup--${variant}` : '') +
        (pinned ? ' si-map-feature-popup--pinned' : '') +
        (collapsed ? ' si-map-feature-popup--collapsed' : '') +
        (closing ? ' si-map-feature-popup--closing' : '')
      }
      role="dialog"
      aria-label={`${t('Layer attributes', 'سمات الطبقة')}: ${titleLayer}`}
      dir={dir}
      style={{ ['--si-popup-accent' as string]: accentColor }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="si-map-feature-popup__head">
        <div className="si-map-feature-popup__titles">
          <div className="si-map-feature-popup__layer" title={titleLayer}>
            {titleLayer}
          </div>
        </div>
        <button
          type="button"
          className="si-map-feature-popup__icon-btn"
          onClick={onClose}
          aria-label={t('Close popup', 'إغلاق')}
          title={t('Close', 'إغلاق')}
        >
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </div>

      <div className="si-map-feature-popup__body">
        <SiAttributePopupPanel
          rows={rows}
          inspect={inspect}
          editMode={editMode}
          layout="glass"
          onEditSave={onEditSave}
          onEditCancel={onEditCancel}
          onZoomTo={onZoomTo}
          onCopyAll={onCopyAll}
          onExportCsv={onExportCsv}
        />
      </div>

      <div className="si-map-feature-popup__arrow" aria-hidden />
    </div>
  );
}