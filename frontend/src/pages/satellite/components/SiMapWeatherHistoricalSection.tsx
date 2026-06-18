import './SiMapWeatherHistoricalSection.css';

type SiMapWeatherHistoricalSectionProps = {
  selectedDate: string;
  maxDate: string;
  minDate: string;
  isToday: boolean;
  onDateChange: (iso: string) => void;
  onJumpToday: () => void;
  /** Render date controls inline beside search (single toolbar row). */
  inline?: boolean;
};

export function SiMapWeatherHistoricalSection({
  selectedDate,
  maxDate,
  minDate,
  isToday,
  onDateChange,
  onJumpToday,
  inline = false,
}: SiMapWeatherHistoricalSectionProps) {
  const dateInput = (
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
  );

  const todayBtn = (
    <button
      type="button"
      className={`si-map-wx-hist__today-btn${isToday ? ' is-active' : ''}`}
      onClick={onJumpToday}
      title="Jump to today"
    >
      Today
    </button>
  );

  if (inline) {
    return (
      <div className="si-map-wx-hist si-map-wx-hist--inline" aria-label="Historical weather">
        <div className="si-map-wx-hist__picker-row">
          <label className="si-map-wx-hist__date-field" htmlFor="si-map-wx-hist-date" title="Historical date">
            <i className="fa-regular fa-calendar" aria-hidden />
            {dateInput}
          </label>
          {todayBtn}
        </div>
      </div>
    );
  }

  return (
    <section className="si-map-wx-hist" aria-label="Historical weather">
      <div className="si-map-wx-hist__picker">
        <div className="si-map-wx-hist__picker-row">
          <label className="si-map-wx-hist__picker-label" htmlFor="si-map-wx-hist-date" title="Historical date">
            <i className="fa-regular fa-calendar" aria-hidden />
            <span className="si-map-wx-hist__picker-label-text">Date</span>
          </label>
          {dateInput}
          {todayBtn}
        </div>
      </div>
    </section>
  );
}
