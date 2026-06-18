import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchOpenMeteoHistoricalDay,
  isOpenMeteoViewDateToday,
  openMeteoSameDayYearsAgo,
  validateOpenMeteoHistoricalDate,
} from './openMeteoMapWeatherHistorical';
import { wxHistoryOpenMeteoLatestEndDate } from './openWeatherTimeHistory';

describe('openMeteoMapWeatherHistorical', () => {
  it('shifts calendar day by years', () => {
    expect(openMeteoSameDayYearsAgo('2026-06-02', 1)).toBe('2025-06-02');
    expect(openMeteoSameDayYearsAgo('2026-06-02', 5)).toBe('2021-06-02');
  });

  it('detects today', () => {
    const today = wxHistoryOpenMeteoLatestEndDate(new Date('2026-06-02T12:00:00Z'));
    expect(isOpenMeteoViewDateToday(today, new Date('2026-06-02T12:00:00Z'))).toBe(true);
    expect(isOpenMeteoViewDateToday('2026-05-01', new Date('2026-06-02T12:00:00Z'))).toBe(false);
  });

  it('validates historical date bounds', () => {
    const ref = new Date('2026-06-02T12:00:00Z');
    expect(validateOpenMeteoHistoricalDate('1940-01-01', ref)).toMatch(/starts/);
    expect(validateOpenMeteoHistoricalDate('2026-06-02', ref)).toBeNull();
    expect(validateOpenMeteoHistoricalDate('2026-06-10', ref)).toMatch(/cannot be after/);
  });

  it('fetchOpenMeteoHistoricalDay returns hourly rows from archive API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        timezone: 'Asia/Dubai',
        hourly: {
          time: ['2021-02-01T00:00', '2021-02-01T12:00'],
          temperature_2m: [18, 24],
          relative_humidity_2m: [55, 42],
          precipitation: [0, 0],
          weather_code: [1, 2],
          wind_speed_10m: [2.5, 3.1],
          wind_direction_10m: [90, 120],
        },
        daily: {
          time: ['2021-02-01'],
          weather_code: [2],
          temperature_2m_max: [26],
          temperature_2m_min: [16],
          precipitation_sum: [0],
          wind_speed_10m_max: [4],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const ref = new Date('2026-06-02T12:00:00Z');
    const day = await fetchOpenMeteoHistoricalDay(25.09, 55.15, '2021-02-01', 'Dubai', ref);

    expect(day.date).toBe('2021-02-01');
    expect(day.hourly.length).toBeGreaterThan(0);
    expect(day.hourly[0]?.tempC).toBe(18);
    expect(day.snapshot.tempC).not.toBeNull();
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/archive-api\.open-meteo\.com/);

    vi.unstubAllGlobals();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
