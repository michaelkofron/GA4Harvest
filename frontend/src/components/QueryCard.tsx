import { useState, useRef } from 'react'
import type { QueryHistoryItem, QueryRow } from '../types'
import { downloadCSV, downloadJSON } from '../utils/export'

interface Props {
  item: QueryHistoryItem
  onDelete: () => void
  defaultExpanded?: boolean
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return v.toLocaleString()
  const n = Number(v)
  return !isNaN(n) && String(v).trim() !== '' ? n.toLocaleString() : String(v)
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

  const handleExport = async (type: 'csv' | 'json') => {
    const results = localResults ?? await loadResults()
    const filename = `ga4_${item.id}`
    if (type === 'csv') downloadCSV(results, `${filename}.csv`)
    else downloadJSON(results, `${filename}.json`, item.metrics, item.dimensions)
  }

  // Header averages: use pre-computed metric_totals if available (loaded from storage),
  // otherwise compute from results if they're in memory.
  const metricTotals = item.metrics.map(m => {
    const fromMeta = item.metric_totals?.[m]
    const valid = localResults?.filter(r => !r.error) ?? []
    const count = valid.length || 1
    const fromResults = localResults !== null
      ? valid.reduce((sum, r) => sum + (parseFloat(String(r[m] ?? 0)) || 0), 0) / count
      : undefined
    const total = fromMeta ?? fromResults ?? null
    return { name: m, total }
  })

  const results = localResults ?? []
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
            {metricTotals.map(({ name, total }) => total !== null && (
              <span key={name} style={{
                background: 'var(--primary-light)',
                color: 'var(--primary-dark)',
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 20,
                border: '1px solid #c7d2fe',
              }}>
                avg {name}: {total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            ))}
            {item.filters?.length > 0 && (
              <span style={{
                background: '#f1f5f9',
                color: 'var(--text-secondary)',
                fontSize: 11,
                fontWeight: 500,
                padding: '2px 7px',
                borderRadius: 20,
              }}>
                {item.filters.length} {item.filters.length === 1 ? 'filter' : 'filters'} ({item.match_mode})
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

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button className="btn-ghost" onClick={() => handleExport('csv')} style={actionBtn}>CSV</button>
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
          <div style={{
            borderTop: '1px solid var(--border)',
            padding: '24px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 13,
          }}>
            Loading results…
          </div>
        ) : (
          <div style={{ borderTop: '1px solid var(--border)', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {tableCols.map(col => (
                    <th key={col} style={{
                      padding: '9px 14px',
                      textAlign: item.metrics.includes(col) ? 'right' : 'left',
                      fontWeight: 600,
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--text-secondary)',
                      borderBottom: '1px solid var(--border)',
                      whiteSpace: 'nowrap',
                    }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'var(--surface)' : '#fafbfc' }}>
                    {tableCols.map(col => (
                      <td key={col} style={{
                        padding: '9px 14px',
                        borderBottom: '1px solid #f1f5f9',
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
              {item.dimensions.length === 0 && results.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#f0f4ff', fontWeight: 700 }}>
                    <td
                      style={{ padding: '9px 14px', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}
                      colSpan={tableCols.length - item.metrics.length}
                    >
                      Avg
                    </td>
                    {item.metrics.map(m => (
                      <td key={m} style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--primary-dark)', fontWeight: 700 }}>
                        {metricTotals.find(t => t.name === m)?.total?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '—'}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )
      )}
    </div>
  )
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
