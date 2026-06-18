import { useCallback, useEffect, useRef, useState } from 'react';
import type { SiMapSearchHit } from '../siMapSearch';
import './SiMapPlaceSearch.css';

export type SiMapPlaceSearchProps = {
  query: string;
  onQueryChange: (value: string) => void;
  results: SiMapSearchHit[];
  showResults: boolean;
  onShowResultsChange: (show: boolean) => void;
  isSearching: boolean;
  onSearch: () => void;
  onSelectResult: (hit: SiMapSearchHit) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional profile photo (Google Maps–style leading avatar). */
  avatarUrl?: string | null;
  avatarInitials?: string;
  placeholder?: string;
};

export function SiMapPlaceSearch({
  query,
  onQueryChange,
  results,
  showResults,
  onShowResultsChange,
  isSearching,
  onSearch,
  onSelectResult,
  isOpen,
  onOpenChange,
  avatarUrl,
  avatarInitials = 'U',
  placeholder = 'Search layers, features, or places',
}: SiMapPlaceSearchProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIdx, setActiveIdx] = useState(-1);

  const openAndFocus = useCallback(() => {
    onOpenChange(true);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [onOpenChange]);

  const close = useCallback(() => {
    onOpenChange(false);
    onShowResultsChange(false);
    setActiveIdx(-1);
  }, [onOpenChange, onShowResultsChange]);

  useEffect(() => {
    if (!isOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onShowResultsChange(false);
        if (!query.trim()) close();
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [isOpen, query, close, onShowResultsChange]);

  useEffect(() => {
    setActiveIdx(-1);
  }, [results, query]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (query.trim()) {
        onQueryChange('');
        onShowResultsChange(false);
      } else {
        close();
      }
      return;
    }
    if (e.key === 'Enter') {
      // Stop the browser default (form submit / page reload) on every platform.
      e.preventDefault();
      e.stopPropagation();
      if (!query.trim()) return;
      // Google Maps behaviour: go to the highlighted suggestion, else the first
      // match if any are already shown; otherwise kick off a search that will
      // navigate to its top result once it resolves.
      if (activeIdx >= 0 && results[activeIdx]) {
        onSelectResult(results[activeIdx]);
        return;
      }
      if (results.length > 0) {
        onSelectResult(results[0]);
        return;
      }
      onSearch();
      return;
    }
    if (!showResults || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => (i <= 0 ? results.length - 1 : i - 1));
    }
  };

  const hasQuery = query.trim().length > 0;
  const listVisible = isOpen && showResults && results.length > 0;

  return (
    <div
      ref={rootRef}
      className={`si-map-place-search${isOpen ? ' si-map-place-search--open' : ' si-map-place-search--collapsed'}`}
      data-si-map-place-search=""
    >
      {!isOpen ? (
        <button
          type="button"
          className="si-map-place-search__fab"
          aria-label="Open search"
          onClick={openAndFocus}
        >
          <i className="fa-solid fa-magnifying-glass" aria-hidden />
        </button>
      ) : (
        <div className="si-map-place-search__bar" role="search">
          <div className="si-map-place-search__leading">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="si-map-place-search__avatar" />
            ) : (
              <span className="si-map-place-search__avatar si-map-place-search__avatar--initials" aria-hidden>
                {avatarInitials.slice(0, 2).toUpperCase()}
              </span>
            )}
            <button
              type="button"
              className="si-map-place-search__close"
              aria-label="Close search"
              onClick={close}
            >
              <i className="fa-solid fa-xmark" aria-hidden />
            </button>
          </div>

          <label className="si-map-place-search__field">
            <i className="fa-solid fa-magnifying-glass si-map-place-search__field-icon" aria-hidden />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={e => {
                onQueryChange(e.target.value);
                onShowResultsChange(true);
              }}
              onFocus={() => onShowResultsChange(true)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              aria-label={placeholder}
              className="si-map-place-search__input"
              autoComplete="off"
              enterKeyHint="search"
            />
            {hasQuery ? (
              <button
                type="button"
                className="si-map-place-search__clear"
                aria-label="Clear search"
                onClick={() => {
                  onQueryChange('');
                  onShowResultsChange(false);
                  inputRef.current?.focus();
                }}
              >
                <i className="fa-solid fa-circle-xmark" aria-hidden />
              </button>
            ) : null}
          </label>

          <button
            type="button"
            className="si-map-place-search__go"
            aria-label="Search"
            disabled={!hasQuery || isSearching}
            onClick={onSearch}
          >
            {isSearching ? (
              <i className="fa-solid fa-spinner fa-spin" aria-hidden />
            ) : (
              <i className="fa-solid fa-arrow-right" aria-hidden />
            )}
          </button>
        </div>
      )}

      {listVisible ? (
        <ul className="si-map-place-search__results" role="listbox" aria-label="Search suggestions">
          {results.map((hit, idx) => (
            <li key={hit.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={idx === activeIdx}
                className={
                  'si-map-place-search__result' + (idx === activeIdx ? ' si-map-place-search__result--active' : '')
                }
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => onSelectResult(hit)}
              >
                <span
                  className={
                    'si-map-place-search__result-icon' +
                    (hit.kind === 'layer'
                      ? ' si-map-place-search__result-icon--layer'
                      : hit.kind === 'feature'
                        ? ' si-map-place-search__result-icon--feature'
                        : '')
                  }
                  aria-hidden
                >
                  <i
                    className={
                      hit.kind === 'layer'
                        ? 'fa-solid fa-layer-group'
                        : hit.kind === 'feature'
                          ? 'fa-solid fa-vector-square'
                          : 'fa-solid fa-location-dot'
                    }
                  />
                </span>
                <span className="si-map-place-search__result-text">
                  <span className="si-map-place-search__result-title">{hit.title}</span>
                  {hit.subtitle ? (
                    <span className="si-map-place-search__result-sub">{hit.subtitle}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {isOpen && hasQuery && !isSearching && showResults && results.length === 0 ? (
        <p className="si-map-place-search__empty" role="status">
          No features, layers, or places found
        </p>
      ) : null}
    </div>
  );
}
