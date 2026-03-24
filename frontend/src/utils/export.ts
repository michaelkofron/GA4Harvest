import ExcelJS from 'exceljs'
import type { QueryRow } from '../types'

function triggerDownload(content: string, mimeType: string, filename: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadCSV(rows: QueryRow[], filename: string) {
  if (!rows.length) return
  const keys = Object.keys(rows[0]).filter(k => k !== '_period')
  const escape = (v: unknown) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const lines = [keys.join(','), ...rows.map(r => keys.map(k => escape(r[k])).join(','))]
  triggerDownload(lines.join('\n'), 'text/csv', filename)
}

export function downloadJSON(
  rows: QueryRow[],
  filename: string,
  metrics: string[],
  dimensions: string[],
) {
  const structured = rows.map(row => {
    const base: Record<string, unknown> = {}
    const metricsObj: Record<string, unknown> = {}
    const dimensionsObj: Record<string, unknown> = {}

    for (const [key, val] of Object.entries(row)) {
      if (key === '_period') continue
      if (metrics.includes(key)) metricsObj[key] = val
      else if (dimensions.includes(key)) dimensionsObj[key] = val
      else base[key] = val
    }

    const result: Record<string, unknown> = { ...base }
    if (Object.keys(dimensionsObj).length > 0) result.dimensions = dimensionsObj
    result.metrics = metricsObj
    return result
  })

  triggerDownload(JSON.stringify(structured, null, 2), 'application/json', filename)
}

// ── Comparison exports ────────────────────────────────────────────────────────

export interface ComparisonRow {
  property_name: string
  account_name: string
  [key: string]: string | number | null
}

function isRateMetric(metric: string, rows: QueryRow[]): boolean {
  const vals = rows.map(r => r[metric]).filter(v => v !== null && v !== undefined && v !== '')
  if (!vals.length) return false
  return vals.every(v => { const s = String(v); const n = parseFloat(s); return s.includes('.') && n >= 0 && n < 1 })
}

function aggregateRows(rows: QueryRow[], metric: string, rate: boolean): number | null {
  const vals = rows.map(r => parseFloat(String(r[metric] ?? ''))).filter(v => !isNaN(v))
  if (!vals.length) return null
  return rate
    ? vals.reduce((a, b) => a + b, 0) / vals.length
    : vals.reduce((a, b) => a + b, 0)
}

export function buildComparisonRows(
  results: QueryRow[],
  metrics: string[],
  dimensions: string[] = [],
): ComparisonRow[] {
  const mainRows = results.filter(r => r._period !== 'compare')
  const compareRows = results.filter(r => r._period === 'compare')

  const SEP = '\u0000'
  const makeKey = (row: QueryRow) =>
    [String(row.property_name ?? ''), ...dimensions.map(d => String(row[d] ?? ''))].join(SEP)

  const uniqueKeys = [...new Set(mainRows.map(makeKey))]

  return uniqueKeys.map(key => {
    const [propName, ...dimVals] = key.split(SEP)
    const dimMap = Object.fromEntries(dimensions.map((d, i) => [d, dimVals[i] ?? '']))

    const matchesKey = (row: QueryRow) =>
      String(row.property_name ?? '') === propName &&
      dimensions.every(d => String(row[d] ?? '') === dimMap[d])

    const propMain = mainRows.filter(matchesKey)
    const propCmp = compareRows.filter(matchesKey)

    const accountName = String(propMain[0]?.account_name ?? '')
    const row: ComparisonRow = { property_name: propName, account_name: accountName, ...dimMap }

    for (const m of metrics) {
      const rate = isRateMetric(m, results)
      const main = aggregateRows(propMain, m, rate)
      const cmp = aggregateRows(propCmp, m, rate)
      const delta = main !== null && cmp !== null ? main - cmp : null
      const deltaPct = delta !== null && cmp !== null && cmp !== 0
        ? (delta / Math.abs(cmp)) * 100 : null

      row[`${m}_main`] = main
      row[`${m}_compare`] = cmp
      row[`${m}_delta`] = delta !== null ? parseFloat(delta.toFixed(6)) : null
      row[`${m}_delta_pct`] = deltaPct !== null ? parseFloat(deltaPct.toFixed(2)) : null
    }

    return row
  })
}

export function downloadComparisonCSV(rows: ComparisonRow[], filename: string) {
  if (!rows.length) return
  const keys = Object.keys(rows[0])
  const escape = (v: unknown) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const lines = [keys.join(','), ...rows.map(r => keys.map(k => escape(r[k])).join(','))]
  triggerDownload(lines.join('\n'), 'text/csv', filename)
}

export function downloadComparisonJSON(rows: ComparisonRow[], filename: string) {
  triggerDownload(JSON.stringify(rows, null, 2), 'application/json', filename)
}

export function copyComparisonTSV(rows: ComparisonRow[]): string {
  if (!rows.length) return ''
  const keys = Object.keys(rows[0])
  const lines = [
    keys,
    ...rows.map(r => keys.map(k => {
      const v = r[k]
      // delta_pct is stored as e.g. 3.5 (meaning 3.5%); divide by 100 so
      // Excel receives 0.035 and displays it correctly when formatted as %
      if (k.endsWith('_delta_pct') && typeof v === 'number') return String(v / 100)
      return String(v ?? '')
    })),
  ]
  return lines.map(r => r.join('\t')).join('\n')
}

// ── Excel exports ─────────────────────────────────────────────────────────────

// Standard Excel conditional-formatting palette
const POS_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } }
const NEG_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } }
const POS_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FF006100' } }
const NEG_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FF9C0006' } }

async function triggerXlsxDownload(wb: ExcelJS.Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

export async function downloadExcel(rows: QueryRow[], filename: string) {
  if (!rows.length) return
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Results')
  const keys = Object.keys(rows[0]).filter(k => k !== '_period')

  const header = ws.addRow(keys)
  header.font = { bold: true }

  rows.forEach(row => {
    ws.addRow(keys.map(k => {
      const v = row[k]
      if (v === null || v === undefined) return ''
      const n = Number(v)
      return !isNaN(n) && String(v).trim() !== '' ? n : String(v)
    }))
  })

  ws.columns.forEach(col => { col.width = 18 })
  await triggerXlsxDownload(wb, filename)
}

export async function downloadComparisonExcel(rows: ComparisonRow[], filename: string) {
  if (!rows.length) return
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Comparison')
  const keys = Object.keys(rows[0])

  const header = ws.addRow(keys)
  header.font = { bold: true }

  rows.forEach(row => {
    const values = keys.map(k => {
      const v = row[k]
      if (v === null || v === undefined) return ''
      const n = Number(v)
      // store delta_pct as decimal so Excel % format works correctly
      if (k.endsWith('_delta_pct') && !isNaN(n)) return n / 100
      return !isNaN(n) && String(v ?? '').trim() !== '' ? n : String(v ?? '')
    })
    const dataRow = ws.addRow(values)

    keys.forEach((k, ci) => {
      if (!k.endsWith('_delta') && !k.endsWith('_delta_pct')) return
      const v = row[k]
      const n = typeof v === 'number' ? v : Number(v)
      const cell = dataRow.getCell(ci + 1)
      if (!isNaN(n) && n > 0) { cell.fill = POS_FILL; cell.font = POS_FONT }
      else if (!isNaN(n) && n < 0) { cell.fill = NEG_FILL; cell.font = NEG_FONT }
      if (k.endsWith('_delta_pct')) cell.numFmt = '0.00%'
    })
  })

  ws.columns.forEach(col => { col.width = 18 })
  await triggerXlsxDownload(wb, filename)
}
