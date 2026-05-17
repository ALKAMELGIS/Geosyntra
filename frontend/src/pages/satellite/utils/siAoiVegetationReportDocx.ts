import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

type DocBlock = Paragraph | Table;
import type { StaticAoiChartLayerId } from './staticAoiMultiChartData';
import type {
  SiAoiIndexInsightId,
  SiAoiPdfExportOptions,
  SiAoiReportModel,
} from './siAoiVegetationReportModel';
import { getSiAoiExportExecutiveSummaryText } from './siAoiVegetationReportModelPdf';
import { siAoiReportStyleModePdfLabels } from './siAoiReportStyleMode';

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary = atob(b64);
  const len = binary.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function p(text: string, opts?: { bold?: boolean; heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel] }) {
  return new Paragraph({
    heading: opts?.heading,
    alignment: AlignmentType.LEFT,
    children: [new TextRun({ text, bold: opts?.bold })],
  });
}

function fmtIndex(id: SiAoiIndexInsightId, v: number) {
  return id === 'LST' ? v.toFixed(2) : v.toFixed(3);
}

function fmtMean(indexId: StaticAoiChartLayerId, v: number) {
  return indexId === 'LST' ? v.toFixed(1) : v.toFixed(3);
}

function fmtBound(indexId: StaticAoiChartLayerId, v: number) {
  return indexId === 'LST' ? v.toFixed(1) : v.toFixed(2);
}

function fitRasterBox(naturalW: number, naturalH: number, maxW: number, maxH: number) {
  const ratio = naturalW / Math.max(1, naturalH);
  let width = maxW;
  let height = width / ratio;
  if (height > maxH) {
    height = maxH;
    width = height * ratio;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

function loadImageNaturalSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('image load failed'));
    img.src = dataUrl;
  });
}

function imageParagraph(dataUrl: string | null | undefined, width: number, height: number): Paragraph {
  if (!dataUrl || !dataUrl.startsWith('data:image')) {
    return new Paragraph({
      children: [new TextRun({ text: '(Image not captured)', italics: true, color: '666666' })],
    });
  }
  try {
    const data = dataUrlToUint8Array(dataUrl);
    const isJpeg = /data:image\/jpe?g/i.test(dataUrl);
    return new Paragraph({
      children: [
        new ImageRun({
          data,
          transformation: { width, height },
          type: isJpeg ? 'jpg' : 'png',
        }),
      ],
    });
  } catch {
    return new Paragraph({
      children: [new TextRun({ text: '(Image embed failed)', italics: true, color: '666666' })],
    });
  }
}

async function imageParagraphFit(
  dataUrl: string | null | undefined,
  maxW: number,
  maxH: number,
): Promise<Paragraph> {
  if (!dataUrl || !dataUrl.startsWith('data:image')) {
    return imageParagraph(null, maxW, maxH);
  }
  try {
    const { w, h } = await loadImageNaturalSize(dataUrl);
    const box = fitRasterBox(w, h, maxW, maxH);
    return imageParagraph(dataUrl, box.width, box.height);
  } catch {
    return imageParagraph(dataUrl, maxW, maxH);
  }
}

function classificationTable(report: SiAoiReportModel): Table {
  const head = new TableRow({
    tableHeader: true,
    children: ['Class', 'Area (km²)', 'Share %'].map(
      t =>
        new TableCell({
          width: { size: 33, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: t, bold: true })] })],
        }),
    ),
  });
  const body = report.tableRows.map(
    row =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 33, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ text: row.labelEn })],
          }),
          new TableCell({
            width: { size: 33, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ text: row.areaKm2.toFixed(3) })],
          }),
          new TableCell({
            width: { size: 33, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ text: row.pct.toFixed(1) })],
          }),
        ],
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [head, ...body],
  });
}

function indexInsightsTable(report: SiAoiReportModel): Table {
  const di = report.dataInsights;
  const head = new TableRow({
    tableHeader: true,
    children: ['Index', 'Min', 'Max', 'Mean', 'Std dev', 'Status'].map(
      t =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: t, bold: true })] })],
        }),
    ),
  });
  const rows = di.indexRows.map(
    r =>
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph(r.label)] }),
          new TableCell({ children: [new Paragraph(fmtIndex(r.indexId, r.min))] }),
          new TableCell({ children: [new Paragraph(fmtIndex(r.indexId, r.max))] }),
          new TableCell({ children: [new Paragraph(fmtIndex(r.indexId, r.mean))] }),
          new TableCell({ children: [new Paragraph(fmtIndex(r.indexId, r.std))] }),
          new TableCell({ children: [new Paragraph(r.status)] }),
        ],
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [head, ...rows],
  });
}

function appendixBlocks(report: SiAoiReportModel, opts: SiAoiPdfExportOptions): DocBlock[] {
  const di = report.dataInsights;
  const d = di.dashboard;
  const exec = getSiAoiExportExecutiveSummaryText(report, opts.executiveSummaryAi);
  const styleMode = opts.reportStyleMode ?? report.reportStyleMode;
  const pdfLabels = siAoiReportStyleModePdfLabels(styleMode);
  return [
    p('Data & insights (appendix)', { bold: true, heading: HeadingLevel.HEADING_1 }),
    p(`1. ${pdfLabels.narrativeSectionTitle} (${styleMode})`, { bold: true, heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ children: [new TextRun(exec)] }),
    p('2. Index data', { bold: true, heading: HeadingLevel.HEADING_2 }),
    indexInsightsTable(report),
    p('3. AOI summary KPIs', { bold: true, heading: HeadingLevel.HEADING_2 }),
    new Paragraph({
      children: [
        new TextRun(
          `NDVI average: ${d.ndviAvg.toFixed(3)}. NDWI: ${d.ndwiStatusLabel}. Vegetation change: ${d.vegChangePct >= 0 ? '+' : ''}${d.vegChangePct.toFixed(1)}%. Heat risk: ${d.heatRiskLabel}. Urban expansion proxy: ${d.urbanExpansionPct.toFixed(1)}%.`,
        ),
      ],
    }),
    p('4. Class distribution (approximate %)', { bold: true, heading: HeadingLevel.HEADING_3 }),
    new Paragraph({
      children: [
        new TextRun(
          d.pieSlices.map(s => `${s.label}: ${s.pct.toFixed(1)}%`).join(' · '),
        ),
      ],
    }),
  ];
}

async function changeDetectionGridTable(report: SiAoiReportModel, opts: SiAoiPdfExportOptions): Promise<Table> {
  const slots = report.changeDetectionSlots.slice(0, 12);
  const imgs = opts.changeSlotMapImageDataUrls ?? [];
  const rows: TableRow[] = [];
  for (let r = 0; r < 4; r++) {
    const cells: TableCell[] = [];
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      const slot = slots[idx];
      if (!slot) {
        cells.push(new TableCell({ children: [new Paragraph('')] }));
        continue;
      }
      cells.push(
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: slot.date, bold: true })],
            }),
            await imageParagraphFit(imgs[idx], 200, 112),
            new Paragraph({
              children: [
                new TextRun(
                  `${report.indexLabel} mean ${fmtMean(report.indexId, slot.stats.indexMean)} · range ${fmtBound(report.indexId, slot.stats.indexMin)}–${fmtBound(report.indexId, slot.stats.indexMax)}`,
                ),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun(
                  `Top shares: ${slot.stats.highPct.toFixed(0)}% · ${slot.stats.medPct.toFixed(0)}% · ${slot.stats.lowPct.toFixed(0)}% · ${slot.stats.pixelCount} px`,
                ),
              ],
            }),
          ],
        }),
      );
    }
    rows.push(new TableRow({ children: cells }));
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}

function legendParagraphs(report: SiAoiReportModel): DocBlock[] {
  const pal = report.classificationPalette;
  const lines = report.tableRows.map(row => {
    const col =
      row.colorHex ?? (row.key === 'high' ? pal.high : row.key === 'medium' ? pal.medium : row.key === 'low' ? pal.low : '#64748b');
    return `${row.labelEn} — ${row.pct.toFixed(1)}% (${col})`;
  });
  lines.push(`AOI outline — ${pal.aoiOutline}`);
  return [
    p('Classification legend', { bold: true, heading: HeadingLevel.HEADING_2 }),
    ...lines.map(t => new Paragraph({ children: [new TextRun(t)] })),
  ];
}

async function buildAoiAnalysisDocxChildren(report: SiAoiReportModel, opts: SiAoiPdfExportOptions): Promise<DocBlock[]> {
  const out: DocBlock[] = [
    p('AOI analysis report', { bold: true, heading: HeadingLevel.TITLE }),
    p(`Geosyntra · Satellite intelligence · ${report.legendBandCount}-band legend`),
    p(`AOI: ${report.aoiName}`, { bold: true }),
    ...(report.satelliteProviderName?.trim()
      ? [p(`Satellite provider: ${report.satelliteProviderName.trim()}`)]
      : []),
    p(`Index: ${report.indexLabel}   Period: ${report.dateStart} … ${report.dateEnd}`),
    p(`AOI area: ${report.aoiAreaKm2.toFixed(3)} km²`),
    ...appendixBlocks(report, opts),
    p('Scientific analysis', { bold: true, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun(report.analysisEn)] }),
  ];
  if (report.stressNoteEn) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: `Stress note: ${report.stressNoteEn}`, color: 'B45309' })],
      }),
    );
  }
  out.push(p('Legend-aligned classification', { bold: true, heading: HeadingLevel.HEADING_2 }));
  out.push(classificationTable(report));
  if (report.timeSeries.length >= 2) {
    out.push(p(`${report.indexLabel} timeline`, { bold: true, heading: HeadingLevel.HEADING_2 }));
    if (opts.chartImageDataUrl) {
      out.push(imageParagraph(opts.chartImageDataUrl, 560, 280));
    } else {
      out.push(new Paragraph({ children: [new TextRun('(Timeline chart not exported — open preview tab first)')] }));
    }
  }
  if (opts.aoiMapImageDataUrl) {
    out.push(p('AOI map snapshot', { bold: true, heading: HeadingLevel.HEADING_2 }));
    out.push(await imageParagraphFit(opts.aoiMapImageDataUrl, 560, 315));
  }
  out.push(
    new Paragraph({
      children: [
        new TextRun({
          text:
            'Map and chart images embed when captured from the live Satellite Intelligence map. Word layout mirrors the PDF export structure.',
          italics: true,
          size: 18,
        }),
      ],
    }),
  );
  return out;
}

async function buildChangeDetectionDocxChildren(report: SiAoiReportModel, opts: SiAoiPdfExportOptions): Promise<DocBlock[]> {
  const out: DocBlock[] = [
    p('Time series change detection', { bold: true, heading: HeadingLevel.TITLE }),
    p(`${report.indexLabel} · ${report.aoiName}`, { bold: true }),
    p(`Period ${report.dateStart} … ${report.dateEnd}   ·   AOI area ${report.aoiAreaKm2.toFixed(3)} km²`),
    p('Per-date map grid (live viewer snapshots)', { bold: true, heading: HeadingLevel.HEADING_1 }),
    await changeDetectionGridTable(report, opts),
    p(`${report.indexLabel} timeline`, { bold: true, heading: HeadingLevel.HEADING_1 }),
    opts.chartImageDataUrl
      ? imageParagraph(opts.chartImageDataUrl, 560, 280)
      : new Paragraph({ children: [new TextRun('(Timeline chart not captured)')] }),
    ...legendParagraphs(report),
    new Paragraph({ pageBreakBefore: true, children: [] }),
    ...appendixBlocks(report, opts),
  ];
  return out;
}

/** Word (.docx) export — same raster assets as PDF (chart + map thumbnails). */
export async function exportSiAoiVegetationReportDocx(report: SiAoiReportModel, options: SiAoiPdfExportOptions) {
  const children =
    options.mode === 'TIME_SERIES_CHANGE_DETECTION'
      ? await buildChangeDetectionDocxChildren(report, options)
      : await buildAoiAnalysisDocxChildren(report, options);

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename =
    options.mode === 'TIME_SERIES_CHANGE_DETECTION'
      ? `aoi-timeseries-change-detection-${stamp}.docx`
      : `aoi-analysis-report-${stamp}.docx`;
  triggerDownload(blob, filename);
}
