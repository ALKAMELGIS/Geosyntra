import type { SmartSuggestionItem } from '../../utils/smartSuggestionsEngine';

export type SuggestionCardProps = {
  item: SmartSuggestionItem;
  onSelect: (item: SmartSuggestionItem) => void;
  focused?: boolean;
  tabIndex?: number;
};

export function SuggestionCard({ item, onSelect, focused, tabIndex = -1 }: SuggestionCardProps) {
  return (
    <button
      type="button"
      className={`si-smart-suggest-card${focused ? ' si-smart-suggest-card--focused' : ''}`}
      onClick={() => onSelect(item)}
      tabIndex={tabIndex}
      data-category={item.category}
    >
      <span className="si-smart-suggest-card__icon" aria-hidden>
        <i className={item.icon} />
      </span>
      <span className="si-smart-suggest-card__body">
        <span className="si-smart-suggest-card__title-row">
          <span className="si-smart-suggest-card__title">{item.title}</span>
          {item.badge ? <span className="si-smart-suggest-card__badge">{item.badge}</span> : null}
        </span>
        {item.description ? <span className="si-smart-suggest-card__desc">{item.description}</span> : null}
      </span>
      <i className="fa-solid fa-chevron-right si-smart-suggest-card__chev" aria-hidden />
    </button>
  );
}
