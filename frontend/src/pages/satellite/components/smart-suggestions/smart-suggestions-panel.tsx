import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { GeoExplorerCssPrefix } from '../geoExplorerCssPrefix';
import {
  buildSmartSuggestions,
  bumpRecentSuggestion,
  filterSmartSuggestions,
  type SmartSuggestionCategory,
  type SmartSuggestionItem,
  type SmartSuggestionsContext,
} from '../../utils/smartSuggestionsEngine';
import { AiInsightsSection } from './ai-insights-section';
import { QuickActionsSection } from './quick-actions-section';
import './smart-suggestions.css';

function pfx(prefix: GeoExplorerCssPrefix, part: string): string {
  return `${prefix}-${part}`;
}

export type SmartSuggestionActionPayload = {
  item: SmartSuggestionItem;
  insertText?: string;
};

export type SmartSuggestionsPanelProps = {
  cssPrefix: GeoExplorerCssPrefix;
  open: boolean;
  onClose: () => void;
  context: SmartSuggestionsContext;
  onSelectItem: (payload: SmartSuggestionActionPayload) => void;
  /** Optional optimize templates (legacy assist). */
  onOpenOptimize?: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
};

type TabId = SmartSuggestionCategory | 'all';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'actions', label: 'Actions' },
  { id: 'insights', label: 'Insights' },
  { id: 'tools', label: 'Tools' },
  { id: 'composer', label: 'Composer' },
];

export function SmartSuggestionsPanel({
  cssPrefix,
  open,
  onClose,
  context,
  onSelectItem,
  onOpenOptimize,
}: SmartSuggestionsPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<TabId>('all');
  const [query, setQuery] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);

  const allItems = useMemo(() => buildSmartSuggestions(context), [context]);
  const filtered = useMemo(() => filterSmartSuggestions(allItems, query, tab), [allItems, query, tab]);

  const byCategory = useMemo(
    () => ({
      actions: filtered.filter(i => i.category === 'actions'),
      insights: filtered.filter(i => i.category === 'insights'),
      tools: filtered.filter(i => i.category === 'tools'),
      composer: filtered.filter(i => i.category === 'composer'),
    }),
    [filtered],
  );

  const contextLine = useMemo(() => {
    const parts: string[] = [];
    if (context.satelliteProviderName) parts.push(context.satelliteProviderName);
    if (context.activeLayerLabel) parts.push(context.activeLayerLabel);
    if (context.hasAoi) parts.push('AOI');
    if (context.timelineActive) parts.push('Timeline');
    return parts.length ? parts.join(' · ') : 'Map context';
  }, [context]);

  const handleSelect = useCallback(
    (item: SmartSuggestionItem) => {
      if (item.insertText) bumpRecentSuggestion(item.insertText);
      onSelectItem({ item, insertText: item.insertText });
      if (item.category === 'composer' || item.insertText) {
        onClose();
      }
    },
    [onSelectItem, onClose],
  );

  useEffect(() => {
    if (!open) return;
    setFocusId(filtered[0]?.id ?? null);
  }, [open, tab, query, filtered]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!filtered.length) return;
        e.preventDefault();
        const idx = filtered.findIndex(i => i.id === focusId);
        const next =
          e.key === 'ArrowDown'
            ? filtered[(idx + 1) % filtered.length]
            : filtered[(idx <= 0 ? filtered.length : idx) - 1];
        setFocusId(next?.id ?? null);
      }
      if (e.key === 'Enter' && focusId) {
        const item = filtered.find(i => i.id === focusId);
        if (item) {
          e.preventDefault();
          handleSelect(item);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, focusId, onClose, handleSelect]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (panelRef.current?.contains(t)) return;
      if ((t as Element).closest?.('.si-smart-suggest-trigger')) return;
      onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onClose]);

  const renderBody = () => {
    if (tab === 'actions') {
      return (
        <QuickActionsSection
          title="Suggested actions"
          items={byCategory.actions}
          onSelect={handleSelect}
          focusId={focusId}
        />
      );
    }
    if (tab === 'insights') {
      return <AiInsightsSection items={byCategory.insights} onSelect={handleSelect} focusId={focusId} />;
    }
    if (tab === 'tools') {
      return (
        <QuickActionsSection
          title="Quick tools"
          items={byCategory.tools}
          onSelect={handleSelect}
          focusId={focusId}
        />
      );
    }
    if (tab === 'composer') {
      return (
        <QuickActionsSection
          title="Composer phrases"
          items={byCategory.composer}
          onSelect={handleSelect}
          focusId={focusId}
          emptyHint="Type in the message box to rank field and layer phrases."
        />
      );
    }
    return (
      <>
        {byCategory.actions.length > 0 ? (
          <QuickActionsSection
            title="Suggested actions"
            items={byCategory.actions}
            onSelect={handleSelect}
            focusId={focusId}
          />
        ) : null}
        {byCategory.insights.length > 0 ? (
          <AiInsightsSection items={byCategory.insights} onSelect={handleSelect} focusId={focusId} />
        ) : null}
        {byCategory.tools.length > 0 ? (
          <QuickActionsSection title="Quick tools" items={byCategory.tools} onSelect={handleSelect} focusId={focusId} />
        ) : null}
        {byCategory.composer.length > 0 ? (
          <QuickActionsSection
            title="Composer"
            items={byCategory.composer}
            onSelect={handleSelect}
            focusId={focusId}
          />
        ) : null}
        {!filtered.length ? <p className="si-smart-suggest-empty">No matches — try another tab or search.</p> : null}
      </>
    );
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={panelRef}
          className="si-smart-suggest-panel"
          role="dialog"
          aria-label="Smart suggestions"
          initial={{ opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="si-smart-suggest-panel__head">
            <div className="si-smart-suggest-panel__title-block">
              <span className="si-smart-suggest-panel__title">
                <i className="fa-solid fa-wand-magic-sparkles" aria-hidden /> Smart suggestions
              </span>
              <span className="si-smart-suggest-panel__context">{contextLine}</span>
            </div>
            <div className="si-smart-suggest-panel__head-actions">
              {onOpenOptimize ? (
                <button type="button" className="si-smart-suggest-panel__ghost-btn" onClick={onOpenOptimize}>
                  Optimize
                </button>
              ) : null}
              <button
                type="button"
                className="si-smart-suggest-panel__close"
                onClick={onClose}
                aria-label="Close suggestions"
              >
                <i className="fa-solid fa-xmark" aria-hidden />
              </button>
            </div>
          </div>

          <div className="si-smart-suggest-panel__search-row">
            <i className="fa-solid fa-magnifying-glass si-smart-suggest-panel__search-icon" aria-hidden />
            <input
              type="search"
              className="si-smart-suggest-panel__search"
              placeholder="Search actions, insights, tools…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Search suggestions"
            />
          </div>

          <div className="si-smart-suggest-panel__tabs" role="tablist">
            {TABS.map(t => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`si-smart-suggest-panel__tab${tab === t.id ? ' si-smart-suggest-panel__tab--on' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="si-smart-suggest-panel__scroll" role="tabpanel">
            {renderBody()}
          </div>

          <p className="si-smart-suggest-panel__foot">
            ↑↓ navigate · Enter apply · Esc close
            {filtered.length ? ` · ${filtered.length} shown` : ''}
          </p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
