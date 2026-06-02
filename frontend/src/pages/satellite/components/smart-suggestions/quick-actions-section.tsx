import type { SmartSuggestionItem } from '../../utils/smartSuggestionsEngine';
import { SuggestionCard } from './suggestion-card';

export type QuickActionsSectionProps = {
  title: string;
  items: SmartSuggestionItem[];
  onSelect: (item: SmartSuggestionItem) => void;
  focusId?: string | null;
  emptyHint?: string;
};

export function QuickActionsSection({
  title,
  items,
  onSelect,
  focusId,
  emptyHint = 'No items in this category.',
}: QuickActionsSectionProps) {
  return (
    <div className="si-smart-suggest-section" role="group" aria-label={title}>
      <div className="si-smart-suggest-section__title">{title}</div>
      {!items.length ? (
        <p className="si-smart-suggest-empty">{emptyHint}</p>
      ) : (
        items.map(item => (
          <SuggestionCard
            key={item.id}
            item={item}
            onSelect={onSelect}
            focused={focusId === item.id}
            tabIndex={focusId === item.id ? 0 : -1}
          />
        ))
      )}
    </div>
  );
}
