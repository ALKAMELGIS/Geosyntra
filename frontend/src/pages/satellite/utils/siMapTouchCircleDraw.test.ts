import { describe, expect, it } from 'vitest';
import {
  SI_TOUCH_CIRCLE_CANCEL_MOVE_PX,
  buildTouchCircleAoiFeature,
  isTouchPointerEvent,
  shouldCancelTouchCircleLongPress,
} from './siMapTouchCircleDraw';

describe('siMapTouchCircleDraw', () => {
  it('detects touch pointer events', () => {
    expect(isTouchPointerEvent({ pointerType: 'touch' } as PointerEvent)).toBe(true);
    expect(isTouchPointerEvent({ pointerType: 'mouse' } as PointerEvent)).toBe(false);
  });

  it('cancels long-press when finger moves too far', () => {
    const pending = {
      pointerId: 1,
      startClientX: 100,
      startClientY: 100,
      center: [0, 0] as [number, number],
    };
    expect(
      shouldCancelTouchCircleLongPress(
        pending,
        100 + SI_TOUCH_CIRCLE_CANCEL_MOVE_PX + 2,
        100,
      ),
    ).toBe(true);
    expect(shouldCancelTouchCircleLongPress(pending, 105, 100)).toBe(false);
  });

  it('builds circle AOI with center and radius metadata', () => {
    const f = buildTouchCircleAoiFeature(10, 20, 10.01, 20, 1200);
    expect(f.geometry.type).toBe('Polygon');
    expect(f.properties?.aoiShape).toBe('circle');
    expect(f.properties?.centerLng).toBe(10);
    expect(f.properties?.centerLat).toBe(20);
    expect(f.properties?.radiusM).toBe(1200);
  });
});
