import fs from 'fs'
import path from 'path'

const dir = path.join('src', 'pages', 'satellite', 'utils')
const p = path.join(dir, 'siAoiVegetationReportModel.ts')
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/)

const pdfEmbed = lines.slice(31, 55).join('\n')
const mid = lines.slice(55, 915).join('\n')
const pdfTail = lines.slice(915).join('\n')

const pdfHeader = `import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { geodesicAreaHectares } from './siFieldGeodesicArea'
import {
  STATIC_AOI_CHART_LAYER_OPTIONS,
  staticAoiLayerMeanForWeek,
  type StaticAoiChartLayerId,
} from './staticAoiMultiChartData'
import {
  SI_NDMI_CLASSIFICATION_STOPS,
  SI_NDVI_CLASSIFICATION_STOPS,
  SI_NDWI_CLASSIFICATION_STOPS,
  type IndexRampStop,
  siThinLegendSegments,
} from '../../../lib/siWmsIndexClassificationRamp'
import type { SiPdfLngLatBounds } from './siAoiReportGeo'
import {
  DEFAULT_SI_AOI_REPORT_STYLE_MODE,
  siAoiReportStyleModeInterpretationConfig,
  siAoiReportStyleModePdfLabels,
  type SiAoiReportStyleMode,
} from './siAoiReportStyleMode'
import type {
  SiAoiClassificationPalette,
  SiAoiReportTableRow,
} from './siAoiReportCartographyTypes'
import type { SiAoiPdfExportOptions, SiAoiReportModel } from './siAoiVegetationReportModel'

`

const pdfBody = pdfTail.replace(
  'export async function exportSiAoiVegetationReportPdf',
  'export async function exportSiAoiVegetationReportPdfImpl',
)

fs.writeFileSync(path.join(dir, 'siAoiVegetationReportModelPdf.ts'), pdfHeader + pdfEmbed + '\n' + pdfBody)

const modelHead = lines.slice(0, 31).filter(l => !l.includes("jspdf")).join('\n')
const typesBlock = lines.slice(895, 915).join('\n')
fs.writeFileSync(p, modelHead + '\n' + mid + '\n' + typesBlock + '\n')

console.log('split complete')
