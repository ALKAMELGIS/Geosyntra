import './SiMapWeatherHistoricalSection.css';

type SiMapWeatherHistoricalSectionProps = {
  selectedDate: string;
  maxDate: string;
  minDate: string;
  isToday: boolean;
  onDateChange: (iso: string) => void;
  onJumpToday: () => void;
};

export function SiMapWeatherHistoricalSection({
  selectedDate,
  maxDate,
  minDate,
  isToday,
  onDateChange,
  onJumpToday,
}: SiMapWeatherHistoricalSectionProps) {
  return (
    <section className="si-map-wx-hist" aria-label="Historical weather">
      <div className="si-map-wx-hist__picker">
        <div className="si-map-wx-hist__picker-row">
          <label className="si-map-wx-hist__picker-label" htmlFor="si-map-wx-hist-date" title="Historical date">
            <i className="fa-regular fa-calendar" aria-hidden />
            <span className="si-map-wx-hist__picker-label-text">Date</span>
          </label>
          <input
            id="si-map-wx-hist-date"
            type="date"
            className="si-map-wx-hist__date-input"
            value={selectedDate}
            min={minDate}
            max={maxDate}
            onChange={e => onDateChange(e.target.value)}
            aria-label="Historical date"
          />
          <button
            type="button"
            className={`si-map-wx-hist__today-btn${isToday ? ' is-active' : ''}`}
            onClick={onJumpToday}
            title="Jump to today"
          >
            Today
          </button>
        </div>
      </div>
    </section>
  );
}
