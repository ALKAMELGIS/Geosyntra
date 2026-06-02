import { useCallback, useEffect, useRef, useState } from 'react';
import {
  daylightMinutesToPercent,
  formatDaylightMinutesLabel,
  percentToDaylightMinutes,
  SI_DAYLIGHT_MINUTES_MAX,
  SI_DAYLIGHT_TICKS,
  SI_MAP_DAYLIGHT_TZ_LABEL,
} from '../utils/siMapDaylight';
import './SiMapDaylightArcSlider.css';

export type SiMapDaylightArcSliderProps = {
  minutes: number;
  disabled?: boolean;
  playing?: boolean;
  onMinutesChange: (minutes: number) => void;
  onPlayToggle?: () => void;
};

export function SiMapDaylightArcSlider({
  minutes,
  disabled = false,
  playing = false,
  onMinutesChange,
  onPlayToggle,
}: SiMapDaylightArcSliderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const pct = daylightMinutesToPercent(minutes);
  const timeLabel = formatDaylightMinutesLabel(minutes);
  const timePart = timeLabel.replace(` ${SI_MAP_DAYLIGHT_TZ_LABEL}`, '');

  // Emit a DOM event so non-React listeners can react to time changes:
  //   slider.addEventListener('slider-time-change', e => console.log(e.detail.value))
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    el.dispatchEvent(
      new CustomEvent('slider-time-change', {
        bubbles: true,
        detail: {
          value: Math.round(minutes),
          minutes,
          percent: pct,
          valueText: timeLabel,
        },
      }),
    );
  }, [minutes, pct, timeLabel]);

  const setFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || disabled) return;
      const rect = track.getBoundingClientRect();
      if (rect.width < 4) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onMinutesChange(percentToDaylightMinutes(ratio * 100));
    },
    [disabled, onMinutesChange],
  );

  const onTrackPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      setDragging(true);
      setFromClientX(e.clientX);
      const onMove = (ev: PointerEvent) => setFromClientX(ev.clientX);
      const onUp = () => {
        setDragging(false);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [disabled, setFromClientX],
  );

  const onThumbPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.stopPropagation();
      e.preventDefault();
      const thumb = e.currentTarget;
      try {
        thumb.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setDragging(true);
      const onMove = (ev: PointerEvent) => setFromClientX(ev.clientX);
      const finish = (ev: PointerEvent) => {
        setDragging(false);
        try {
          thumb.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    },
    [disabled, setFromClientX],
  );

  const primaryTicks = SI_DAYLIGHT_TICKS.filter(t => t.kind === 'primary');

  return (
    <div
      ref={rootRef}
      className={`si-esri-slider${disabled ? ' si-esri-slider--disabled' : ''}${dragging ? ' is-dragging' : ''}`}
    >
      <p className="si-esri-slider__clock" aria-live="polite">
        <span className="si-esri-slider__clock-time">{timePart}</span>
        <span className="si-esri-slider__clock-tz">{SI_MAP_DAYLIGHT_TZ_LABEL}</span>
      </p>

      <div className="si-esri-slider__row">
        <div className="si-esri-slider__widget" role="group" aria-label="Time of day">
          <div className="si-esri-slider__track-wrap">
            <div ref={trackRef} className="si-esri-slider__track" onPointerDown={onTrackPointerDown}>
              <div className="si-esri-slider__segment si-esri-slider__segment--fill" style={{ width: `${pct}%` }} />
              <div
                className="si-esri-slider__segment si-esri-slider__segment--rest"
                style={{ left: `${pct}%`, width: `${100 - pct}%` }}
              />

              <div className="si-esri-slider__tick-marks" aria-hidden>
                {SI_DAYLIGHT_TICKS.map(t => (
                  <span
                    key={`${t.kind}-${t.minutes}`}
                    className={
                      t.kind === 'primary'
                        ? 'si-esri-slider__tick si-esri-slider__tick--primary'
                        : 'si-esri-slider__tick si-esri-slider__tick--secondary'
                    }
                    style={{ left: `${daylightMinutesToPercent(t.minutes)}%` }}
                  />
                ))}
              </div>

              <div
                className="si-esri-slider__anchor"
                role="slider"
                aria-valuemin={0}
                aria-valuemax={SI_DAYLIGHT_MINUTES_MAX}
                aria-valuenow={Math.round(minutes)}
                aria-valuetext={timeLabel}
                style={{ left: `${pct}%` }}
                onPointerDown={onThumbPointerDown}
              >
                <span className="si-esri-slider__thumb" />
              </div>
            </div>
          </div>

          <div className="si-esri-slider__tick-labels" aria-hidden>
            {primaryTicks.map(t => (
              <span
                key={t.minutes}
                className="si-esri-slider__tick-label"
                style={{ left: `${daylightMinutesToPercent(t.minutes)}%` }}
              >
                {t.label}
              </span>
            ))}
          </div>
        </div>

        {onPlayToggle ? (
          <button
            type="button"
            className={`si-esri-slider__play${playing ? ' is-playing' : ''}`}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              onPlayToggle();
            }}
            disabled={disabled}
            aria-label={playing ? 'Pause daylight animation' : 'Play daylight animation'}
            title={playing ? 'Pause' : 'Play'}
          >
            <i className={`fa-solid ${playing ? 'fa-pause' : 'fa-play'}`} aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}
