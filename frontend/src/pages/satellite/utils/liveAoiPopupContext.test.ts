import { describe, expect, it } from 'vitest';
import { isRemoteSensingLiveAoiPopupAllowed } from './liveAoiPopupContext';

describe('isRemoteSensingLiveAoiPopupAllowed', () => {
  it('allows when Remote Sensing toolbox is open and AOI exists', () => {
    expect(
      isRemoteSensingLiveAoiPopupAllowed({
        toolboxOpen: true,
        envSection: 'remote-sensing',
        hasAoiGeometry: true,
      }),
    ).toBe(true);
  });

  it('blocks when toolbox is closed', () => {
    expect(
      isRemoteSensingLiveAoiPopupAllowed({
        toolboxOpen: false,
        envSection: 'remote-sensing',
        hasAoiGeometry: true,
      }),
    ).toBe(false);
  });

  it('blocks when another env section is active', () => {
    expect(
      isRemoteSensingLiveAoiPopupAllowed({
        toolboxOpen: true,
        envSection: 'layers',
        hasAoiGeometry: true,
      }),
    ).toBe(false);
  });

  it('blocks when no AOI geometry exists', () => {
    expect(
      isRemoteSensingLiveAoiPopupAllowed({
        toolboxOpen: true,
        envSection: 'remote-sensing',
        hasAoiGeometry: false,
      }),
    ).toBe(false);
  });
});
