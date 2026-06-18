import type { jsPDF } from 'jspdf';

export type DownloadJsPdfResult = 'anchor' | 'jspdf-save' | 'tab';

function sanitizePdfFilename(filename: string): string {
  const trimmed = filename.trim() || 'geosyntra-map-print.pdf';
  const withExt = trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`;
  return withExt.replace(/[\\/:*?"<>|]/g, '_');
}

/**
 * Triggers a PDF download after async jsPDF work.
 * Revokes the blob URL only after a delay (immediate revoke can cancel large vector exports).
 */
export function downloadJsPdf(doc: jsPDF, filename: string): DownloadJsPdfResult {
  const safeName = sanitizePdfFilename(filename);
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);

  const revokeLater = () => {
    window.setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    }, 120_000);
  };

  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = safeName;
    anchor.rel = 'noopener';
    anchor.style.cssText = 'position:fixed;left:-9999px;opacity:0;pointer-events:none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    revokeLater();
    return 'anchor';
  } catch {
    /* try fallbacks */
  }

  try {
    doc.save(safeName);
    revokeLater();
    return 'jspdf-save';
  } catch {
    /* try tab */
  }

  const tab = window.open(url, '_blank', 'noopener,noreferrer');
  if (!tab) {
    URL.revokeObjectURL(url);
    throw new Error(
      'PDF download was blocked. Allow downloads for this site, or disable "Vector PDF" and export again.',
    );
  }
  revokeLater();
  return 'tab';
}
