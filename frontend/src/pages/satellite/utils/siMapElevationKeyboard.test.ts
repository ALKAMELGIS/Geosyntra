import { describe, expect, it } from 'vitest';
import {
  resolveSiMapElevationViewFromArrowKey,
  siMapElevationKeyboardTargetBlocked,
} from './siMapElevationKeyboard';

describe('siMapElevationKeyboard', () => {
  it('blocks editable targets', () => {
    const input = document.createElement('input');
    expect(siMapElevationKeyboardTargetBlocked(input)).toBe(true);
    const div = document.createElement('div');
    expect(siMapElevationKeyboardTargetBlocked(div)).toBe(false);
  });

  it('maps ArrowRight to enable 3D when off', () => {
    expect(
      resolveSiMapElevationViewFromArrowKey('ArrowRight', { elevationActive: false }),
    ).toBe(true);
    expect(
      resolveSiMapElevationViewFromArrowKey('ArrowRight', { elevationActive: true }),
    ).toBeNull();
  });

  it('maps ArrowLeft to disable 3D when on', () => {
    expect(
      resolveSiMapElevationViewFromArrowKey('ArrowLeft', { elevationActive: true }),
    ).toBe(false);
    expect(
      resolveSiMapElevationViewFromArrowKey('ArrowLeft', { elevationActive: false }),
    ).toBeNull();
  });

  it('ignores modifiers', () => {
    expect(
      resolveSiMapElevationViewFromArrowKey('ArrowRight', {
        elevationActive: false,
        shiftKey: true,
      }),
    ).toBeNull();
  });
});
