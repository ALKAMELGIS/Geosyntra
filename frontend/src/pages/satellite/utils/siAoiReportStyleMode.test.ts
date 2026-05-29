import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SI_AOI_REPORT_STYLE_MODE,
  isSiAoiReportStyleMode,
  siAoiReportStyleModeExecutiveConfig,
  siAoiReportStyleModeInterpretationConfig,
  siAoiReportStyleModePdfLabels,
} from './siAoiReportStyleMode';

describe('siAoiReportStyleMode', () => {
  it('defaults to SCIENTIFIC', () => {
    expect(DEFAULT_SI_AOI_REPORT_STYLE_MODE).toBe('SCIENTIFIC');
  });

  it('validates mode strings', () => {
    expect(isSiAoiReportStyleMode('EXECUTIVE')).toBe(true);
    expect(isSiAoiReportStyleMode('CASUAL')).toBe(false);
  });

  it('assigns distinct PDF titles per mode', () => {
    const scientific = siAoiReportStyleModePdfLabels('SCIENTIFIC');
    const executive = siAoiReportStyleModePdfLabels('EXECUTIVE');
    expect(scientific.reportTitle).toContain('Scientific');
    expect(executive.reportTitle).toContain('Executive');
    expect(scientific.reportTitle).not.toBe(executive.reportTitle);
  });

  it('tunes executive length by mode', () => {
    expect(siAoiReportStyleModeExecutiveConfig('SUMMARY').maxChars).toBeLessThan(
      siAoiReportStyleModeExecutiveConfig('TECHNICAL').maxChars,
    );
    expect(siAoiReportStyleModeInterpretationConfig('SUMMARY').pointCount).toBe(3);
    expect(siAoiReportStyleModeInterpretationConfig('EXECUTIVE').pointCount).toBe(4);
  });
});
