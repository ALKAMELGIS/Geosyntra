import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { RecipeColumn } from '../formFieldColumns'
import type { RecipeRow } from './loadRecipeRows'
import {
  bboxFromPts,
  collectLngLats,
  findLayerGeoJson,
  loadStoredLayers,
  primaryLayerSourceId,
} from './layerGeo'

const ACCENT: [number, number, number] = [4, 120, 87]
const INK: [number, number, number] = [15, 23, 42]
const MUTED: [number, number, number] = [100, 116, 139]

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e7) return n.toExponential(2)
  if (abs >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
}

function parseNumericValues(rows: RecipeRow[], colId: string): number[] {
  const nums: number[] = []
  for (const r of rows) {
    const t = String(r.cells[colId] ?? '').trim().replace(/,/g, '')
    if (!t) continue
    const n = Number(t)
    if (Number.isFinite(n)) nums.push(n)
  }
  return nums
}

function computeNumericSummaries(columns: RecipeColumn[], rows: RecipeRow[]) {
  const summaries: Array<{ column: string; field: string; count: number; sum: number; avg: number; min: number; max: number }> =
    []
  for (const col of columns) {
    const vals = parseNumericValues(rows, col.id)
    if (vals.length === 0) continue
    const sum = vals.reduce((a, b) => a + b, 0)
    const avg = sum / vals.length
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    summaries.push({
      column: col.header.replace(/_/g, ' '),
      field: col.fieldName,
      count: vals.length,
      sum,
      avg,
      min,
      max,
    })
  }
  return summaries
}

function analysisText(opts: {
  workflowTitle: string
  rowCount: number
  columnCount: number
  summaries: ReturnType<typeof computeNumericSummaries>
  dateIso: string
  hasMap: boolean
}): string[] {
  const { workflowTitle, rowCount, columnCount, summaries, dateIso, hasMap } = opts
  const p: string[] = []
  p.push(
    `This analytical summary describes locally saved "${workflowTitle}" recipe rows aligned with fields configured under Master Data → Data Management. ` +
      `The extract contains ${rowCount} record${rowCount === 1 ? '' : 's'} and ${columnCount} configured column${columnCount === 1 ? '' : 's'}, generated on ${dateIso}.`,
  )
  if (rowCount === 0) {
    p.push(
      `No submissions were found in browser storage for this workflow. Submit entries from Data Entry or verify that saves completed successfully before exporting.`,
    )
    return p
  }
  if (summaries.length === 0) {
    p.push(
      `Across selected attributes, values appear predominantly categorical or textual; automated averages were therefore not computed. Review the detailed table for qualitative comparison across submissions.`,
    )
  } else {
    const top = summaries.slice().sort((a, b) => b.count - a.count)[0]
    p.push(
      `Among numeric-capable fields, "${top.column}" contributes ${top.count} quantitative observation${top.count === 1 ? '' : 's'}. ` +
        `Its central tendency (mean ${fmtNum(top.avg)}) sits between ${fmtNum(top.min)} and ${fmtNum(top.max)}, indicating ` +
        (top.max > top.min * 1.05
          ? `measurable dispersion suitable for operational monitoring and variance checks in subsequent audits.`
          : `limited dispersion across captured submissions within this snapshot.`),
    )
    const sums = summaries.filter(s => Math.abs(s.sum) > 1e-9)
    if (sums.length) {
      const s = sums.sort((a, b) => Math.abs(b.sum) - Math.abs(a.sum))[0]
      p.push(
        `Aggregate intensity is strongest on "${s.column}" with a summed total of ${fmtNum(s.sum)} across ${s.count} populated cells—useful when interpreting throughput-oriented KPIs tied to this workflow.`,
      )
    }
  }
  p.push(
    `Interpretation note: figures reflect browser-local drafts and submissions only; connect backend pipelines before regulatory reporting. ` +
      `Correlation and significance testing are outside the scope of this brief.`,
  )
  if (hasMap) {
    p.push(
      `The spatial panel outlines the geographic footprint derived from the first configured GIS layer’s geometries stored on this device (IndexedDB). It serves as orientation context rather than cadastral certification.`,
    )
  }
  return p
}

function mapLngLatToPdf(
  lng: number,
  lat: number,
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  x: number,
  yTop: number,
  w: number,
  h: number,
): [number, number] {
  const { minLng, minLat, maxLng, maxLat } = bbox
  const dlng = Math.max(maxLng - minLng, 1e-9)
  const dlat = Math.max(maxLat - minLat, 1e-9)
  const px = x + ((lng - minLng) / dlng) * w
  const py = yTop + h - ((lat - minLat) / dlat) * h
  return [px, py]
}

function drawExtentSketch(
  doc: jsPDF,
  fc: { features?: unknown[] },
  x: number,
  yTop: number,
  w: number,
  h: number,
): void {
  const pts = collectLngLats(fc as any)
  const bbox = bboxFromPts(pts)
  doc.setDrawColor(MUTED[0], MUTED[1], MUTED[2])
  doc.setLineWidth(0.35)
  doc.rect(x, yTop, w, h)

  if (!bbox || pts.length === 0) {
    doc.setFontSize(8)
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    doc.text('No drawable geometry found for this layer snapshot.', x + 2, yTop + h / 2)
    doc.setTextColor(INK[0], INK[1], INK[2])
    return
  }

  doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2])
  doc.setLineWidth(0.45)

  const ringDraw = (coords: unknown): void => {
    const ringPts: [number, number][] = []
    const collect = (c: unknown): void => {
      if (!c) return
      if (typeof (c as number[])[0] === 'number' && typeof (c as number[])[1] === 'number') {
        ringPts.push(mapLngLatToPdf((c as number[])[0], (c as number[])[1], bbox, x, yTop, w, h))
        return
      }
      if (Array.isArray(c)) c.forEach(collect)
    }
    collect(coords)
    if (ringPts.length < 2) return
    for (let i = 0; i < ringPts.length; i++) {
      const a = ringPts[i]
      const b = ringPts[(i + 1) % ringPts.length]
      doc.line(a[0], a[1], b[0], b[1])
    }
  }

  for (const f of fc.features ?? []) {
    const geom = (f as any)?.geometry
    if (!geom) continue
    const g = geom
    if (g.type === 'Polygon') ringDraw(g.coordinates)
    else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates ?? []) ringDraw(poly?.[0])
    } else if (g.type === 'LineString') ringDraw(g.coordinates)
    else if (g.type === 'MultiLineString') {
      for (const ls of g.coordinates ?? []) ringDraw(ls)
    } else if (g.type === 'Point') {
      const coord = mapLngLatToPdf(g.coordinates[0], g.coordinates[1], bbox, x, yTop, w, h)
      doc.setFillColor(219, 244, 232)
      doc.circle(coord[0], coord[1], 1.2, 'FD')
    }
  }

  doc.setFontSize(7)
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  doc.text(
    `Extent W:${bbox.minLng.toFixed(4)} E:${bbox.maxLng.toFixed(4)} S:${bbox.minLat.toFixed(4)} N:${bbox.maxLat.toFixed(4)}`,
    x + 1,
    yTop + h - 2,
  )
  doc.setTextColor(INK[0], INK[1], INK[2])
}

export async function generateRecipeReportPdf(opts: {
  workflowTitle: string
  formSlug: string
  columns: RecipeColumn[]
  rows: RecipeRow[]
}): Promise<void> {
  const { workflowTitle, formSlug, columns, rows } = opts
  const generatedAt = new Date()
  const dateIso = generatedAt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'

  const summaries = computeNumericSummaries(columns, rows)
  const layers = await loadStoredLayers()
  const primId = primaryLayerSourceId(columns)
  const fc = primId ? findLayerGeoJson(layers, primId) : null
  const paragraphs = analysisText({
    workflowTitle,
    rowCount: rows.length,
    columnCount: columns.length,
    summaries,
    dateIso,
    hasMap: Boolean(fc?.features?.length),
  })

  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const m = 14
  let y = m

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text('Recipes — analytical summary report', m, y)
  y += 9

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  doc.text(workflowTitle.replace(/_/g, ' '), m, y)
  y += 6
  doc.text(`Generated ${dateIso}`, m, y)
  y += 10

  doc.setFontSize(10)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.setFont('helvetica', 'bold')
  doc.text('Executive narrative', m, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  for (const para of paragraphs) {
    const lines = doc.splitTextToSize(para, pw - m * 2)
    doc.text(lines, m, y)
    y += lines.length * 4.8 + 3
    if (y > ph - m - 40) {
      doc.addPage()
      y = m
    }
  }

  y += 4
  doc.setFont('helvetica', 'bold')
  doc.text('Aggregate metrics', m, y)
  y += 4

  const aggHead = [['Metric', 'Value']]
  const aggBody: string[][] = [['Records considered', String(rows.length)]]
  for (const s of summaries) {
    aggBody.push([`${s.column} — count`, String(s.count)])
    aggBody.push([`${s.column} — average`, fmtNum(s.avg)])
    aggBody.push([`${s.column} — sum`, fmtNum(s.sum)])
    aggBody.push([`${s.column} — min`, fmtNum(s.min)])
    aggBody.push([`${s.column} — max`, fmtNum(s.max)])
  }

  autoTable(doc, {
    startY: y,
    head: aggHead,
    body: aggBody,
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.5, textColor: INK },
    headStyles: { fillColor: ACCENT, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    theme: 'striped',
    margin: { left: m, right: m },
  })
  y = (doc as any).lastAutoTable.finalY + 10

  if (fc && columns.length) {
    if (y > ph - m - 95) {
      doc.addPage()
      y = m
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('Spatial context — primary configured layer footprint', m, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    doc.text(
      `Layer identifier reference: ${String(primId)} — geometries rendered from locally cached GIS content.`,
      m,
      y,
    )
    y += 6
    doc.setTextColor(INK[0], INK[1], INK[2])
    const mapW = pw - m * 2
    const mapH = 72
    drawExtentSketch(doc, fc, m, y, mapW, mapH)
    y += mapH + 10
  }

  if (columns.length && rows.length) {
    if (y > ph - m - 30) {
      doc.addPage()
      y = m
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('Detailed submissions', m, y)
    y += 5

    const head = [columns.map(c => c.header.replace(/_/g, ' '))]
    const body = rows.map(r => columns.map(c => String(r.cells[c.id] ?? '').slice(0, 320)))

    autoTable(doc, {
      startY: y,
      head,
      body,
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.8, valign: 'top' },
      headStyles: { fillColor: ACCENT, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [252, 252, 253] },
      theme: 'striped',
      margin: { left: m, right: m },
      tableWidth: pw - m * 2,
    })
  }

  const foot = `Confidential operational snapshot • ${workflowTitle} • Page `
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    doc.text(`${foot}${i} / ${totalPages}`, m, ph - 8)
  }

  const safeSlug = formSlug.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)
  doc.save(`recipe-report-${safeSlug}-${generatedAt.toISOString().slice(0, 10)}.pdf`)
}
