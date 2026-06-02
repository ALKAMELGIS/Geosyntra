import { describe, expect, it } from 'vitest';
import {
  filterWxHistoryPointsByDateRange,
  wxHistoryAddDaysIso,
  wxHistoryDatesMatchPreset,
  wxHistoryEachDayIso,
  wxHistoryOpenMeteoFetchPlan,
  wxHistoryOpenMeteoLatestEndDate,
  wxHistoryPresetDateRange,
  wxHistoryStats,
  wxHistoryValidateDateRange,
  wxHistoryValueForVariable,
} from './openWeatherTimeHistory';

describe('openWeatherTimeHistory', () => {
  it('reads variable values from points', () => {
    const p = {
      time: '2026-05-21T12:00:00',
      temperatureC: 22,
      precipitationMm: 1.2,
      humidityPct: 40,
      windKmh: 12,
      pressureHpa: 1013,
      cloudPct: 20,
    };
    expect(wxHistoryValueForVariable(p, 'temperature')).toBe(22);
    expect(wxHistoryValueForVariable(p, 'humidity')).toBe(40);
  });

  it('computes min mean max', () => {
    const s = wxHistoryStats([10, 20, 30]);
    expect(s?.min).toBe(10);
    expect(s?.max).toBe(30);
    expect(s?.mean).toBe(20);
  });

  it('filters points by inclusive date range', () => {
    const points = [
      {
        time: '2026-05-14T08:00:00',
        temperatureC: 20,
        precipitationMm: null,
        humidityPct: null,
        windKmh: null,
        pressureHpa: null,
        cloudPct: null,
      },
      {
        time: '2026-05-16T12:00:00',
        temperatureC: 22,
        precipitationMm: null,
        humidityPct: null,
        windKmh: null,
        pressureHpa: null,
        cloudPct: null,
      },
    ];
    const out = filterWxHistoryPointsByDateRange(points, '2026-05-15', '2026-05-20');
    expect(out).toHaveLength(1);
    expect(out[0]?.time).toContain('2026-05-16');
  });

  it('preset 7d range ends today', () => {
    const { startDate, endDate } = wxHistoryPresetDateRange('7d');
    expect(startDate <= endDate).toBe(true);
    expect(endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('validates custom date span', () => {
    expect(wxHistoryValidateDateRange('2026-05-20', '2026-05-14')).toMatch(/End date/);
    expect(wxHistoryValidateDateRange('2026-01-01', '2027-06-01')).toMatch(/365 days/);
    const latest = wxHistoryOpenMeteoLatestEndDate();
    expect(wxHistoryValidateDateRange('2026-05-14', latest)).toBeNull();
    expect(wxHistoryValidateDateRange('2026-05-14', wxHistoryAddDaysIso(latest, 3))).toMatch(/latest Open-Meteo/);
  });

  it('splits long ranges into archive and forecast slices', () => {
    const ref = new Date('2026-06-02T12:00:00Z');
    const plan = wxHistoryOpenMeteoFetchPlan('2026-05-01', '2026-06-02', ref);
    expect(plan.effectiveEnd).toBe('2026-06-02');
    expect(plan.archive?.startDate).toBe('2026-05-01');
    expect(plan.archive?.endDate).toBe('2026-05-28');
    expect(plan.forecast?.startDate).toBe('2026-05-29');
    expect(plan.forecast?.endDate).toBe('2026-06-02');
  });

  it('uses forecast only for recent windows inside archive lag', () => {
    const ref = new Date('2026-06-02T12:00:00Z');
    const plan = wxHistoryOpenMeteoFetchPlan('2026-05-29', '2026-06-02', ref);
    expect(plan.archive).toBeNull();
    expect(plan.forecast?.startDate).toBe('2026-05-29');
  });

  it('lists each day in a short range', () => {
    const days = wxHistoryEachDayIso('2026-05-14', '2026-05-17');
    expect(days).toEqual(['2026-05-14', '2026-05-15', '2026-05-16', '2026-05-17']);
  });

  it('detects preset match', () => {
    const p = wxHistoryPresetDateRange('7d');
    expect(wxHistoryDatesMatchPreset(p.startDate, p.endDate, '7d')).toBe(true);
    expect(wxHistoryDatesMatchPreset(p.startDate, p.endDate, '14d')).toBe(false);
  });
});
