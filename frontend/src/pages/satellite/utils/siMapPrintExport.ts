import type { SiMapPrintSettings } from './siMapPrintTypes';

export async function exportSiMapPrintPdf(
  pngDataUrl: string,
  settings: SiMapPrintSettings,
  filename = 'geosyntra-map-print.pdf',
) {
  const { default: jsPDF } = await import('jspdf');
  const orientation = settings.orientation === 'landscape' ? 'landscape' : 'portrait';
  const format = settings.paper.toLowerCase() as 'a4' | 'a3';
  const doc = new jsPDF({ orientation, unit: 'mm', format, compress: true });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 6;
  doc.addImage(pngDataUrl, 'PNG', margin, margin, pw - margin * 2, ph - margin * 2, undefined, 'FAST');
  doc.save(filename);
}

export function triggerSiMapBrowserPrint(pngDataUrl: string, title: string) {
  const safeTitle = title.replace(/[<>"']/g, '');
  const w = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
  if (!w) {
    window.alert('Allow pop-ups to print from the browser.');
    return;
  }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${safeTitle}</title>
<style>html,body{margin:0;background:#111}img{display:block;width:100%;height:auto}@media print{body{background:#fff}}</style></head>
<body><img src="${pngDataUrl}" alt="Map print" onload="window.focus();window.print();"/></body></html>`);
  w.document.close();
}
