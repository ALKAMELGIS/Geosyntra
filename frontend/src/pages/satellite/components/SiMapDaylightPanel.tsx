import { useEffect, useRef } from 'react';
import {
  clampDaylightMinutes,
  formatDaylightDateDisplay,
  matchSiDaylightPreset,
  SI_DAYLIGHT_MINUTES_MAX,
  SI_DAYLIGHT_DATE_DAYS_PER_SEC,
  SI_DAYLIGHT_DATE_PLAYBACK_LOOP_DAYS,
  SI_DAYLIGHT_PLAYBACK_LOOP,
  SI_DAYLIGHT_PLAYBACK_MINUTE_PRECISION,
  SI_DAYLIGHT_PLAYBACK_MINUTES_PER_SEC,
  normalizeDaylightMinutes,
  SI_DAYLIGHT_TIME_PRESETS,
  siMapDaylightAddDays,
  siMapDaylightTodayIso,
} from '../utils/siMapDaylight';
import type { SiMapWeatherSettings } from '../utils/siMapWeatherTypes';
import { SiMapDaylightArcSlider } from './SiMapDaylightArcSlider';
import './SiMapDaylightArcSlider.css';

export type SiMapDaylightPanelProps = {
  settings: SiMapWeatherSettings;
  onPatch: (partial: Partial<SiMapWeatherSettings>) => void;
  isLightTheme?: boolean;
};

export function SiMapDaylightPanel({ settings, onPatch, isLightTheme = false }: SiMapDaylightPanelProps) {
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const minutesRef = useRef(settings.daylightMinutes);
  const datePlayRafRef = useRef<number | null>(null);
  const datePlayLastTsRef = useRef<number | null>(null);
  const datePlayAccumRef = useRef(0);
  const datePlayStartRef = useRef<string | null>(null);
  const datePlayDaysAdvancedRef = useRef(0);
  const dateRef = useRef(settings.daylightDate);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const onPatchRef = useRef(onPatch);

  minutesRef.current = settings.daylightMinutes;
  dateRef.current = settings.daylightDate;
  onPatchRef.current = onPatch;

  useEffect(() => {
    if (!settings.daylightTimePlaying || !settings.sunPositionByDateTime) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTsRef.current = null;
      return;
    }

    const tick = (ts: number) => {
      const last = lastTsRef.current ?? ts;
      lastTsRef.current = ts;
      const dtSec = Math.min(0.05, (ts - last) / 1000);
      const advance = dtSec * SI_DAYLIGHT_PLAYBACK_MINUTES_PER_SEC;
      let next = minutesRef.current + advance;

      const daySpan = SI_DAYLIGHT_MINUTES_MAX + 1;
      if (next >= daySpan) {
        if (SI_DAYLIGHT_PLAYBACK_LOOP) {
          next = ((next % daySpan) + daySpan) % daySpan;
        } else {
          minutesRef.current = SI_DAYLIGHT_MINUTES_MAX;
          onPatchRef.current({
            daylightMinutes: SI_DAYLIGHT_MINUTES_MAX,
            daylightTimePlaying: false,
          });
          return;
        }
      }

      const precision = SI_DAYLIGHT_PLAYBACK_MINUTE_PRECISION;
      next = Math.round(next / precision) * precision;
      minutesRef.current = next;
      onPatchRef.current({ daylightMinutes: next });
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
    };
  }, [settings.daylightTimePlaying, settings.sunPositionByDateTime]);

  useEffect(() => {
    if (!settings.daylightDatePlaying || !settings.sunPositionByDateTime) {
      if (datePlayRafRef.current != null) {
        cancelAnimationFrame(datePlayRafRef.current);
        datePlayRafRef.current = null;
      }
      datePlayLastTsRef.current = null;
      datePlayAccumRef.current = 0;
      datePlayStartRef.current = null;
      datePlayDaysAdvancedRef.current = 0;
      return;
    }

    if (!datePlayStartRef.current) {
      datePlayStartRef.current = dateRef.current;
      datePlayDaysAdvancedRef.current = 0;
    }

    const tick = (ts: number) => {
      const last = datePlayLastTsRef.current ?? ts;
      datePlayLastTsRef.current = ts;
      const dt = Math.min(0.12, (ts - last) / 1000);
      datePlayAccumRef.current += dt * SI_DAYLIGHT_DATE_DAYS_PER_SEC;
      while (datePlayAccumRef.current >= 1) {
        datePlayAccumRef.current -= 1;
        datePlayDaysAdvancedRef.current += 1;
        if (datePlayDaysAdvancedRef.current >= SI_DAYLIGHT_DATE_PLAYBACK_LOOP_DAYS) {
          datePlayDaysAdvancedRef.current = 0;
          dateRef.current = datePlayStartRef.current ?? dateRef.current;
        } else {
          dateRef.current = siMapDaylightAddDays(dateRef.current, 1);
        }
        onPatchRef.current({ daylightDate: dateRef.current });
      }
      datePlayRafRef.current = requestAnimationFrame(tick);
    };

    datePlayRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (datePlayRafRef.current != null) cancelAnimationFrame(datePlayRafRef.current);
      datePlayRafRef.current = null;
      datePlayLastTsRef.current = null;
    };
  }, [settings.daylightDatePlaying, settings.sunPositionByDateTime]);

  useEffect(() => {
    if (settings.sunPositionByDateTime) return;
    if (!settings.daylightTimePlaying && !settings.daylightDatePlaying) return;
    onPatchRef.current({ daylightTimePlaying: false, daylightDatePlaying: false });
  }, [
    settings.sunPositionByDateTime,
    settings.daylightTimePlaying,
    settings.daylightDatePlaying,
  ]);

  const toggleTimePlay = () => {
    if (!settings.sunPositionByDateTime) return;
    const playing = !settings.daylightTimePlaying;
    const patch: Partial<SiMapWeatherSettings> = {
      daylightTimePlaying: playing,
      daylightDatePlaying: playing ? false : settings.daylightDatePlaying,
    };
    // Pressing play while parked at the end of the day restarts the sweep from 12:00 AM.
    if (playing && settings.daylightMinutes >= SI_DAYLIGHT_MINUTES_MAX - 0.5) {
      patch.daylightMinutes = 0;
    }
    onPatch(patch);
  };

  const toggleDatePlay = () => {
    if (!settings.sunPositionByDateTime) return;
    const playing = !settings.daylightDatePlaying;
    if (playing) {
      datePlayStartRef.current = settings.daylightDate;
      datePlayDaysAdvancedRef.current = 0;
      datePlayAccumRef.current = 0;
    }
    onPatch({
      daylightDatePlaying: playing,
      daylightTimePlaying: playing ? false : settings.daylightTimePlaying,
    });
  };

  const dateDisplay = formatDaylightDateDisplay(settings.daylightDate);
  const sunEnabled = settings.sunPositionByDateTime;
  const activePreset = matchSiDaylightPreset(settings.daylightMinutes);

  const openDatePicker = () => {
    const el = dateInputRef.current;
    if (!el || !sunEnabled) return;
    if (typeof el.showPicker === 'function') el.showPicker();
    else el.click();
  };

  return (
    <section
      className={`si-daylight-panel${isLightTheme ? ' si-daylight-panel--light' : ''}`}
      aria-label="Daylight"
    >
      <div className="si-daylight-panel__presets" role="group" aria-label="Time of day presets">
        {SI_DAYLIGHT_TIME_PRESETS.map(preset => (
          <button
            key={preset.id}
            type="button"
            className={
              'si-daylight-panel__preset' +
              (activePreset === preset.id ? ' si-daylight-panel__preset--active' : '')
            }
            disabled={!sunEnabled}
            onClick={() =>
              onPatch({
                daylightMinutes: preset.minutes,
                daylightTimePlaying: false,
              })
            }
            title={preset.label}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="si-daylight-panel__time-block">
        <SiMapDaylightArcSlider
          minutes={normalizeDaylightMinutes(settings.daylightMinutes)}
          disabled={!sunEnabled}
          playing={settings.daylightTimePlaying}
          onMinutesChange={m => {
            onPatch({
              daylightMinutes: clampDaylightMinutes(m),
              daylightTimePlaying: false,
            });
          }}
          onPlayToggle={toggleTimePlay}
        />
      </div>

      <div className="si-daylight-panel__date-block">
        <label
          className="si-daylight-panel__date-field"
          onClick={openDatePicker}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openDatePicker();
            }
          }}
        >
          <i className="fa-regular fa-calendar" aria-hidden />
          <span className="si-daylight-panel__date-text">{dateDisplay}</span>
          <input
            ref={dateInputRef}
            id="si-daylight-date"
            type="date"
            value={settings.daylightDate}
            disabled={!sunEnabled}
            onChange={e => onPatch({ daylightDate: e.target.value })}
            className="si-daylight-panel__date-input"
            aria-label="Date"
            tabIndex={-1}
          />
          <i className="fa-solid fa-chevron-down si-daylight-panel__date-chevron" aria-hidden />
        </label>
        <button
          type="button"
          className={`si-esri-slider__play${settings.daylightDatePlaying ? ' is-playing' : ''}`}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation();
            toggleDatePlay();
          }}
          disabled={!sunEnabled}
          aria-label={settings.daylightDatePlaying ? 'Pause date animation' : 'Play date animation'}
          title={settings.daylightDatePlaying ? 'Pause' : 'Play'}
        >
          <i className={`fa-solid ${settings.daylightDatePlaying ? 'fa-pause' : 'fa-play'}`} aria-hidden />
        </button>
      </div>

      <div className="si-daylight-panel__checks">
        <label className="si-weather-panel__check si-daylight-panel__check">
          <input
            type="checkbox"
            checked={settings.sunPositionByDateTime}
            onChange={e => onPatch({ sunPositionByDateTime: e.target.checked })}
          />
          <span>Sun position by date and time</span>
        </label>
        <label className="si-weather-panel__check si-daylight-panel__check">
          <input
            type="checkbox"
            checked={settings.daylightShadows}
            disabled={!sunEnabled}
            onChange={e => onPatch({ daylightShadows: e.target.checked })}
          />
          <span>Shadows</span>
        </label>
      </div>

      <button
        type="button"
        className="si-weather-panel__link-btn si-daylight-panel__reset"
        onClick={() =>
          onPatch({
            daylightMinutes: 720,
            daylightDate: siMapDaylightTodayIso(),
            sunPositionByDateTime: true,
            daylightShadows: true,
            daylightTimePlaying: false,
            daylightDatePlaying: false,
          })
        }
      >
        Reset daylight
      </button>
    </section>
  );
}
