import { describe, expect, it } from 'vitest';
import { isSiActiveDrawSketchSession, siMapDrawAssistHintForShape } from './siMapDrawSketchSession';

describe('isSiActiveDrawSketchSession', () => {
  const base = {
    mapDrawTool: 'polygon' as const,
    polygonRingLength: 0,
    hasPolylineStart: false,
    hasRectCirclePreview: false,
    hasCircleRefineDraft: false,
  };

  it('is inactive for polygon tool with no vertices', () => {
    expect(isSiActiveDrawSketchSession(base)).toBe(false);
  });

  it('is active after first polygon vertex', () => {
    expect(isSiActiveDrawSketchSession({ ...base, polygonRingLength: 1 })).toBe(true);
  });

  it('is active during rectangle drag', () => {
    expect(
      isSiActiveDrawSketchSession({
        ...base,
        mapDrawTool: 'rectangle',
        dragRectCircleActive: true,
      }),
    ).toBe(true);
  });

  it('is inactive for rectangle tool before drag', () => {
    expect(isSiActiveDrawSketchSession({ ...base, mapDrawTool: 'rectangle' })).toBe(false);
  });

  it('is active when rect preview exists', () => {
    expect(
      isSiActiveDrawSketchSession({
        ...base,
        mapDrawTool: 'rectangle',
        hasRectCirclePreview: true,
      }),
    ).toBe(true);
  });
});

describe('siMapDrawAssistHintForShape', () => {
  it('mentions 3d rotate for polygon', () => {
    expect(siMapDrawAssistHintForShape('polygon', { elevation3d: true })).toMatch(/rotate/i);
  });
});
