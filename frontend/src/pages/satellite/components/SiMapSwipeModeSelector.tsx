import type { SiMapSwipeMode } from '../utils/siMapLayerSwipeCatalog';
import './SiMapSwipeModeSelector.css';

const MODES: { id: SiMapSwipeMode; label: string; hint: string }[] = [
  { id: 'vertical', label: 'Vertical bar', hint: 'Move left and right' },
  { id: 'horizontal', label: 'Horizontal bar', hint: 'Move up and down' },
  { id: 'spyglass', label: 'Spyglass', hint: 'Circular comparison lens' },
];

type Props = {
  value: SiMapSwipeMode;
  onChange: (mode: SiMapSwipeMode) => void;
  className?: string;
};

function ModeThumb({ mode }: { mode: SiMapSwipeMode }) {
  return (
    <svg className="si-swipe-mode-thumb" viewBox="0 0 80 48" aria-hidden>
      <rect x="2" y="2" width="76" height="44" rx="4" fill="rgba(255,255,255,0.06)" />
      <rect x="6" y="6" width="32" height="36" rx="2" fill="rgba(255,77,120,0.55)" />
      <rect x="42" y="6" width="32" height="36" rx="2" fill="rgba(56,132,255,0.55)" />
      {mode === 'vertical' ? (
        <>
          <line x1="40" y1="4" x2="40" y2="44" stroke="#fff" strokeWidth="3" />
          <path d="M34 24h12M38 20v8" stroke="#fff" strokeWidth="1.5" fill="none" />
        </>
      ) : null}
      {mode === 'horizontal' ? (
        <>
          <line x1="4" y1="24" x2="76" y2="24" stroke="#fff" strokeWidth="3" />
          <path d="M40 18v12M36 22h8" stroke="#fff" strokeWidth="1.5" fill="none" />
        </>
      ) : null}
      {mode === 'spyglass' ? (
        <circle cx="52" cy="24" r="14" fill="rgba(255,77,120,0.55)" stroke="#fff" strokeWidth="2.5" />
      ) : null}
    </svg>
  );
}

export function SiMapSwipeModeSelector({ value, onChange, className = '' }: Props) {
  const displayModes = MODES.filter(m => m.id === value || MODES.some(x => x.id === value));
  const active = value === 'split' ? 'vertical' : value;

  return (
    <fieldset className={`si-swipe-mode-selector ${className}`.trim()}>
      <legend className="si-swipe-mode-selector__legend">Choose a style for the swipe tool</legend>
      <div className="si-swipe-mode-selector__grid" role="radiogroup" aria-label="Swipe mode">
        {MODES.map(mode => (
          <label
            key={mode.id}
            className={
              'si-swipe-mode-selector__option' +
              (active === mode.id ? ' si-swipe-mode-selector__option--active' : '')
            }
          >
            <input
              type="radio"
              name="si-swipe-mode"
              value={mode.id}
              checked={active === mode.id}
              onChange={() => onChange(mode.id)}
            />
            <ModeThumb mode={mode.id} />
            <span className="si-swipe-mode-selector__label">{mode.label}</span>
          </label>
        ))}
      </div>
      <div className="si-swipe-mode-selector__extras">
        <button
          type="button"
          className={'si-swipe-mode-selector__chip' + (value === 'split' ? ' si-swipe-mode-selector__chip--on' : '')}
          onClick={() => onChange('split')}
        >
          Dynamic split
        </button>
        <button
          type="button"
          className={'si-swipe-mode-selector__chip' + (value === 'full' ? ' si-swipe-mode-selector__chip--on' : '')}
          onClick={() => onChange('full')}
        >
          Full compare
        </button>
      </div>
      {displayModes.find(m => m.id === active)?.hint ? (
        <p className="si-swipe-mode-selector__hint">{MODES.find(m => m.id === active)?.hint}</p>
      ) : null}
    </fieldset>
  );
}
