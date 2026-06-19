import { afterEach, describe, expect, it } from 'vitest';

import {

  clearMapToolboxCssVars,

  measureMapToolboxHostMetrics,

  resolveAppChromeBottomPx,

  resolveMapToolboxGapBridgePx,

  resolveMapToolboxHostHeightPx,

  resolveMapToolboxHostTopPx,

  syncMapToolboxCssVars,

} from './MapToolsDock';



afterEach(() => {

  document.body.innerHTML = '';

  clearMapToolboxCssVars();

});



function domRect(top: number, bottom: number, left = 0, width = 320): DOMRect {

  return {

    top,

    bottom,

    left,

    width,

    right: left + width,

    height: bottom - top,

    x: left,

    y: top,

    toJSON: () => ({}),

  } as DOMRect;

}



describe('resolveAppChromeBottomPx', () => {

  it('returns header bottom on map canvas', () => {

    document.body.innerHTML = `

      <header class="geosyntra-header"></header>

      <main class="content"><div class="si-page si-page--map-canvas"></div></main>

    `;

    const header = document.querySelector('.geosyntra-header')!;

    header.getBoundingClientRect = () => domRect(0, 64, 0, 1200);



    expect(resolveAppChromeBottomPx()).toBe(64);

  });



  it('includes platform env banner when present', () => {

    document.body.innerHTML = `

      <div class="platform-env-banner"></div>

      <header class="geosyntra-header"></header>

      <main class="content"><div class="si-page si-page--map-canvas"></div></main>

    `;

    const banner = document.querySelector('.platform-env-banner')!;

    const header = document.querySelector('.geosyntra-header')!;

    banner.getBoundingClientRect = () => domRect(0, 28, 0, 1200);

    header.getBoundingClientRect = () => domRect(28, 92, 0, 1200);



    expect(resolveAppChromeBottomPx()).toBe(92);

  });



  it('returns 0 on map canvas when embed mode has no in-frame chrome', () => {

    document.body.innerHTML = `

      <main class="content"><div class="si-page si-page--map-canvas"></div></main>

    `;



    expect(resolveAppChromeBottomPx()).toBe(0);

  });

});



describe('resolveMapToolboxHostTopPx', () => {

  it('returns rect.top when not on map canvas page', () => {

    const rect = domRect(12, 900);

    expect(resolveMapToolboxHostTopPx(rect)).toBe(12);

  });



  it('snaps to header bottom when map shell top is below chrome (layout gap)', () => {

    document.body.innerHTML = `

      <header class="geosyntra-header"></header>

      <main class="content"><div class="si-page si-page--map-canvas"></div></main>

    `;

    const header = document.querySelector('.geosyntra-header')!;

    header.getBoundingClientRect = () => domRect(0, 64, 0, 1200);



    const rect = domRect(88, 900);

    expect(resolveMapToolboxHostTopPx(rect)).toBe(64);

  });



  it('snaps to header bottom when map extends under the header', () => {

    document.body.innerHTML = `

      <header class="geosyntra-header"></header>

      <main class="content"><div class="si-page si-page--map-canvas"></div></main>

    `;

    const header = document.querySelector('.geosyntra-header')!;

    header.getBoundingClientRect = () => domRect(0, 64, 0, 1200);



    const rect = domRect(0, 800);

    expect(resolveMapToolboxHostTopPx(rect)).toBe(64);

  });



  it('ignores top header alignment for bottom-cloud dock mode', () => {

    document.body.innerHTML = `

      <header class="geosyntra-header geosyntra-header--bottom-cloud"></header>

      <main class="content"><div class="si-page si-page--map-canvas"></div></main>

    `;



    const rect = domRect(0, 800);

    expect(resolveMapToolboxHostTopPx(rect)).toBe(0);

  });

});



describe('resolveMapToolboxGapBridgePx', () => {

  it('bridges the layout gap between header bottom and map shell top', () => {

    document.body.innerHTML = `

      <header class="geosyntra-header"></header>

      <main class="content"><div class="si-page si-page--map-canvas"></div></main>

    `;

    const header = document.querySelector('.geosyntra-header')!;

    header.getBoundingClientRect = () => domRect(0, 64, 0, 1200);



    const rect = domRect(120, 900);

    expect(resolveMapToolboxGapBridgePx(rect, 64)).toBe(56);

  });

});



describe('resolveMapToolboxHostHeightPx', () => {

  it('extends through viewport bottom when map shell is shorter', () => {

    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });

    const rect = domRect(88, 860);

    expect(resolveMapToolboxHostHeightPx(rect, 64)).toBe(836);

  });

});



describe('measureMapToolboxHostMetrics', () => {

  it('sizes host from chrome bottom through viewport and records gap bridge', () => {

    document.body.innerHTML = `

      <header class="geosyntra-header"></header>

      <main class="content"><div class="si-page si-page--map-canvas"></div></main>

    `;

    const header = document.querySelector('.geosyntra-header')!;

    header.getBoundingClientRect = () => domRect(0, 64, 0, 1200);

    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });



    const metrics = measureMapToolboxHostMetrics(domRect(120, 820, 880, 56));

    expect(metrics.top).toBe(64);

    expect(metrics.height).toBe(836);

    expect(metrics.gapBridge).toBe(56);
  });

});



describe('syncMapToolboxCssVars', () => {

  it('writes sync, height, gap-bridge, and top tokens', () => {

    syncMapToolboxCssVars({ top: 64, height: 836, gapBridge: 24 });

    expect(document.documentElement.style.getPropertyValue('--si-map-toolbox-sync-top')).toBe('64px');

    expect(document.documentElement.style.getPropertyValue('--si-map-toolbox-sync-height')).toBe('836px');

    expect(document.documentElement.style.getPropertyValue('--si-map-toolbox-gap-bridge')).toBe('24px');

    expect(document.documentElement.style.getPropertyValue('--si-map-toolbox-top')).toBe('64px');

  });

});

