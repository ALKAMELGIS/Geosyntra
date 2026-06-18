import { describe, expect, it } from 'vitest';
import { coverDisplayLabelsForLayer, indexIconForLayer } from './liveAoiPopupLabels';

describe('liveAoiPopupLabels', () => {
  it('uses crop-oriented labels for NDVI family', () => {
    const labels = coverDisplayLabelsForLayer('NDVI');
    expect(labels.positive).toContain('Vegetated');
    expect(labels.negative).toContain('Non-vegetated');
  });

  it('returns index icons', () => {
    expect(indexIconForLayer('NDVI')).toBe('fa-seedling');
    expect(indexIconForLayer('NDWI')).toBe('fa-water');
  });
});
