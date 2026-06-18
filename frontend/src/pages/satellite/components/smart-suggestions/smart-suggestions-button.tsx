import type { ReactNode, RefObject } from 'react';

export type SmartSuggestionsButtonProps = {
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
  suggestionCount?: number;
};

export function SmartSuggestionsButton({
  open,
  onToggle,
  disabled,
  className = '',
  suggestionCount,
}: SmartSuggestionsButtonProps) {
  return (
    <button
      type="button"
      className={`si-smart-suggest-trigger composer-icon-btn ${open ? 'si-smart-suggest-trigger--open' : ''} ${className}`.trim()}
      onClick={onToggle}
      disabled={disabled}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={open ? 'Close smart suggestions' : 'Open smart suggestions and AI insights'}
      title={open ? 'Close Smart Suggestions' : 'Smart Suggestions · AI Insights'}
    >
      <i className="fa-solid fa-lightbulb" aria-hidden />
      {suggestionCount != null && suggestionCount > 0 && !open ? (
        <span className="si-smart-suggest-trigger__badge" aria-hidden>
          {suggestionCount > 9 ? '9+' : suggestionCount}
        </span>
      ) : null}
    </button>
  );
}

export type SmartSuggestionsAnchorProps = {
  anchorRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
};

export function SmartSuggestionsAnchor({ anchorRef, children }: SmartSuggestionsAnchorProps) {
  return (
    <div ref={anchorRef} className="si-smart-suggest-anchor">
      {children}
    </div>
  );
}
