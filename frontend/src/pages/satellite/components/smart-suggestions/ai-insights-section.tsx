import type { SmartSuggestionItem } from '../../utils/smartSuggestionsEngine';
import { SuggestionCard } from './suggestion-card';

export type AiInsightsSectionProps = {
  items: SmartSuggestionItem[];
  onSelect: (item: SmartSuggestionItem) => void;
  focusId?: string | null;
};

export function AiInsightsSection({ items, onSelect, focusId }: AiInsightsSectionProps) {
  if (!items.length) {
    return <p className="si-smart-suggest-empty">No insights for the current layer — try NDVI or NDWI.</p>;
  }
  return (
    <div className="si-smart-suggest-section" role="group" aria-label="AI insights">
      {items.map(item => (
        <SuggestionCard
          key={item.id}
          item={item}
          onSelect={onSelect}
          focused={focusId === item.id}
          tabIndex={focusId === item.id ? 0 : -1}
        />
      ))}
    </div>
  );
}
