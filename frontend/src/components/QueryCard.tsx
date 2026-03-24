import { useState, useRef } from 'react'
import type { QueryHistoryItem, QueryRow } from '../types'
import { GRANULARITY_CARD_LABELS, GRANULARITY_DIMENSION } from '../types'
import {
  downloadExcel, downloadJSON,
  buildComparisonRows, downloadComparisonExcel, downloadComparisonJSON, copyComparisonTSV,
  type ComparisonRow,
} from '../utils/export'

interface Props {
  item: QueryHistoryItem
  onDelete: () => void
  defaultExpanded?: boolean
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return v.toLocaleString()
  const s = String(v)
  // GA4 date dimension returns YYYYMMDD – display as YYYY-MM-DD
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  const n = Number(s)
  return !isNaN(n) && s.trim() !== '' ? n.toLocaleString() : s
}

function classifyError(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('incompatible')) return 'This metric/dimension combination is incompatible. Try a different pairing.'
  if (m.includes('invalid') || m.includes('not found') || m.includes('field')) return 'One or more metric or dimension names are invalid for this property.'
  if (m.includes('rate limit') || m.includes('quota') || m.includes('resource exhausted')) return 'Rate limit hit. The query was retried but still failed.'
  if (m.includes('permission') || m.includes('forbidden') || m.includes('access denied')) return 'Service account does not have access to this property.'
  return msg
}

export default function QueryCard({ item, onDelete, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  // Results may be pre-loaded (fresh query) or lazily fetched (from storage)
  const [localResults, setLocalResults] = useState<QueryRow[] | null>(item.results ?? null)
  const [resultsLoading, setResultsLoading] = useState(false)
  const loadingRef = useRef(false)

  const loadResults = async (): Promise<QueryRow[]> => {
    if (localResults !== null) return localResults
    if (loadingRef.current) return []
    loadingRef.current = true
    setResultsLoading(true)
    try {
      const resp = await fetch(`/api/history/${item.id}`)
      const data = await resp.json()
      const r: QueryRow[] = data.results ?? []
      setLocalResults(r)
      return r
    } catch {
      setLocalResults([])
      return []
    } finally {
      setResultsLoading(false)
      loadingRef.current = false
    }
  }

  const handleToggle = async () => {
    if (!expanded && localResults === null) await loadResults()
    setExpanded(e => !e)
  }

  const [copied, setCopied] = useState(false)
  const isComparison = !!item.comparison

  const getComparisonRows = async (): Promise<ComparisonRow[]> => {
    const results = localResults ?? await loadResults()
    return buildComparisonRows(results, item.metrics, item.dimensions)
  }

  const handleExport = async (type: 'excel' | 'json') => {
    const filename = `ga4_${item.id}`
    if (isComparison) {
      const cmpRows = await getComparisonRows()
      if (type === 'excel') await downloadComparisonExcel(cmpRows, `${filename}_comparison.xlsx`)
      else downloadComparisonJSON(cmpRows, `${filename}_comparison.json`)
    } else {
      const results = localResults ?? await loadResults()
      if (type === 'excel') await downloadExcel(results, `${filename}.xlsx`)
      else downloadJSON(results, `${filename}.json`, item.metrics, item.dimensions)
    }
  }

  const handleCopy = async () => {
    if (isComparison) {
      const cmpRows = await getComparisonRows()
      if (!cmpRows.length) return
      await navigator.clipboard.writeText(copyComparisonTSV(cmpRows))
    } else {
      const results = localResults ?? await loadResults()
      if (!results.length) return
      const cols = ['property_name', 'account_name', ...item.dimensions, ...item.metrics]
        .filter(c => c in (results[0] ?? {}))
      const rows = [cols, ...results.map(row => cols.map(c => row[c] ?? ''))]
      await navigator.clipboard.writeText(rows.map(r => r.join('\t')).join('\n'))
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const results = localResults ?? []
  const tableRows = item.time_series
    ? [...results].sort((a, b) => {
        const dim = GRANULARITY_DIMENSION[item.time_series!.granularity]
        const da = String(a[dim] ?? ''), db = String(b[dim] ?? '')
        if (da !== db) return da < db ? -1 : 1
        const pa = String(a.property_name ?? ''), pb = String(b.property_name ?? '')
        return pa < pb ? -1 : pa > pb ? 1 : 0
      })
    : results
  const hasError = results.some(r => r.error)
  const sampleRow: QueryRow = results[0] ?? {}
  const tableCols = [
    'property_name',
    'account_name',
    ...item.dimensions,
    ...item.metrics,
    ...(Object.keys(sampleRow).includes('error') ? ['error'] : []),
  ].filter(c => c in sampleRow || c === 'property_name' || c === 'account_name')

  const ts = item.timestamp.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-sm)',
    }}>
      {/* Header */}
      <div
        className="card-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          cursor: 'pointer',
          userSelect: 'none',
          background: 'var(--surface)',
          transition: 'background 0.1s',
        }}
        onClick={handleToggle}
      >
        <div className="card-header-top" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
        {/* Expand toggle */}
        <div style={{
          width: 22,
          height: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 4,
          background: expanded ? 'var(--primary-light)' : '#f1f5f9',
          color: expanded ? 'var(--primary)' : 'var(--text-muted)',
          fontSize: 10,
          flexShrink: 0,
          transition: 'all 0.15s',
        }}>
          {resultsLoading ? '…' : expanded ? '▼' : '▶'}
        </div>

        {/* Summary */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{ts}</span>
            <span style={{
              background: '#f1f5f9',
              color: 'var(--text-secondary)',
              fontSize: 11,
              fontWeight: 500,
              padding: '2px 7px',
              borderRadius: 20,
            }}>
              {item.start_date} → {item.end_date}
            </span>
            <span style={{
              background: '#f1f5f9',
              color: 'var(--text-secondary)',
              fontSize: 11,
              fontWeight: 500,
              padding: '2px 7px',
              borderRadius: 20,
            }}>
              {item.properties_queried} {item.properties_queried === 1 ? 'property' : 'properties'}
            </span>
            {item.filters?.length > 0 && (
              <span style={{
                background: '#f1f5f9',
                color: 'var(--text-secondary)',
                fontSize: 11,
                fontWeight: 500,
                padding: '2px 7px',
                borderRadius: 20,
              }}>
                {item.filters.length} {item.filters.length === 1 ? 'filter' : `filters (${item.match_mode})`}
              </span>
            )}
            {item.comparison && (
              <span style={{ background: '#fef3c7', color: '#92400e', fontSize: 11, fontWeight: 500, padding: '2px 7px', borderRadius: 20 }}>
                vs {item.comparison.start_date} → {item.comparison.end_date}
              </span>
            )}
            {item.time_series && (
              <span style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)', fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 20 }}>
                {GRANULARITY_CARD_LABELS[item.time_series.granularity]}
              </span>
            )}
            {hasError && (
              <span style={{
                background: '#fef2f2',
                color: 'var(--error)',
                fontSize: 11,
                fontWeight: 500,
                padding: '2px 7px',
                borderRadius: 20,
              }}>
                some errors
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
            {item.metrics.join(', ')}
            {item.dimensions.length > 0 && (
              <> · <span style={{ color: 'var(--text-secondary)' }}>by {item.dimensions.join(', ')}</span></>
            )}
          </div>
        </div>
        </div>{/* /card-header-top */}

        {/* Actions */}
        <div className="card-actions" style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button className="btn-ghost" onClick={handleCopy} style={{ ...actionBtn, minWidth: 52 }}>{copied ? '✓' : 'Copy'}</button>
          <button className="btn-ghost" onClick={() => handleExport('excel')} style={actionBtn}>Excel</button>
          <button className="btn-ghost" onClick={() => handleExport('json')} style={actionBtn}>JSON</button>
          <button
            className="btn-danger"
            onClick={onDelete}
            style={{ ...actionBtn, color: '#94a3b8', borderColor: 'var(--border)' }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Error summary */}
      {expanded && hasError && (() => {
        const errorRows = results.filter(r => r.error)
        const uniqueMessages = [...new Set(errorRows.map(r => classifyError(String(r.error ?? ''))))]
        return (
          <div style={{
            borderTop: '1px solid var(--border)',
            background: '#fef2f2',
            padding: '10px 16px',
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 15, flexShrink: 0 }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 12, color: '#991b1b', marginBottom: 3 }}>
                {errorRows.length} of {results.length} {results.length === 1 ? 'property' : 'properties'} returned errors
              </div>
              {uniqueMessages.map((msg, i) => (
                <div key={i} style={{ fontSize: 12, color: '#b91c1c' }}>{msg}</div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Table */}
      {expanded && (
        resultsLoading ? (
          <div style={{ borderTop: '1px solid var(--border)', padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Loading results…
          </div>
        ) : isComparison ? (
          <ComparisonTable results={results} metrics={item.metrics} dimensions={item.dimensions} comparison={item.comparison!} />
        ) : (
          <div style={{ borderTop: '1px solid var(--border)', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {tableCols.map(col => (
                    <th key={col} style={{
                      padding: '9px 14px',
                      textAlign: item.metrics.includes(col) ? 'right' : 'left',
                      fontWeight: 600, fontSize: 11, textTransform: 'uppercase',
                      letterSpacing: '0.05em', color: 'var(--text-secondary)',
                      borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                    }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'var(--surface)' : '#fafbfc' }}>
                    {tableCols.map(col => (
                      <td key={col} style={{
                        padding: '9px 14px', borderBottom: '1px solid #f1f5f9',
                        textAlign: item.metrics.includes(col) ? 'right' : 'left',
                        color: col === 'error' ? 'var(--error)' : col === 'account_name' ? 'var(--text-secondary)' : 'var(--text)',
                        fontWeight: item.metrics.includes(col) ? 500 : 400,
                      }}>
                        {fmt(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

function ComparisonTable({ results, metrics, dimensions, comparison }: {
  results: QueryRow[]
  metrics: string[]
  dimensions: string[]
  comparison: { start_date: string; end_date: string }
}) {
  const rows = buildComparisonRows(results, metrics, dimensions)
  if (!rows.length) return null

  const fmtVal = (v: string | number | null) => {
    if (v === null || v === undefined) return '—'
    const n = Number(v)
    if (isNaN(n)) return String(v)
    if (Math.abs(n) < 1 && n !== 0 && String(v).includes('.')) return (n * 100).toFixed(2) + '%'
    return n.toLocaleString()
  }

  const fmtDelta = (v: string | number | null) => {
    if (v === null || v === undefined) return '—'
    const n = Number(v)
    if (isNaN(n)) return String(v)
    const sign = n >= 0 ? '+' : ''
    if (Math.abs(n) < 1 && n !== 0 && String(v).includes('.')) return sign + (n * 100).toFixed(3) + ' pp'
    return sign + n.toLocaleString()
  }

  const fmtPct = (v: string | number | null) => {
    if (v === null || v === undefined) return '—'
    const n = Number(v)
    if (isNaN(n)) return String(v)
    return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', overflowX: 'auto' }}>
      <div style={{ padding: '6px 14px', background: '#fffbeb', borderBottom: '1px solid #fde68a', fontSize: 11, color: '#92400e', fontWeight: 500 }}>
        Comparing <strong>{comparison.start_date} → {comparison.end_date}</strong>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            <th style={{ ...cmpTh, textAlign: 'left' }}>Property</th>
            <th style={{ ...cmpTh, textAlign: 'left', color: 'var(--text-muted)' }}>Account</th>
            {dimensions.map(d => (
              <th key={d} style={{ ...cmpTh, textAlign: 'left' }}>{d}</th>
            ))}
            {metrics.map(m => (
              <>
                <th key={`${m}-main`} style={{ ...cmpTh, borderLeft: '2px solid var(--border)' }}>Main</th>
                <th key={`${m}-cmp`} style={{ ...cmpTh, color: '#92400e' }}>Compare</th>
                <th key={`${m}-d`} style={cmpTh}>Δ</th>
                <th key={`${m}-pct`} style={cmpTh}>Δ %</th>
              </>
            ))}
          </tr>
          <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
            <th style={{ ...cmpSubTh, textAlign: 'left' }} colSpan={2 + dimensions.length} />
            {metrics.map(m => (
              <th key={m} colSpan={4} style={{ ...cmpSubTh, borderLeft: '2px solid var(--border)', textAlign: 'center', color: 'var(--text-secondary)' }}>{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? 'var(--surface)' : '#fafbfc' }}>
              <td style={{ ...cmpTd, fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.property_name}</td>
              <td style={{ ...cmpTd, color: 'var(--text-secondary)' }}>{row.account_name}</td>
              {dimensions.map(d => (
                <td key={d} style={{ ...cmpTd, color: 'var(--text-secondary)' }}>{String(row[d] ?? '—')}</td>
              ))}
              {metrics.map(m => {
                const delta = row[`${m}_delta`] as number | null
                const colour = delta === null ? 'inherit' : delta >= 0 ? '#16a34a' : '#dc2626'
                return (
                  <>
                    <td key={`${m}-main`} style={{ ...cmpTd, textAlign: 'right', borderLeft: '2px solid #f1f5f9' }}>{fmtVal(row[`${m}_main`])}</td>
                    <td key={`${m}-cmp`} style={{ ...cmpTd, textAlign: 'right', color: '#92400e' }}>{fmtVal(row[`${m}_compare`])}</td>
                    <td key={`${m}-d`} style={{ ...cmpTd, textAlign: 'right', color: colour, fontWeight: 600 }}>{fmtDelta(row[`${m}_delta`])}</td>
                    <td key={`${m}-pct`} style={{ ...cmpTd, textAlign: 'right', color: colour }}>{fmtPct(row[`${m}_delta_pct`])}</td>
                  </>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const cmpTh: React.CSSProperties = {
  padding: '7px 10px', fontWeight: 600, textAlign: 'right',
  color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em',
}
const cmpSubTh: React.CSSProperties = {
  padding: '4px 10px', fontWeight: 500, fontSize: 11,
  color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
}
const cmpTd: React.CSSProperties = {
  padding: '7px 10px', color: 'var(--text)', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9',
}

const actionBtn: React.CSSProperties = {
  padding: '5px 11px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  transition: 'all 0.15s',
}
