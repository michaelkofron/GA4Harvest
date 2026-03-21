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
      if (metrics.includes(key)) {
        metricsObj[key] = val
      } else if (dimensions.includes(key)) {
        dimensionsObj[key] = val
      } else {
        base[key] = val
      }
    }

    const result: Record<string, unknown> = { ...base }
    if (Object.keys(dimensionsObj).length > 0) result.dimensions = dimensionsObj
    result.metrics = metricsObj
    return result
  })

  triggerDownload(JSON.stringify(structured, null, 2), 'application/json', filename)
}
