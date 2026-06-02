import type { SiTimelineTransitionMode } from './useSiWmsTimelineCrossfade';

export type SiTimeSliderMode =
  | 'instant'
  | 'time-window'
  | 'cumulative-from-start'
  | 'cumulative-from-end';

export type SiTimelineIntervalStrategy = 'length' | 'equal-steps';

export type SiTimelineIntervalUnit = 'day' | 'week' | 'month' | 'year';

export type SiTimelinePlaybackStart = 'from-start' | 'saved-position';

export type SiTimelineOptions = {
  sliderMode: SiTimeSliderMode;
  rangeStartDate: string;
  rangeStartTime: string;
  rangeEndDate: string;
  rangeEndTime: string;
  intervalStrategy: SiTimelineIntervalStrategy;
  intervalLength: number;
  intervalUnit: SiTimelineIntervalUnit;
  playbackStart: SiTimelinePlaybackStart;
  /** 0 = slow, 100 = fast */
  playRate: number;
};

const OPTIONS_KEY = 'geosyntra-si-timeline-options-v1';
const SAVED_POSITION_KEY = 'geosyntra-si-timeline-saved-position-v1';

export const SI_TIMELINE_PLAYBACK_MS_SLOW = 2800;
export const SI_TIMELINE_PLAYBACK_MS_FAST = 280;

export const DEFAULT_SI_TIMELINE_OPTIONS: SiTimelineOptions = {
  sliderMode: 'time-window',
  rangeStartDate: '',
  rangeStartTime: '00:00',
  rangeEndDate: '',
  rangeEndTime: '23:59',
  intervalStrategy: 'length',
  intervalLength: 1,
  intervalUnit: 'week',
  playbackStart: 'saved-position',
  playRate: 72,
};

export const SI_TIMELINE_SLIDER_MODE_OPTIONS: ReadonlyArray<{
  value: SiTimeSliderMode;
  label: string;
  hint: string;
}> = [
  {
    value: 'instant',
    label: 'Time instant',
    hint: 'Only the active focus day is requested from Sentinel Hub (step transition).',
  },
  {
    value: 'time-window',
    label: 'Time window',
    hint: 'Imagery from focus minus one interval through the focus day.',
  },
  {
    value: 'cumulative-from-start',
    label: 'Cumulative from start',
    hint: 'All imagery from series start through the focus day.',
  },
  {
    value: 'cumulative-from-end',
    label: 'Cumulative from end',
    hint: 'Imagery from the focus day through the series end.',
  },
];

export function playRateToPlaybackMs(playRate: number): number {
  const t = Math.max(0, Math.min(100, playRate)) / 100;
  return Math.round(
    SI_TIMELINE_PLAYBACK_MS_SLOW - t * (SI_TIMELINE_PLAYBACK_MS_SLOW - SI_TIMELINE_PLAYBACK_MS_FAST),
  );
}

export function playbackMsToPlayRate(ms: number): number {
  const span = SI_TIMELINE_PLAYBACK_MS_SLOW - SI_TIMELINE_PLAYBACK_MS_FAST;
  if (span <= 0) return DEFAULT_SI_TIMELINE_OPTIONS.playRate;
  const t = (SI_TIMELINE_PLAYBACK_MS_SLOW - Math.max(SI_TIMELINE_PLAYBACK_MS_FAST, ms)) / span;
  return Math.round(Math.max(0, Math.min(100, t * 100)));
}

export function sliderModeToTransition(mode: SiTimeSliderMode): SiTimelineTransitionMode {
  if (mode === 'instant') return 'step';
  return 'smooth';
}

export function transitionToSliderMode(mode: SiTimelineTransitionMode): SiTimeSliderMode {
  return mode === 'step' ? 'instant' : 'time-window';
}

/** Maps legacy persisted slider modes to the four Esri-style modes. */
export function migrateSiTimeSliderMode(raw: unknown): SiTimeSliderMode {
  if (raw === 'within-interval') return 'time-window';
  if (raw === 'progressive') return 'cumulative-from-start';
  if (
    raw === 'instant' ||
    raw === 'time-window' ||
    raw === 'cumulative-from-start' ||
    raw === 'cumulative-from-end'
  ) {
    return raw;
  }
  return DEFAULT_SI_TIMELINE_OPTIONS.sliderMode;
}

export function loadSiTimelineOptions(seed?: Partial<SiTimelineOptions>): SiTimelineOptions {
  const base = { ...DEFAULT_SI_TIMELINE_OPTIONS, ...seed };
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<SiTimelineOptions>;
    return {
      ...base,
      ...parsed,
      sliderMode: migrateSiTimeSliderMode(parsed.sliderMode ?? base.sliderMode),
    };
  } catch {
    return base;
  }
}

export function saveSiTimelineOptions(options: SiTimelineOptions): void {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
  } catch {
    /* ignore */
  }
}

export function saveTimelineSavedPosition(isoDate: string): void {
  const iso = isoDate.trim().slice(0, 10);
  if (!iso) return;
  try {
    localStorage.setItem(SAVED_POSITION_KEY, iso);
  } catch {
    /* ignore */
  }
}

export function loadTimelineSavedPosition(): string | null {
  try {
    const v = localStorage.getItem(SAVED_POSITION_KEY)?.trim().slice(0, 10);
    return v || null;
  } catch {
    return null;
  }
}

export function mergeTimelineOptionsWithLiveRange(
  base: SiTimelineOptions,
  params: {
    startIso: string;
    endIso: string;
    transitionMode: SiTimelineTransitionMode;
    playbackMs: number;
  },
): SiTimelineOptions {
  return {
    ...base,
    rangeStartDate: params.startIso.slice(0, 10) || base.rangeStartDate,
    rangeEndDate: params.endIso.slice(0, 10) || base.rangeEndDate,
    sliderMode: transitionToSliderMode(params.transitionMode),
    playRate: playbackMsToPlayRate(params.playbackMs),
  };
}
