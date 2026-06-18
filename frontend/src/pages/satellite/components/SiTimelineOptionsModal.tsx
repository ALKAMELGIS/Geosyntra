import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SI_TIMELINE_SLIDER_MODE_OPTIONS,
  type SiTimelineOptions,
} from '../utils/siTimelineOptions';
import './SiTimelineOptionsModal.css';

export type { SiTimelineOptions };

export type SiTimelineOptionsTab = 'start-end' | 'intervals' | 'playback' | 'play-rate';

type SiTimelineOptionsModalProps = {
  open: boolean;
  onClose: () => void;
  value: SiTimelineOptions;
  onApply: (next: SiTimelineOptions) => void;
};

const TABS: { id: SiTimelineOptionsTab; label: string }[] = [
  { id: 'start-end', label: 'Start and end points' },
  { id: 'intervals', label: 'Time intervals' },
  { id: 'playback', label: 'Playback position' },
  { id: 'play-rate', label: 'Play rate' },
];

const SLIDER_MODE_OPTIONS = SI_TIMELINE_SLIDER_MODE_OPTIONS;

const INTERVAL_UNITS = [
  { value: 'day' as const, label: 'Day' },
  { value: 'week' as const, label: 'Week' },
  { value: 'month' as const, label: 'Month' },
  { value: 'year' as const, label: 'Year' },
];

function IntervalLengthControls({
  draft,
  patch,
}: {
  draft: SiTimelineOptions;
  patch: (partial: Partial<SiTimelineOptions>) => void;
}) {
  return (
    <div className="si-tl-options-radio__controls">
      <div>
        <span className="si-tl-options-label">Count</span>
        <input
          type="number"
          className="si-tl-options-input"
          min={1}
          max={999}
          value={draft.intervalLength}
          onChange={e => patch({ intervalLength: Math.max(1, Number(e.target.value) || 1) })}
        />
      </div>
      <div>
        <span className="si-tl-options-label">Unit</span>
        <select
          className="si-tl-options-select"
          value={draft.intervalUnit}
          onChange={e => patch({ intervalUnit: e.target.value as SiTimelineOptions['intervalUnit'] })}
        >
          {INTERVAL_UNITS.map(u => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}


export function SiTimelineOptionsModal({ open, onClose, value, onApply }: SiTimelineOptionsModalProps) {
  const [draft, setDraft] = useState(value);
  const [activeTab, setActiveTab] = useState<SiTimelineOptionsTab>('start-end');
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const [tabScroll, setTabScroll] = useState({ canLeft: false, canRight: false });

  useEffect(() => {
    if (!open) return;
    setDraft(value);
    setActiveTab('start-end');
  }, [open, value]);

  const refreshTabScroll = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setTabScroll({
      canLeft: el.scrollLeft > 2,
      canRight: el.scrollLeft < max - 2,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    refreshTabScroll();
    const el = tabsRef.current;
    if (!el) return;
    el.addEventListener('scroll', refreshTabScroll);
    window.addEventListener('resize', refreshTabScroll);
    return () => {
      el.removeEventListener('scroll', refreshTabScroll);
      window.removeEventListener('resize', refreshTabScroll);
    };
  }, [open, refreshTabScroll, activeTab]);

  const scrollTabs = (dir: -1 | 1) => {
    tabsRef.current?.scrollBy({ left: dir * 120, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const patch = (partial: Partial<SiTimelineOptions>) => setDraft(prev => ({ ...prev, ...partial }));
  const activeHint = SLIDER_MODE_OPTIONS.find(o => o.value === draft.sliderMode)?.hint ?? '';

  return (
    <div className="si-tl-options-backdrop" role="presentation" onClick={onClose}>
      <div
        className="si-tl-options-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="si-tl-options-title"
        onClick={e => e.stopPropagation()}
      >
        <header className="si-tl-options-modal__head">
          <div className="si-tl-options-modal__head-copy">
            <p className="si-tl-options-modal__eyebrow">Timeline</p>
            <h2 id="si-tl-options-title" className="si-tl-options-modal__title">
              Time slider options
            </h2>
          </div>
          <button type="button" className="si-tl-options-modal__close" aria-label="Close" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </header>

        <div className="si-tl-options-tabs-wrap">
          <div ref={tabsRef} className="si-tl-options-tabs" role="tablist">
            {TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`si-tl-options-tab ${activeTab === tab.id ? 'si-tl-options-tab--active' : ''}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  requestAnimationFrame(refreshTabScroll);
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="si-tl-options-tabs-nav">
            <button type="button" disabled={!tabScroll.canLeft} aria-label="Scroll tabs left" onClick={() => scrollTabs(-1)}>
              ‹
            </button>
            <button type="button" disabled={!tabScroll.canRight} aria-label="Scroll tabs right" onClick={() => scrollTabs(1)}>
              ›
            </button>
          </div>
        </div>

        <div className="si-tl-options-body">
          {activeTab === 'start-end' ? (
            <>
              <div className="si-tl-options-field">
                <label className="si-tl-options-label" htmlFor="si-tl-slider-mode">
                  Time slider mode
                </label>
                <select
                  id="si-tl-slider-mode"
                  className="si-tl-options-select"
                  value={draft.sliderMode}
                  onChange={e => patch({ sliderMode: e.target.value as SiTimelineOptions['sliderMode'] })}
                >
                  {SLIDER_MODE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {activeHint ? <p className="si-tl-options-hint">{activeHint}</p> : null}
              </div>
              <div className="si-tl-options-grid-2">
                <div className="si-tl-options-field">
                  <label className="si-tl-options-label" htmlFor="si-tl-start-date">
                    Start date
                  </label>
                  <input
                    id="si-tl-start-date"
                    type="date"
                    className="si-tl-options-input"
                    value={draft.rangeStartDate}
                    max={draft.rangeEndDate || undefined}
                    onChange={e => patch({ rangeStartDate: e.target.value })}
                  />
                </div>
                <div className="si-tl-options-field">
                  <label className="si-tl-options-label" htmlFor="si-tl-start-time">
                    Start time
                  </label>
                  <input
                    id="si-tl-start-time"
                    type="time"
                    className="si-tl-options-input"
                    value={draft.rangeStartTime}
                    onChange={e => patch({ rangeStartTime: e.target.value })}
                  />
                </div>
                <div className="si-tl-options-field">
                  <label className="si-tl-options-label" htmlFor="si-tl-end-date">
                    End date
                  </label>
                  <input
                    id="si-tl-end-date"
                    type="date"
                    className="si-tl-options-input"
                    value={draft.rangeEndDate}
                    min={draft.rangeStartDate || undefined}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={e => patch({ rangeEndDate: e.target.value })}
                  />
                </div>
                <div className="si-tl-options-field">
                  <label className="si-tl-options-label" htmlFor="si-tl-end-time">
                    End time
                  </label>
                  <input
                    id="si-tl-end-time"
                    type="time"
                    className="si-tl-options-input"
                    value={draft.rangeEndTime}
                    onChange={e => patch({ rangeEndTime: e.target.value })}
                  />
                </div>
              </div>
            </>
          ) : null}

          {activeTab === 'intervals' ? (
            <>
              <label className="si-tl-options-radio">
                <input
                  type="radio"
                  name="si-tl-interval-strategy"
                  checked={draft.intervalStrategy === 'length'}
                  onChange={() => patch({ intervalStrategy: 'length' })}
                />
                <span className="si-tl-options-radio__label">Length of one interval</span>
              </label>
              {draft.intervalStrategy === 'length' ? <IntervalLengthControls draft={draft} patch={patch} /> : null}
              <label className="si-tl-options-radio">
                <input
                  type="radio"
                  name="si-tl-interval-strategy"
                  checked={draft.intervalStrategy === 'equal-steps'}
                  onChange={() => patch({ intervalStrategy: 'equal-steps' })}
                />
                <span className="si-tl-options-radio__label">Total time divided into equal steps</span>
              </label>
            </>
          ) : null}

          {activeTab === 'playback' ? (
            <>
              <label className="si-tl-options-radio">
                <input
                  type="radio"
                  name="si-tl-playback-start"
                  checked={draft.playbackStart === 'from-start'}
                  onChange={() => patch({ playbackStart: 'from-start' })}
                />
                <span className="si-tl-options-radio__label">Play from start time</span>
              </label>
              <label className="si-tl-options-radio">
                <input
                  type="radio"
                  name="si-tl-playback-start"
                  checked={draft.playbackStart === 'saved-position'}
                  onChange={() => patch({ playbackStart: 'saved-position' })}
                />
                <span className="si-tl-options-radio__label">Play from position saved with the map</span>
              </label>
            </>
          ) : null}

          {activeTab === 'play-rate' ? (
            <div className="si-tl-options-playrate">
              <p className="si-tl-options-label">Play rate</p>
              <div className="si-tl-options-playrate__labels">
                <span>Slow</span>
                <span>Fast</span>
              </div>
              <input
                type="range"
                className="si-tl-options-range"
                min={0}
                max={100}
                step={1}
                value={draft.playRate}
                onChange={e => patch({ playRate: Number(e.target.value) })}
                aria-valuetext={`${draft.playRate}%`}
              />
            </div>
          ) : null}
        </div>

        <footer className="si-tl-options-actions">
          <button type="button" className="si-tl-options-btn si-tl-options-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="si-tl-options-btn si-tl-options-btn--primary" onClick={() => onApply(draft)}>
            OK
          </button>
        </footer>
      </div>
    </div>
  );
}
