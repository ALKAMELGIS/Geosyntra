import { useCallback, useEffect, useRef } from 'react';
import './SiLayerSwipeChrome.css';

export type SiLayerSwipeLayerOption = { id: string; label: string };

/** Swipe comparison geometry (matches common GIS swipe UX). */
export type SiLayerSwipeStyleKind = 'vertical-bar' | 'horizontal-bar' | 'spyglass';

export type SiLayerSwipeChromeProps = {
  open: boolean;
  splitPct: number;
  onSplitPct: (pct: number) => void;
  leftLayerId: string;
  rightLayerId: string;
  onLeftLayerId: (id: string) => void;
  onRightLayerId: (id: string) => void;
  layerOptions: SiLayerSwipeLayerOption[];
  onClose: () => void;
  disabled?: boolean;
  disabledHint?: string;
  /**
   * `overlay` — full-map drag handle + vertical divider (legacy).
   * `toolbox` — compact panel for Map toolbox: layer picks + range slider only (no on-map line/handle).
   */
  layout?: 'overlay' | 'toolbox';
  swipeStyle: SiLayerSwipeStyleKind;
  onSwipeStyle: (style: SiLayerSwipeStyleKind) => void;
  /** Swap which Sentinel product is shown on each side of the divider / outside the lens. */
  onSwapDirection: () => void;
  barColor: string;
  onBarColor: (hex: string) => void;
  /** Spyglass lens center and radius (percent of map box; radius uses circle() semantics). */
  spyXPct: number;
  spyYPct: number;
  spyRadiusPct: number;
  onSpyXPct: (v: number) => void;
  onSpyYPct: (v: number) => void;
  onSpyRadiusPct: (v: number) => void;
};

export function SiLayerSwipeChrome({
  open,
  splitPct,
  onSplitPct,
  leftLayerId,
  rightLayerId,
  onLeftLayerId,
  onRightLayerId,
  layerOptions,
  onClose,
  disabled = false,
  disabledHint,
  layout = 'overlay',
  swipeStyle,
  onSwipeStyle,
  onSwapDirection,
  barColor,
  onBarColor,
  spyXPct,
  spyYPct,
  spyRadiusPct,
  onSpyXPct,
  onSpyYPct,
  onSpyRadiusPct,
}: SiLayerSwipeChromeProps) {
  const dragRef = useRef(false);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = hostRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const w = Math.max(1, r.width);
      const x = clientX - r.left;
      const pct = Math.round(Math.min(95, Math.max(5, (x / w) * 100)) * 10) / 10;
      onSplitPct(pct);
    },
    [onSplitPct],
  );

  useEffect(() => {
    if (!open || layout !== 'overlay') return;
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      setFromClientX(e.clientX);
    };
    const onUp = () => {
      dragRef.current = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [open, layout, setFromClientX]);

  if (!open) return null;

  const leftLabel = layerOptions.find(o => o.id === leftLayerId)?.label ?? 'Left';
  const rightLabel = layerOptions.find(o => o.id === rightLayerId)?.label ?? 'Right';
  const edgeA = swipeStyle === 'horizontal-bar' ? 'Top' : 'Left';
  const edgeB = swipeStyle === 'horizontal-bar' ? 'Bottom' : 'Right';

  const rootClass =
    'si-layer-swipe-chrome' + (layout === 'toolbox' ? ' si-layer-swipe-chrome--toolbox' : '');

  const splitLabel =
    swipeStyle === 'spyglass'
      ? 'Lens radius'
      : swipeStyle === 'horizontal-bar'
        ? 'Divider position (top ↔ bottom)'
        : 'Divider position (left ↔ right)';

  return (
    <div className={rootClass} ref={layout === 'overlay' ? hostRef : undefined} aria-label="Layer swipe compare">
      <div className={'si-layer-swipe-chrome__hud' + (layout === 'toolbox' ? ' si-layer-swipe-chrome__hud--toolbox' : '')}>
        <div className="si-layer-swipe-chrome__row">
          <span className="si-layer-swipe-chrome__kicker">Swipe</span>
          <button type="button" className="si-layer-swipe-chrome__close" title="Exit swipe" aria-label="Exit swipe compare" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </div>
        {disabled ? (
          <p className="si-layer-swipe-chrome__hint">{disabledHint ?? 'Swipe is unavailable for this map mode.'}</p>
        ) : (
          <>
            {layout === 'toolbox' ? (
              <fieldset className="si-layer-swipe-chrome__styles" aria-label="Choose a style for the swipe tool">
                <legend className="si-layer-swipe-chrome__styles-legend">Swipe style</legend>
                <label className="si-layer-swipe-chrome__style-row">
                  <input
                    type="radio"
                    name="si-layer-swipe-style"
                    checked={swipeStyle === 'vertical-bar'}
                    onChange={() => onSwipeStyle('vertical-bar')}
                  />
                  <span>Vertical bar</span>
                </label>
                <label className="si-layer-swipe-chrome__style-row">
                  <input
                    type="radio"
                    name="si-layer-swipe-style"
                    checked={swipeStyle === 'horizontal-bar'}
                    onChange={() => onSwipeStyle('horizontal-bar')}
                  />
                  <span>Horizontal bar</span>
                </label>
                <label className="si-layer-swipe-chrome__style-row">
                  <input
                    type="radio"
                    name="si-layer-swipe-style"
                    checked={swipeStyle === 'spyglass'}
                    onChange={() => onSwipeStyle('spyglass')}
                  />
                  <span>Spyglass</span>
                </label>
              </fieldset>
            ) : null}

            <div
              className={
                'si-layer-swipe-chrome__picks' + (layout === 'toolbox' ? ' si-layer-swipe-chrome__picks--toolbox' : '')
              }
            >
              <label className="si-layer-swipe-chrome__pick">
                <span className="si-layer-swipe-chrome__pick-label">{edgeA} layer</span>
                <select
                  className="si-layer-swipe-chrome__select"
                  value={leftLayerId}
                  onChange={e => onLeftLayerId(e.target.value)}
                  aria-label={`${edgeA} layer`}
                >
                  {layerOptions.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="si-layer-swipe-chrome__pick">
                <span className="si-layer-swipe-chrome__pick-label">{edgeB} layer</span>
                <select
                  className="si-layer-swipe-chrome__select"
                  value={rightLayerId}
                  onChange={e => onRightLayerId(e.target.value)}
                  aria-label={`${edgeB} layer`}
                >
                  {layerOptions.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="si-layer-swipe-chrome__legend" dir="ltr">
              <span className="si-layer-swipe-chrome__legend-side si-layer-swipe-chrome__legend-side--l">{leftLabel}</span>
              <span className="si-layer-swipe-chrome__legend-sep" aria-hidden>
                |
              </span>
              <span className="si-layer-swipe-chrome__legend-side si-layer-swipe-chrome__legend-side--r">{rightLabel}</span>
            </p>

            {layout === 'toolbox' ? (
              <div className="si-layer-swipe-chrome__tool-actions">
                <button type="button" className="si-layer-swipe-chrome__btn" onClick={onSwapDirection} title="Swap the two layers">
                  <i className="fa-solid fa-right-left" aria-hidden />
                  <span>Direction</span>
                </button>
                <label className="si-layer-swipe-chrome__color-field">
                  <span className="si-layer-swipe-chrome__color-label">Bar / lens color</span>
                  <span className="si-layer-swipe-chrome__color-inputs">
                    <input
                      type="color"
                      className="si-layer-swipe-chrome__color-well"
                      value={barColor.length === 7 ? barColor : '#f8fafc'}
                      aria-label="Set bar or lens frame color"
                      onChange={e => onBarColor(e.target.value)}
                    />
                    <input
                      type="text"
                      className="si-layer-swipe-chrome__color-hex"
                      value={barColor}
                      spellCheck={false}
                      maxLength={7}
                      aria-label="Bar color hex"
                      onChange={e => onBarColor(e.target.value)}
                    />
                  </span>
                </label>
              </div>
            ) : null}
          </>
        )}
      </div>

      {!disabled && layout === 'toolbox' ? (
        <>
          {swipeStyle === 'spyglass' ? (
            <div className="si-layer-swipe-chrome__spy-tools" dir="ltr">
              <div className="si-layer-swipe-chrome__split-tool">
                <label className="si-layer-swipe-chrome__split-label" htmlFor="si-layer-swipe-spy-x">
                  Lens horizontal
                </label>
                <input
                  id="si-layer-swipe-spy-x"
                  className="si-layer-swipe-chrome__range"
                  style={{ accentColor: barColor }}
                  type="range"
                  min={5}
                  max={95}
                  step={0.5}
                  value={spyXPct}
                  onChange={e => onSpyXPct(Number(e.target.value))}
                />
              </div>
              <div className="si-layer-swipe-chrome__split-tool">
                <label className="si-layer-swipe-chrome__split-label" htmlFor="si-layer-swipe-spy-y">
                  Lens vertical
                </label>
                <input
                  id="si-layer-swipe-spy-y"
                  className="si-layer-swipe-chrome__range"
                  style={{ accentColor: barColor }}
                  type="range"
                  min={5}
                  max={95}
                  step={0.5}
                  value={spyYPct}
                  onChange={e => onSpyYPct(Number(e.target.value))}
                />
              </div>
              <div className="si-layer-swipe-chrome__split-tool">
                <label className="si-layer-swipe-chrome__split-label" htmlFor="si-layer-swipe-spy-r">
                  {splitLabel}
                </label>
                <input
                  id="si-layer-swipe-spy-r"
                  className="si-layer-swipe-chrome__range"
                  style={{ accentColor: barColor }}
                  type="range"
                  min={8}
                  max={42}
                  step={0.5}
                  value={spyRadiusPct}
                  onChange={e => onSpyRadiusPct(Number(e.target.value))}
                />
              </div>
            </div>
          ) : (
            <div className="si-layer-swipe-chrome__split-tool" dir="ltr">
              <label className="si-layer-swipe-chrome__split-label" htmlFor="si-layer-swipe-split-range">
                {splitLabel}
              </label>
              <input
                id="si-layer-swipe-split-range"
                className="si-layer-swipe-chrome__range"
                style={{ accentColor: barColor }}
                type="range"
                min={5}
                max={95}
                step={0.5}
                value={splitPct}
                aria-valuemin={5}
                aria-valuemax={95}
                aria-valuenow={Math.round(splitPct * 10) / 10}
                aria-label="Swipe compare position"
                onChange={e => onSplitPct(Number(e.target.value))}
              />
            </div>
          )}
        </>
      ) : null}

      {!disabled && layout === 'overlay' ? (
        <>
          <div
            className="si-layer-swipe-chrome__bar"
            role="slider"
            aria-valuemin={5}
            aria-valuemax={95}
            aria-valuenow={Math.round(splitPct)}
            aria-label="Swipe divider position"
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                onSplitPct(Math.max(5, splitPct - 2));
              } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                onSplitPct(Math.min(95, splitPct + 2));
              }
            }}
            onPointerDown={e => {
              if (e.button !== 0) return;
              dragRef.current = true;
              setFromClientX(e.clientX);
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
          >
            <div className="si-layer-swipe-chrome__bar-track" />
            <div
              className="si-layer-swipe-chrome__handle"
              style={{ left: `${splitPct}%` }}
              title="Drag to compare"
            >
              <span className="si-layer-swipe-chrome__grip" aria-hidden />
            </div>
          </div>
          <div className="si-layer-swipe-chrome__line" style={{ left: `${splitPct}%` }} aria-hidden />
        </>
      ) : null}
    </div>
  );
}
