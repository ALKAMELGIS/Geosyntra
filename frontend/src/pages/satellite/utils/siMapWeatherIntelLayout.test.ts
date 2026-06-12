import { describe, expect, it } from 'vitest';
import {
  clampWeatherIntelPanelPosition,
  clampWeatherIntelPanelSize,
  computeSiMapWeatherIntelLayout,
  SI_WX_INTEL_PANEL_W,
  SI_WX_INTEL_PANEL_W_HISTORY,
  weatherIntelDefaultPanelPosition,
  weatherIntelPanelPositionAtPin,
  weatherIntelPanelResizeBounds,
} from './siMapWeatherIntelLayout';

describe('computeSiMapWeatherIntelLayout', () => {
  it('fits panel width inside shell minus trailing rail', () => {
    const layout = computeSiMapWeatherIntelLayout(1280, 800, {});
    expect(layout.width).toBe(SI_WX_INTEL_PANEL_W);
    expect(layout.insetInlineStart).toBeGreaterThanOrEqual(12);
    expect(layout.maxHeight).toBeGreaterThan(200);
  });

  it('widens for history mode within shell bounds', () => {
    const layout = computeSiMapWeatherIntelLayout(900, 700, { historyOpen: true });
    expect(layout.width).toBe(SI_WX_INTEL_PANEL_W_HISTORY);
  });

  it('shrinks on narrow mobile shells', () => {
    const layout = computeSiMapWeatherIntelLayout(360, 640, { toolboxPanelOpen: true });
    expect(layout.width).toBeLessThan(SI_WX_INTEL_PANEL_W);
    expect(layout.width).toBeGreaterThanOrEqual(240);
  });

  it('exposes shell dimensions for floating clamp', () => {
    const layout = computeSiMapWeatherIntelLayout(1200, 800, {});
    expect(layout.shellW).toBe(1200);
    expect(layout.shellH).toBe(800);
  });

  it('clamps dragged panel inside shell', () => {
    const layout = computeSiMapWeatherIntelLayout(800, 600, {});
    const def = weatherIntelDefaultPanelPosition(layout);
    const clamped = clampWeatherIntelPanelPosition(900, 900, layout.width, 400, layout);
    expect(clamped.left).toBeLessThanOrEqual(layout.shellW - layout.trailingReserve - layout.width - 8);
    expect(clamped.top).toBeLessThanOrEqual(layout.shellH - 400 - 8);
    expect(clamped.left).toBeGreaterThanOrEqual(8);
    expect(def.left).toBeGreaterThanOrEqual(8);
  });

  it('anchors popup near projected map point', () => {
    const layout = computeSiMapWeatherIntelLayout(1200, 800, {});
    const map = {
      project: () => ({ x: 400, y: 300 }),
      getContainer: () => {
        const el = document.createElement('div');
        el.className = 'mapboxgl-map';
        const shell = document.createElement('div');
        shell.className = 'si-map-container';
        shell.appendChild(el);
        document.body.appendChild(shell);
        return el;
      },
    };
    const pos = weatherIntelPanelPositionAtPin(55.75, 24.07, map, layout, SI_WX_INTEL_PANEL_W, 200);
    expect(pos.left).toBeGreaterThan(300);
    expect(pos.top).toBeGreaterThanOrEqual(8);
    expect(pos.top).toBeLessThan(400);
  });

  it('allows free resize up to the map shell bounds', () => {
    const layout = computeSiMapWeatherIntelLayout(1280, 900, {});
    const bounds = weatherIntelPanelResizeBounds(layout);
    expect(bounds.maxWidth).toBeGreaterThan(500);
    expect(bounds.maxHeight).toBeGreaterThan(700);
    const clamped = clampWeatherIntelPanelSize(bounds.maxWidth + 120, bounds.maxHeight + 80, layout);
    expect(clamped.width).toBe(bounds.maxWidth);
    expect(clamped.height).toBe(bounds.maxHeight);
  });
});
