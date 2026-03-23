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

function aggregate(rows: QueryRow[], prop: string, metric: string, rate: boolean): number | null {
  const propRows = rows.filter(r => String(r.property_name) === prop)
  const vals = propRows.map(r => parseFloat(String(r[metric] ?? ''))).filter(v => !isNaN(v))
  if (!vals.length) return null
  return rate
    ? vals.reduce((a, b) => a + b, 0) / vals.length
    : vals.reduce((a, b) => a + b, 0)
}

export function buildComparisonRows(
  results: QueryRow[],
  metrics: string[],
): ComparisonRow[] {
  const mainRows = results.filter(r => r._period !== 'compare')
  const compareRows = results.filter(r => r._period === 'compare')
  const properties = [...new Set(mainRows.map(r => String(r.property_name ?? '')))]

  return properties.map(prop => {
    const accountName = String(mainRows.find(r => String(r.property_name) === prop)?.account_name ?? '')
    const row: ComparisonRow = { property_name: prop, account_name: accountName }

    for (const m of metrics) {
      const rate = isRateMetric(m, results)
      const main = aggregate(mainRows, prop, m, rate)
      const cmp = aggregate(compareRows, prop, m, rate)
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
  const lines = [keys, ...rows.map(r => keys.map(k => String(r[k] ?? '')))]
  return lines.map(r => r.join('\t')).join('\n')
}
