import { useEffect, useRef } from 'react';
import {
  clampDaylightMinutes,
  formatDaylightDateDisplay,
  matchSiDaylightPreset,
  SI_DAYLIGHT_MINUTES_MAX,
  SI_DAYLIGHT_PLAYBACK_LOOP,
  SI_DAYLIGHT_PLAYBACK_MINUTES_PER_SEC,
  SI_DAYLIGHT_TIME_PRESETS,
  siMapDaylightAddDays,
  siMapDaylightTodayIso,
} from '../utils/siMapDaylight';
import type { SiMapWeatherSettings } from '../utils/siMapWeatherTypes';
import { SiMapDaylightArcSlider } from './SiMapDaylightArcSlider';
import './SiMapDaylightArcSlider.css';

const DATE_PLAY_MS = 280;

export type SiMapDaylightPanelProps = {
  settings: SiMapWeatherSettings;
  onPatch: (partial: Partial<SiMapWeatherSettings>) => void;
  isLightTheme?: boolean;
};

export function SiMapDaylightPanel({ settings, onPatch, isLightTheme = false }: SiMapDaylightPanelProps) {
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const minutesRef = useRef(settings.daylightMinutes);
  const datePlayRef = useRef<number | null>(null);
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
      const dtSec = Math.min(0.1, (ts - last) / 1000);
      const advance = dtSec * SI_DAYLIGHT_PLAYBACK_MINUTES_PER_SEC;
      let next = minutesRef.current + advance;

      if (next >= SI_DAYLIGHT_MINUTES_MAX) {
        if (SI_DAYLIGHT_PLAYBACK_LOOP) {
          next %= SI_DAYLIGHT_MINUTES_MAX;
        } else {
          // Stop cleanly at the end of the day (play icon returns to ▶).
          minutesRef.current = SI_DAYLIGHT_MINUTES_MAX;
          onPatchRef.current({
            daylightMinutes: SI_DAYLIGHT_MINUTES_MAX,
            daylightTimePlaying: false,
          });
          return;
        }
      }

      minutesRef.current = next;
      onPatchRef.current({ daylightMinutes: Math.round(next * 10) / 10 });
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
    if (!settings.daylightDatePlaying) {
      if (datePlayRef.current != null) {
        window.clearInterval(datePlayRef.current);
        datePlayRef.current = null;
      }
      return;
    }
    datePlayRef.current = window.setInterval(() => {
      onPatchRef.current({ daylightDate: siMapDaylightAddDays(dateRef.current, 1) });
    }, DATE_PLAY_MS);
    return () => {
      if (datePlayRef.current != null) window.clearInterval(datePlayRef.current);
    };
  }, [settings.daylightDatePlaying]);

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
          minutes={clampDaylightMinutes(settings.daylightMinutes)}
          disabled={!sunEnabled}
          playing={settings.daylightTimePlaying}
          onMinutesChange={m => onPatch({ daylightMinutes: clampDaylightMinutes(m) })}
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
