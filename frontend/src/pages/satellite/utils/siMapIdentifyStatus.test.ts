import { describe, expect, it } from 'vitest';
import { formatMapIdentifyStatusMessage } from './siMapIdentifyStatus';

describe('formatMapIdentifyStatusMessage', () => {
  it('summarizes title, place, coords, and first attributes', () => {
    const msg = formatMapIdentifyStatusMessage({
      title: 'Point 4',
      lng: -15.07949,
      lat: 16.80201,
      areaName: 'Trarza, Mauritania',
      rows: [
        { label: 'NAME', value: '4' },
        { label: 'ICON', value: 'ylw-pushpin' },
      ],
    });
    expect(msg).toContain('Point 4');
    expect(msg).toContain('Trarza');
    expect(msg).toContain('NAME: 4');
    expect(msg).not.toContain('ICON-OFFSET');
  });
});
