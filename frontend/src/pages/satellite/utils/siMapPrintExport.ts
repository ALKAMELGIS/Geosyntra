import { appAlert } from '../../../lib/appDialog';
import type { SiPdfLngLatBounds } from './siAoiReportCartography';
import type { SiAoiLegendStripItem } from './siAoiReportSlotMapRender';
import { downloadJsPdf } from './siMapPrintPdfDownload';
import { exportSiMapPrintVectorPdf } from './siMapPrintPdfVector';
import type { SiMapPrintLayerIndexRow } from './siMapPrintLayerIndex';
import type { SiMapPrintSettings } from './siMapPrintTypes';

async function exportSiMapPrintRasterPdf(composedPng: string, settings: SiMapPrintSettings, filename: string) {
  const { default: jsPDF } = await import('jspdf');
  const orientation = settings.orientation === 'landscape' ? 'landscape' : 'portrait';
  const format = settings.paper.toLowerCase() as 'a4' | 'a3';
  const doc = new jsPDF({ orientation, unit: 'mm', format, compress: false });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 5;
  doc.addImage(composedPng, 'PNG', margin, margin, pageW - margin * 2, pageH - margin * 2, undefined, 'SLOW');
  downloadJsPdf(doc, filename);
}

export async function exportSiMapPrintPdf(
  composedPng: string,
  settings: SiMapPrintSettings,
  filename = 'geosyntra-map-print.pdf',
  opts: {
    rawMapPng: string;
    legendItems: SiAoiLegendStripItem[];
    layerIndexRows: SiMapPrintLayerIndexRow[];
    mapLngLatBounds: SiPdfLngLatBounds | null;
    metaLine?: string;
  },
) {
  if (settings.vectorPdf) {
    try {
      await exportSiMapPrintVectorPdf(
        opts.rawMapPng,
        settings,
        opts.legendItems,
        opts.layerIndexRows,
        opts.mapLngLatBounds,
        opts.metaLine,
        filename,
      );
      return;
    } catch (err) {
      console.warn('[siMapPrint] vector PDF failed; using full-page raster export', err);
    }
  }

  await exportSiMapPrintRasterPdf(composedPng, settings, filename);
}

/** Opens the system print dialog (user picks printer, copies, paper). */
export function triggerSiMapBrowserPrint(pngDataUrl: string, title: string) {
  const safeTitle = title.replace(/[<>"']/g, '');
  const w = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
  if (!w) {
    void appAlert('Allow pop-ups to print. You can choose your printer in the dialog that opens.', {
      title: 'Print',
    });
    return;
  }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${safeTitle}</title>
<style>
  @page { margin: 8mm; size: auto; }
  html, body { margin: 0; background: #fff; }
  img { display: block; width: 100%; height: auto; max-height: 100vh; object-fit: contain; }
  .hint { font: 11px system-ui, sans-serif; color: #64748b; padding: 8px 12px; text-align: center; }
  @media print { .hint { display: none; } body { background: #fff; } }
</style></head>
<body>
<p class="hint">Use your browser print dialog to select a printer, paper size, and orientation.</p>
<img src="${pngDataUrl}" alt="Map print" onload="window.focus();window.print();"/>
</body></html>`);
  w.document.close();
}
