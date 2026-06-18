import { describe, expect, it } from 'vitest';
import {
  applyAttributeDriveToVectorStylePack,
  buildAttributeRotationExpr,
  buildAttributeTransparencyOpacityExpr,
  computeFieldNumericStats,
  sanitizeSiSymbologyAttributeTransparency,
} from './siSymbologyAttributeDrive';

describe('siSymbologyAttributeDrive', () => {
  const geojson = {
    features: [
      { properties: { pop: 10, area: 2 } },
      { properties: { pop: 20, area: 4 } },
      { properties: { pop: 30, area: 6 } },
    ],
  };

  it('computes numeric stats for a field', () => {
    const s = computeFieldNumericStats(geojson, 'pop');
    expect(s.min).toBe(10);
    expect(s.max).toBe(30);
    expect(s.count).toBe(3);
  });

  it('returns null opacity expr when disabled', () => {
    expect(
      buildAttributeTransparencyOpacityExpr(
        sanitizeSiSymbologyAttributeTransparency({ enabled: false, field: 'pop' }),
      ),
    ).toBeNull();
  });

  it('builds interpolate opacity expr when enabled', () => {
    const expr = buildAttributeTransparencyOpacityExpr(
      sanitizeSiSymbologyAttributeTransparency({
        enabled: true,
        field: 'pop',
        valueMin: 10,
        valueMax: 30,
        lowTransparency: 70,
        highTransparency: 0,
      }),
    );
    expect(expr?.[0]).toBe('interpolate');
    expect(expr?.[expr.length - 1]).toBe(1);
  });

  it('applies attribute transparency to style pack', () => {
    const base = {
      fillFilter: [],
      lineFilter: [],
      pointFilter: [],
      fillPaint: { 'fill-color': '#38bdf8', 'fill-opacity': 0.5 },
      linePaint: { 'line-color': '#334155', 'line-width': 2 },
      circlePaint: { 'circle-color': '#38bdf8', 'circle-radius': 6 },
    };
    const next = applyAttributeDriveToVectorStylePack(base, {
      attributeTransparency: {
        enabled: true,
        field: 'pop',
        dividedByField: '',
        valueMin: 0,
        valueMax: 100,
        highTransparency: 0,
        lowTransparency: 50,
        includeInLegend: false,
      },
    });
    expect(Array.isArray(next.fillPaint['fill-opacity'])).toBe(true);
  });

  it('applies circle-rotate when rotation enabled', () => {
    const base = {
      fillFilter: [],
      lineFilter: [],
      pointFilter: [],
      fillPaint: {},
      linePaint: {},
      circlePaint: { 'circle-radius': 6 },
    };
    const next = applyAttributeDriveToVectorStylePack(base, {
      attributeRotation: {
        enabled: true,
        field: 'bearing',
        mode: 'geographic',
      },
    });
    expect(next.circlePaint['circle-rotate']).toBeTruthy();
    expect(buildAttributeRotationExpr({ enabled: true, field: 'bearing', mode: 'arithmetic' })?.[0]).toBe('-');
  });
});
