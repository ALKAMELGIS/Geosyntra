import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { downloadJsPdf } from './siMapPrintPdfDownload';

describe('downloadJsPdf', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => 'blob:test-pdf'),
        revokeObjectURL: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('downloads via anchor and delays blob revoke', () => {
    const doc = {
      output: vi.fn(() => new Blob(['pdf'], { type: 'application/pdf' })),
      save: vi.fn(),
    };
    const click = vi.fn();
    const anchor = { href: '', download: '', rel: '', style: { cssText: '' }, click, remove: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValue(anchor as unknown as HTMLElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => anchor as unknown as Node);

    const result = downloadJsPdf(doc as never, 'geosyntra-map-2026-06-02.pdf');

    expect(result).toBe('anchor');
    expect(click).toHaveBeenCalled();
    expect(anchor.download).toBe('geosyntra-map-2026-06-02.pdf');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });
});
