import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { WmsAoiEvalProfile } from '../../../lib/sentinelHubWmsAoiClip';
import { siStopsToVerticalCssGradient, type IndexRampStop } from '../../../lib/siWmsIndexClassificationRamp';
import { clampLeftDockLegendOffset, siMapLeftPopoutFixedPosition } from '../utils/siMapFloatingPanelLayout';
import { SI_WMS_SPECTRAL_CLASS_COUNT, siWmsLegendRowsFromStops } from '../utils/siWmsSpectralClassification';
import {
  siWmsIndexLegendClassLabels,
  siWmsIndexLegendHint,
  siWmsIndexLegendInterpretation,
  siWmsIndexLegendScaleFromStops,
} from '../utils/siWmsLiveIndexLegendConfig';
import { formatStatFixed } from '../utils/weeklyCompositeStats';
import type { SiWmsSpectralLegendContext } from './SiWmsIndexClassificationLegend';

export type SiWmsUnifiedIndexLegendMode = 'live' | 'scientific';

const COMPOSITE_RGB: Record<
  'true_color' | 'false_color' | 'swir' | 'generic_rgb',
  { badge: string; rows: Array<{ ch: string; band: string; hex: string }> }
> = {
  true_color: {
    badge: 'RGB',
    rows: [
      { ch: 'R', band: 'B04 Red', hex: '#dc2626' },
      { ch: 'G', band: 'B03 Green', hex: '#16a34a' },
      { ch: 'B', band: 'B02 Blue', hex: '#2563eb' },
    ],
  },
  generic_rgb: {
    badge: 'RGB',
    rows: [
      { ch: 'R', band: 'B04 Red', hex: '#dc2626' },
      { ch: 'G', band: 'B03 Green', hex: '#16a34a' },
      { ch: 'B', band: 'B02 Blue', hex: '#2563eb' },
    ],
  },
  false_color: {
    badge: 'FCIR',
    rows: [
      { ch: 'R', band: 'B08 NIR', hex: '#7c2d12' },
      { ch: 'G', band: 'B04 Red', hex: '#ca8a04' },
      { ch: 'B', band: 'B03 Green', hex: '#166534' },
    ],
  },
  swir: {
    badge: 'SWIR',
    rows: [
      { ch: 'R', band: 'B12', hex: '#ea580c' },
      { ch: 'G', band: 'B8A', hex: '#ca8a04' },
      { ch: 'B', band: 'B04', hex: '#2563eb' },
    ],
  },
};

function formatRange(from: number, to: number): string {
  const a = Number(from.toFixed(3));
  const b = Number(to.toFixed(3));
  return `${a} – ${b}`;
}

export type SiWmsUnifiedIndexLegendProps = {
  mode: SiWmsUnifiedIndexLegendMode;
  profile: WmsAoiEvalProfile;
  layerLabel: string;
  context: SiWmsSpectralLegendContext;
  classifiedStops: readonly IndexRampStop[] | null;
  maxRows?: number;
  customSymbology?: boolean;
  offsetStorageKey: string;
  ariaLabel?: string;
};

export function SiWmsUnifiedIndexLegend({
  mode,
  profile,
  layerLabel,
  context,
  classifiedStops,
  maxRows = SI_WMS_SPECTRAL_CLASS_COUNT,
  customSymbology = false,
  offsetStorageKey,
  ariaLabel = 'Spectral layer legend',
}: SiWmsUnifiedIndexLegendProps) {
  const dockRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const [legendOffset, setLegendOffset] = useState({ x: 0, y: 0 });
  const [legendDragging, setLegendDragging] = useState(false);
  offsetRef.current = legendOffset;

  useEffect(() => {
    offsetRef.current = { x: 0, y: 0 };
    setLegendOffset({ x: 0, y: 0 });
  }, [profile, layerLabel, mode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(offsetStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { x?: number; y?: number };
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
        const c = clampLeftDockLegendOffset(parsed.x, parsed.y);
        offsetRef.current = c;
        setLegendOffset(c);
      }
    } catch {
      /* ignore */
    }
  }, [offsetStorageKey, profile, layerLabel, mode]);

  useLayoutEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const fixed = siMapLeftPopoutFixedPosition('spectral-legend', 300);
    dock.style.top = `${fixed.top}px`;
    dock.style.left = `${fixed.left}px`;
  }, [profile, layerLabel, mode]);

  const onLegendHeadPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      const start = { ox: offsetRef.current.x, oy: offsetRef.current.y, cx: e.clientX, cy: e.clientY };
      setLegendDragging(true);
      const head = e.currentTarget;
      try {
        head.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      const onMove = (ev: PointerEvent) => {
        setLegendOffset(
          clampLeftDockLegendOffset(start.ox + (ev.clientX - start.cx), start.oy + (ev.clientY - start.cy)),
        );
      };

      const finish = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        try {
          head.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        setLegendDragging(false);
        setLegendOffset(prev => {
          const c = clampLeftDockLegendOffset(prev.x, prev.y);
          try {
            localStorage.setItem(offsetStorageKey, JSON.stringify(c));
          } catch {
            /* ignore */
          }
          return c;
        });
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    },
    [offsetStorageKey],
  );

  const compositeKey =
    profile === 'true_color' || profile === 'false_color' || profile === 'swir' || profile === 'generic_rgb'
      ? profile
      : null;
  const composite = compositeKey ? COMPOSITE_RGB[compositeKey] : null;

  const gradient = useMemo(
    () => (classifiedStops && classifiedStops.length >= 2 ? siStopsToVerticalCssGradient(classifiedStops) : ''),
    [classifiedStops],
  );
  const rows = useMemo(
    () => (classifiedStops ? siWmsLegendRowsFromStops(classifiedStops, maxRows) : []),
    [classifiedStops, maxRows],
  );
  const classLabels = useMemo(
    () => (classifiedStops ? siWmsIndexLegendClassLabels(profile, rows.length) : null),
    [profile, rows.length, classifiedStops],
  );
  const hint = useMemo(
    () =>
      siWmsIndexLegendHint({
        profile,
        classCount: maxRows,
        customSymbology,
        mode,
      }),
    [profile, maxRows, customSymbology, mode],
  );
  const interpretation = useMemo(
    () => (classifiedStops ? siWmsIndexLegendInterpretation(profile, classifiedStops) : null),
    [profile, classifiedStops],
  );
  const scale = useMemo(
    () => (classifiedStops ? siWmsIndexLegendScaleFromStops(classifiedStops) : null),
    [classifiedStops],
  );

  const seriesStart = (context.seriesStartIso ?? '').trim().slice(0, 10);
  const seriesEnd = (context.seriesEndIso ?? '').trim().slice(0, 10);
  const seriesLine =
    seriesStart && seriesEnd
      ? `${seriesStart} → ${seriesEnd}`
      : seriesEnd
        ? seriesEnd
        : seriesStart
          ? seriesStart
          : null;

  const badge = composite ? composite.badge : mode === 'live' ? 'LIVE' : 'SCIENTIFIC';

  return (
    <div ref={dockRef} className="si-wms-index-class-legend-dock" dir="ltr">
      <div
        className={`si-wms-index-class-legend si-wms-index-class-legend--unified si-wms-index-class-legend--${mode}${
          legendDragging ? ' si-wms-index-class-legend--dragging' : ''
        }`}
        role="region"
        aria-label={ariaLabel}
        style={{ transform: `translate(${legendOffset.x}px, ${legendOffset.y}px)` }}
      >
        <div
          className="si-wms-index-class-legend__head si-wms-index-class-legend__head--draggable"
          onPointerDown={onLegendHeadPointerDown}
          title="Drag header to move legend"
        >
          <span className="si-wms-index-class-legend__drag-icon" aria-hidden>
            <i className="fa-solid fa-grip-lines" />
          </span>
          <span className="si-wms-index-class-legend__title">{layerLabel}</span>
          <span
            className={`si-wms-index-class-legend__badge${
              composite
                ? ' si-wms-index-class-legend__badge--composite'
                : mode === 'live'
                  ? ' si-wms-index-class-legend__badge--live'
                  : ''
            }`}
          >
            {badge}
          </span>
        </div>

        <div className="si-wms-index-class-legend__live" aria-live="polite">
          <div className="si-wms-index-class-legend__live-row">
            <span className="si-wms-index-class-legend__live-k">Imagery</span>
            <span className="si-wms-index-class-legend__live-v">{context.imageryDateIso}</span>
            {context.timelinePlaying ? (
              <span className="si-wms-index-class-legend__live-playing">Playing</span>
            ) : null}
          </div>
          {context.satelliteProviderName ? (
            <div className="si-wms-index-class-legend__live-row">
              <span className="si-wms-index-class-legend__live-k">Provider</span>
              <span className="si-wms-index-class-legend__live-v">
                {context.satelliteProviderName}
                {context.providerResolutionLabel ? ` · ${context.providerResolutionLabel}` : ''}
              </span>
            </div>
          ) : null}
          {seriesLine ? (
            <div className="si-wms-index-class-legend__live-row">
              <span className="si-wms-index-class-legend__live-k">Series</span>
              <span className="si-wms-index-class-legend__live-v">{seriesLine}</span>
            </div>
          ) : null}
          {seriesEnd ? (
            <div className="si-wms-index-class-legend__live-row">
              <span className="si-wms-index-class-legend__live-k">End date</span>
              <span className="si-wms-index-class-legend__live-v">{seriesEnd}</span>
            </div>
          ) : null}
          {context.temporal ? (
            <div className="si-wms-index-class-legend__live-row si-wms-index-class-legend__live-row--stats">
              <span className="si-wms-index-class-legend__live-k">Window</span>
              <span className="si-wms-index-class-legend__live-v">
                {context.temporal.weekStart} – {context.temporal.weekEnd}
              </span>
            </div>
          ) : null}
          {context.temporal ? (
            <div className="si-wms-index-class-legend__stats">
              <span>min {formatStatFixed(context.temporal.min, 3)}</span>
              <span>mean {formatStatFixed(context.temporal.mean, 3)}</span>
              <span>max {formatStatFixed(context.temporal.max, 3)}</span>
            </div>
          ) : null}
        </div>

        {composite ? (
          <>
            <p className="si-wms-index-class-legend__hint">
              RGB composite (Sentinel-2). Colors follow band assignment; map gain is fixed in the WMS script.
            </p>
            <div className="si-wms-index-class-legend__body si-wms-index-class-legend__body--composite">
              <div className="si-wms-index-class-legend__composite-strip" aria-hidden>
                {composite.rows.map(r => (
                  <span key={r.ch} className="si-wms-index-class-legend__composite-seg" style={{ background: r.hex }} />
                ))}
              </div>
              <div className="si-wms-index-class-legend__rows">
                {composite.rows.map(r => (
                  <div key={r.ch} className="si-wms-index-class-legend__row">
                    <span className="si-wms-index-class-legend__swatch" style={{ background: r.hex }} />
                    <span className="si-wms-index-class-legend__range">
                      {r.ch} · {r.band}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : classifiedStops && gradient && rows.length > 0 ? (
          <>
            <p className="si-wms-index-class-legend__hint">{hint}</p>
            {scale && interpretation ? (
              <div className="si-wms-index-class-legend__interpret" aria-label="Value scale">
                <span className="si-wms-index-class-legend__interpret-lo">{interpretation.low}</span>
                <span className="si-wms-index-class-legend__interpret-mid">{interpretation.medium}</span>
                <span className="si-wms-index-class-legend__interpret-hi">{interpretation.high}</span>
              </div>
            ) : null}
            <div className="si-wms-index-class-legend__body">
              <div className="si-wms-index-class-legend__bar" style={{ backgroundImage: gradient }} aria-hidden />
              <div className="si-wms-index-class-legend__rows">
                {rows.map((row, i) => (
                  <div key={`${row.from}-${row.to}-${i}`} className="si-wms-index-class-legend__row">
                    <span className="si-wms-index-class-legend__swatch" style={{ background: row.color }} />
                    <span className="si-wms-index-class-legend__range">
                      {formatRange(row.from, row.to)}
                      {classLabels?.[i] ? (
                        <span className="si-wms-index-class-legend__class-label">{classLabels[i]}</span>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
