import { useEffect, useRef, useState } from 'react'
import TagInput from './components/TagInput'
import DateRangePicker from './components/DateRangePicker'
import QueryCard from './components/QueryCard'
import type { DimensionFilter, FilterOperator, Granularity, Metadata, Property, QueryHistoryItem, QueryRow } from './types'
import { GRANULARITY_CHIP_LABELS, GRANULARITY_DIMENSION } from './types'

// ── Sprout icon (inline SVG so fill color is controllable via CSS currentColor) ──
function SproutIcon({ size = 20, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 578.26 494.2"
      width={size}
      height={size}
      fill="currentColor"
      style={{ display: 'block', flexShrink: 0, ...style }}
    >
      <path d="M311.13,180.9c13.92-49.8,52.17-81.83,99.21-99.89,33.26-12.77,68.47-17.9,104.05-15.39,21.85,1.54,42.93,4.66,63.87,13.23-42.75,19.62-61.56,52.66-85.37,89.71-5.3,8.25-10.52,15.81-16.96,23.17-27.04,30.91-62.37,41.02-102.68,40.47l-28.02-.38c-8.8-.12-16.2,4.15-21.11,11.28-17.94,25.99-19.87,66.89-20,97.94-.17,41.38,2.78,86.9,13.01,126.47-12.02,5.57-19.9,15.35-26.64,26.7-6.6-11.13-14.65-20.53-26.27-26.67,4.32-18.09,7.07-35.69,9.02-54.56,6.86-59.41,10.12-159.6-19.36-212.54-7.26-13.03-17.98-13.74-31.67-13.41-34.26.82-70.99-6.77-97.17-29.77-12.96-11.39-23.57-24.09-32.11-39.02l-22.19-38.78C51.9,46.48,33.81,23.9,0,4.5c73.71-12.57,159.21.43,217.31,48.27,39,32.11,50.24,75.99,50.42,126.09-13.85-25.45-28.98-49.24-47.69-71.65C180.47,59.82,124.37,25.38,62.03,18.05c7.23,3.16,14.24,4.44,21.93,7.24,43.45,15.81,82.87,41.46,114.48,75.78-27.66-18.83-56.11-35.1-89.61-41.01l41.13,19.32c39.07,20.44,71.91,49.33,97.96,84.86,28.43,38.77,40.76,71.2,44.75,120.11,4.52-21.85,12.79-41.76,25.47-60.37,26.84-39.43,65.19-68.54,109.65-85.56,18.29-7,35.72-12.08,55.12-16.44-17.13.37-33.34,3.4-49.77,8.02-19.29,5.43-35.84,14.79-53.87,23.89,38.94-34.72,87.49-60.67,138.12-68.63-26.58-.04-51.57,6.23-76.01,15.89-22.73,8.98-42.83,21.02-61.72,36.32-31.31,25.35-59.15,57.12-76.42,93.87.68-17.72,3.29-33.93,7.91-50.45Z" />
    </svg>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgoStr(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

function availableGranularities(start: string, end: string): Granularity[] {
  const days = daysBetween(start, end) + 1
  const out: Granularity[] = []
  if (days > 1) out.push('day')
  if (days >= 14) out.push('week')
  if (days >= 60) out.push('month')
  if (days >= 365) out.push('year')
  return out
}

function defaultGranularity(start: string, end: string): Granularity {
  const days = daysBetween(start, end) + 1
  if (days >= 365) return 'month'
  if (days >= 60) return 'week'
  return 'day'
}

function isAligned(start: string, end: string, granularity: Granularity): boolean {
  if (granularity === 'day') return true
  if (granularity === 'week') return (daysBetween(start, end) + 1) % 7 === 0
  if (granularity === 'month') {
    const startDay = parseInt(start.split('-')[2])
    const [ey, em] = end.split('-').map(Number)
    const lastDay = new Date(ey, em, 0).getDate()
    return startDay === 1 && parseInt(end.split('-')[2]) === lastDay
  }
  if (granularity === 'year') return start.slice(5) === '01-01' && end.slice(5) === '12-31'
  return true
}

function snapToGranularity(start: string, end: string, granularity: Granularity): { start: string; end: string } {
  // Parse as local date to avoid UTC-midnight → wrong-day-in-negative-offset-timezones
  const localDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
  const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  if (granularity === 'week') {
    const days = daysBetween(start, end) + 1
    const targetDays = Math.max(7, Math.round(days / 7) * 7)
    const e = localDate(start)
    e.setDate(e.getDate() + targetDays - 1)
    return { start, end: fmtDate(e) }
  }
  if (granularity === 'month') {
    const [sy, sm] = start.split('-').map(Number)
    let [ey, em] = end.split('-').map(Number)
    // If the end month hasn't finished yet, snap back to the last complete month
    const today = new Date()
    if (ey * 12 + em >= today.getFullYear() * 12 + (today.getMonth() + 1)) {
      em -= 1
      if (em === 0) { em = 12; ey -= 1 }
    }
    const lastDay = new Date(ey, em, 0).getDate()
    return {
      start: `${sy}-${String(sm).padStart(2, '0')}-01`,
      end: `${ey}-${String(em).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    }
  }
  if (granularity === 'year') {
    // Same idea: don't snap end year forward if that year isn't over yet
    const snapEndYear = end.slice(0, 4)
    const today = new Date()
    const endYear = parseInt(snapEndYear)
    const safeEndYear = endYear >= today.getFullYear() ? today.getFullYear() - 1 : endYear
    return { start: `${start.slice(0, 4)}-01-01`, end: `${safeEndYear}-12-31` }
  }
  return { start, end }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

function alignmentWarning(start: string, end: string, granularity: Granularity): string {
  if (granularity === 'week') {
    const rem = (daysBetween(start, end) + 1) % 7
    return `Range has ${rem} extra day${rem !== 1 ? 's' : ''} beyond complete weeks.`
  }
  if (granularity === 'month') {
    const startDay = parseInt(start.split('-')[2])
    const [ey, em] = end.split('-').map(Number)
    const lastDay = new Date(ey, em, 0).getDate()
    const endDay = parseInt(end.split('-')[2])
    const parts = []
    if (startDay !== 1) parts.push(`starts on the ${ordinal(startDay)}`)
    if (endDay !== lastDay) parts.push(`ends on the ${ordinal(endDay)} (not the ${ordinal(lastDay)})`)
    return `Range ${parts.join(' and ')} — not aligned to complete months.`
  }
  if (granularity === 'year') return 'Range doesn\'t start on Jan 1 or end on Dec 31.'
  return ''
}

function snapLabel(start: string, end: string, granularity: Granularity): string {
  if (granularity === 'week') {
    const weeks = Math.max(1, Math.round((daysBetween(start, end) + 1) / 7))
    return `Snap to ${weeks} week${weeks !== 1 ? 's' : ''}`
  }
  if (granularity === 'month') {
    const [sy, sm] = start.split('-').map(Number)
    let [ey, em] = end.split('-').map(Number)
    const today = new Date()
    if (ey * 12 + em >= today.getFullYear() * 12 + (today.getMonth() + 1)) {
      em -= 1; if (em === 0) { em = 12; ey -= 1 }
    }
    const months = (ey - sy) * 12 + (em - sm) + 1
    return `Snap to ${months} month${months !== 1 ? 's' : ''}`
  }
  if (granularity === 'year') {
    const today = new Date()
    const startYear = parseInt(start.slice(0, 4))
    const endYear = parseInt(end.slice(0, 4))
    const safeEndYear = endYear >= today.getFullYear() ? today.getFullYear() - 1 : endYear
    const years = safeEndYear - startYear + 1
    return `Snap to ${years} year${years !== 1 ? 's' : ''}`
  }
  return 'Snap'
}

function groupByAccount(properties: Property[]): Map<string, Property[]> {
  const map = new Map<string, Property[]>()
  for (const p of properties) {
    const existing = map.get(p.account_name) ?? []
    map.set(p.account_name, [...existing, p])
  }
  return map
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [properties, setProperties] = useState<Property[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [collapsedAccounts, setCollapsedAccounts] = useState<Set<string>>(new Set())
  const [metrics, setMetrics] = useState<string[]>([])
  const [dimensions, setDimensions] = useState<string[]>([])
  const [metadata, setMetadata] = useState<Metadata | null>(null)
  const [metaLoading, setMetaLoading] = useState(false)
  const [startDate, setStartDate] = useState(daysAgoStr(28))
  const [endDate, setEndDate] = useState(daysAgoStr(1))
  const [compareRange, setCompareRange] = useState<{ start: string; end: string } | null>(null)
  const [timeSeries, setTimeSeries] = useState<{ granularity: Granularity } | null>(null)
  const [snapCount, setSnapCount] = useState(0)
  const [history, setHistory] = useState<QueryHistoryItem[]>([])
  const [filters, setFilters] = useState<DimensionFilter[]>([])
  const [matchMode, setMatchMode] = useState<'AND' | 'OR'>('AND')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; current: string; phase?: string } | null>(null)
  const [latestQueryId, setLatestQueryId] = useState<string | null>(null)
  const [propsLoading, setPropsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const metaFetched = useRef(false)

  const addFilter = () => {
    if (!dimensions.length) return
    setFilters(prev => [...prev, { dimension: dimensions[0], operator: 'CONTAINS', value: '' }])
  }
  const updateFilter = (i: number, patch: Partial<DimensionFilter>) =>
    setFilters(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f))
  const removeFilter = (i: number) =>
    setFilters(prev => prev.filter((_, idx) => idx !== i))

  useEffect(() => {
    fetch('/api/properties')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setProperties(data)
        else setError(data.detail ?? 'Failed to load properties')
      })
      .catch(() => setError('Could not reach backend. Is it running on :8000?'))
      .finally(() => setPropsLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/history')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setHistory(data.map((item: Omit<QueryHistoryItem, 'timestamp'> & { timestamp: string }) => ({
            ...item,
            timestamp: new Date(item.timestamp),
            comparison: item.comparison ?? undefined,
          })))
        }
      })
      .catch(() => { /* history is optional */ })
  }, [])

  const fetchMetadata = async () => {
    if (metaFetched.current || metaLoading) return
    const refId = selected.size > 0 ? Array.from(selected)[0] : properties[0]?.property_id
    if (!refId) return
    metaFetched.current = true
    setMetaLoading(true)
    try {
      const resp = await fetch(`/api/metadata/${refId}`)
      const data = await resp.json()
      if (resp.ok) setMetadata(data)
    } finally {
      setMetaLoading(false)
    }
  }

  const grouped = groupByAccount(properties)
  const accounts = Array.from(grouped.keys())

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleAccount = (accountName: string) => {
    const accountProps = grouped.get(accountName) ?? []
    const allSelected = accountProps.every(p => selected.has(p.property_id))
    setSelected(prev => {
      const next = new Set(prev)
      if (allSelected) accountProps.forEach(p => next.delete(p.property_id))
      else accountProps.forEach(p => next.add(p.property_id))
      return next
    })
  }

  const collapseAccount = (accountName: string) =>
    setCollapsedAccounts(prev => {
      const next = new Set(prev)
      next.has(accountName) ? next.delete(accountName) : next.add(accountName)
      return next
    })

  const selectAll = () => setSelected(new Set(properties.map(p => p.property_id)))
  const clearAll = () => setSelected(new Set())

  const streamQuery = async (
    body: object,
    onResult: (row: Record<string, unknown>) => void,
    onProgress: (done: number, total: number, current: string) => void,
  ): Promise<boolean> => {
    const resp = await fetch('/api/query/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!resp.ok || !resp.body) {
      const err = await resp.json().catch(() => ({}))
      setError(err.detail ?? 'Query failed. Check the backend.')
      return false
    }
    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''
      for (const part of parts) {
        for (const line of part.split('\n')) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'progress') onProgress(event.done, event.total, event.current)
            else if (event.type === 'result') onResult(event.data)
            else if (event.type === 'error') setError(event.message ?? 'Query failed.')
            else if (event.type === 'done') onProgress(event.total, event.total, '')
          } catch { /* malformed SSE line */ }
        }
      }
    }
    return true
  }

  const runQuery = async () => {
    if (!selected.size || !metrics.length) return
    setLoading(true)
    setError(null)
    const propertyMap = Object.fromEntries(
      properties
        .filter(p => selected.has(p.property_id))
        .map(p => [p.property_id, { property_name: p.property_name, account_name: p.account_name }]),
    )
    const id = Date.now().toString()
    const activeFilters = filters.filter(f => f.value.trim() !== '')
    const mainResults: QueryRow[] = []
    const compareResults: QueryRow[] = []

    // Inject GA4 date dimension for time-series mode (prepended so it sorts first)
    const tsDimension = timeSeries ? GRANULARITY_DIMENSION[timeSeries.granularity] : null
    const queryDimensions = tsDimension ? [tsDimension, ...dimensions] : dimensions

    try {
      // ── Main query ──
      setProgress({ done: 0, total: selected.size, current: '', phase: 'Main' })
      const ok = await streamQuery(
        {
          query_id: id,
          property_ids: Array.from(selected),
          metrics, dimensions: queryDimensions,
          filters: activeFilters,
          match_mode: matchMode,
          start_date: startDate,
          end_date: endDate,
          property_map: propertyMap,
        },
        row => mainResults.push({ ...row, _period: 'main' }),
        (done, total, current) => setProgress({ done, total, current, phase: compareRange ? 'Main' : undefined }),
      )
      if (!ok) return

      // ── Compare query (if enabled) ──
      if (compareRange) {
        setProgress({ done: 0, total: selected.size, current: '', phase: 'Compare' })
        await streamQuery(
          {
            query_id: `${id}_compare`,
            property_ids: Array.from(selected),
            metrics, dimensions: queryDimensions,
            filters: activeFilters,
            match_mode: matchMode,
            start_date: compareRange.start,
            end_date: compareRange.end,
            property_map: propertyMap,
          },
          row => compareResults.push({ ...row, _period: 'compare' }),
          (done, total, current) => setProgress({ done, total, current, phase: 'Compare' }),
        )
      }

      const allResults = [...mainResults, ...compareResults]
      if (allResults.length > 0) {
        const historyItem = {
          id,
          timestamp: new Date().toISOString(),
          start_date: startDate,
          end_date: endDate,
          metrics: [...metrics],
          dimensions: queryDimensions,
          filters: activeFilters,
          match_mode: matchMode,
          comparison: compareRange ? { start_date: compareRange.start, end_date: compareRange.end } : undefined,
          time_series: timeSeries ?? undefined,
          properties_queried: selected.size,
          results: allResults,
        }
        // Persist merged results (including comparison rows + metadata) to disk
        await fetch(`/api/history/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(historyItem),
        }).catch(() => { /* non-fatal */ })

        setLatestQueryId(id)
        setHistory(prev => [{ ...historyItem, timestamp: new Date() }, ...prev])
      }
    } catch {
      setError('Query failed. Check the backend.')
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  const canRun = !loading && selected.size > 0 && metrics.length > 0

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── Header ── */}
      <header style={{
        background: '#18181b',
        color: '#fff',
        flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div className="app-container" style={{ ...container, display: 'flex', alignItems: 'center', height: 54, gap: 10 }}>
          <SproutIcon size={19} />
          <span style={{ fontWeight: 650, fontSize: 15, letterSpacing: '-0.025em', color: '#fff' }}>GA4Harvest</span>
          {history.length > 0 && (
            <span style={{
              marginLeft: 4,
              background: 'rgba(255,255,255,0.09)',
              color: 'rgba(255,255,255,0.55)',
              fontSize: 11,
              fontWeight: 500,
              padding: '2px 9px',
              borderRadius: 99,
              letterSpacing: '0.01em',
            }}>
              {history.length} {history.length === 1 ? 'query' : 'queries'}
            </span>
          )}
        </div>
      </header>

      {/* ── Controls ── */}
      <div style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div className="app-container" style={{ ...container, padding: '20px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Properties */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={label}>Properties</span>
                {!propsLoading && selected.size > 0 && (
                  <span style={pill}>{selected.size} of {properties.length} selected</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn-ghost" onClick={selectAll} style={ghostBtn}>Select all</button>
                <button className="btn-ghost" onClick={clearAll} style={ghostBtn}>Clear</button>
              </div>
            </div>

            {propsLoading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '8px 0' }}>Loading properties…</div>
            ) : properties.length === 0 ? (
              <div style={{ color: 'var(--error)', fontSize: 13, padding: '8px 0' }}>
                No properties found. Check your service account permissions.
              </div>
            ) : (
              <div style={{
                maxHeight: 192,
                overflowY: 'auto',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface-raised)',
              }}>
                {accounts.map((accountName, ai) => {
                  const accountProps = grouped.get(accountName) ?? []
                  const collapsed = collapsedAccounts.has(accountName)
                  const allChecked = accountProps.every(p => selected.has(p.property_id))
                  const someChecked = accountProps.some(p => selected.has(p.property_id))

                  return (
                    <div key={accountName} style={{ borderBottom: ai < accounts.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                      <div
                        className="account-row"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 12px',
                          background: '#f7f7f8',
                          cursor: 'pointer',
                          userSelect: 'none',
                          borderBottom: collapsed ? 'none' : '1px solid var(--border-subtle)',
                        }}
                      >
                        <span
                          onClick={() => collapseAccount(accountName)}
                          style={{ color: 'var(--text-muted)', fontSize: 9, width: 12, textAlign: 'center', flexShrink: 0 }}
                        >
                          {collapsed ? '▶' : '▼'}
                        </span>
                        <input
                          type="checkbox"
                          checked={allChecked}
                          ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                          onChange={() => toggleAccount(accountName)}
                          style={{ flexShrink: 0, accentColor: 'var(--primary)' }}
                          onClick={e => e.stopPropagation()}
                        />
                        <span
                          onClick={() => collapseAccount(accountName)}
                          style={{ flex: 1, fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.02em', textTransform: 'uppercase' }}
                        >
                          {accountName}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {accountProps.length} {accountProps.length === 1 ? 'property' : 'properties'}
                        </span>
                      </div>

                      {!collapsed && accountProps.map((p, pi) => (
                        <label
                          key={p.property_id}
                          className={selected.has(p.property_id) ? 'prop-row-selected' : 'prop-row'}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '7px 12px 7px 32px',
                            cursor: 'pointer',
                            background: selected.has(p.property_id) ? '#ededfc' : 'transparent',
                            borderBottom: pi < accountProps.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                            transition: 'background 0.1s',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(p.property_id)}
                            onChange={() => toggle(p.property_id)}
                            style={{ flexShrink: 0, accentColor: 'var(--primary)' }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.property_name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{p.property_id}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Metrics + Dimensions */}
          <div className="field-row" style={{ display: 'flex', gap: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={label}>Metrics</div>
              <TagInput
                value={metrics}
                onChange={setMetrics}
                suggestions={metadata?.metrics ?? []}
                placeholder="Search metrics…"
                loading={metaLoading}
                onRequestMetadata={fetchMetadata}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...label, display: 'flex', alignItems: 'center', gap: 6 }}>
                Dimensions
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>optional</span>
              </div>
              <TagInput
                value={dimensions}
                onChange={next => {
                  setDimensions(next)
                  setFilters(prev => prev.filter(f => next.includes(f.dimension)))
                }}
                suggestions={metadata?.dimensions ?? []}
                placeholder="Search dimensions…"
                loading={metaLoading}
                onRequestMetadata={fetchMetadata}
              />
            </div>
          </div>

          {/* Filters */}
          {dimensions.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={label}>Filters</span>
                  {filters.length >= 2 && (
                    <div style={{ display: 'flex', gap: 2, background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', padding: 2 }}>
                      {(['AND', 'OR'] as const).map(mode => (
                        <button
                          key={mode}
                          onClick={() => setMatchMode(mode)}
                          style={{
                            background: matchMode === mode ? '#18181b' : 'transparent',
                            color: matchMode === mode ? '#fff' : 'var(--text-secondary)',
                            border: 'none',
                            borderRadius: 3,
                            padding: '2px 10px',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button className="btn-ghost" onClick={addFilter} style={ghostBtn}>+ Add filter</button>
              </div>
              {filters.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 192, overflowY: 'auto' }}>
                  {filters.map((f, i) => (
                    <div key={i} className="filter-entry" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <select
                        value={f.dimension}
                        onChange={e => updateFilter(i, { dimension: e.target.value })}
                        style={selectStyle}
                      >
                        {dimensions.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <select
                        value={f.operator}
                        onChange={e => updateFilter(i, { operator: e.target.value as FilterOperator })}
                        style={selectStyle}
                      >
                        <option value="EXACT">exact</option>
                        <option value="CONTAINS">contains</option>
                        <option value="BEGINS_WITH">begins with</option>
                        <option value="ENDS_WITH">ends with</option>
                        <option value="REGEXP">regexp</option>
                      </select>
                      <input
                        type="text"
                        value={f.value}
                        onChange={e => updateFilter(i, { value: e.target.value })}
                        placeholder="value"
                        style={{ ...selectStyle, flex: 1 }}
                      />
                      <button
                        className="btn-danger"
                        onClick={() => removeFilter(i)}
                        style={{ ...ghostBtn, color: '#94a3b8', borderColor: 'var(--border)', padding: '5px 10px' }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Date range + Run */}
          <div className="date-run-row" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={label}>Date range</div>
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onChange={(s, e) => {
                setStartDate(s)
                setEndDate(e)
                if (timeSeries) {
                  const avail = availableGranularities(s, e)
                  if (avail.length === 0) setTimeSeries(null)
                  else if (!avail.includes(timeSeries.granularity)) setTimeSeries({ granularity: defaultGranularity(s, e) })
                }
              }}
              onCompareChange={range => {
                setCompareRange(range)
                if (range !== null) setTimeSeries(null)
              }}
              compareActive={!timeSeries}
              clearPreset={snapCount}
            />

            {/* Time-series toggle */}
            {availableGranularities(startDate, endDate).length > 0 && (
              <button
                onClick={() => {
                  if (timeSeries) { setTimeSeries(null) }
                  else { setCompareRange(null); setTimeSeries({ granularity: defaultGranularity(startDate, endDate) }) }
                }}
                style={{
                  padding: '5px 10px',
                  border: `1px solid ${timeSeries ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)',
                  background: timeSeries ? 'var(--primary-light)' : 'none',
                  color: timeSeries ? 'var(--primary-dark)' : 'var(--text-secondary)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {timeSeries ? 'Time-series ✕' : 'Time-series'}
              </button>
            )}

            {/* Granularity chips */}
            {timeSeries && availableGranularities(startDate, endDate).map(g => (
              <button
                key={g}
                onClick={() => setTimeSeries({ granularity: g })}
                style={{
                  padding: '4px 10px',
                  border: `1px solid ${timeSeries.granularity === g ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)',
                  background: timeSeries.granularity === g ? '#18181b' : 'none',
                  color: timeSeries.granularity === g ? '#fff' : 'var(--text-secondary)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {GRANULARITY_CHIP_LABELS[g]}
              </button>
            ))}

            <div className="spacer" style={{ flex: 1 }} />
            <button
              className="run-btn"
              onClick={runQuery}
              disabled={!canRun}
              style={{
                background: canRun ? '#18181b' : '#e4e4e7',
                color: canRun ? '#fff' : 'var(--text-muted)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '9px 20px',
                fontWeight: 600,
                fontSize: 13,
                cursor: canRun ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                letterSpacing: '-0.01em',
                boxShadow: canRun ? '0 1px 2px rgba(0,0,0,0.15)' : 'none',
              }}
            >
              {loading ? (
                <>
                  <span style={{ opacity: 0.6, fontSize: 13, animation: 'spin 1s linear infinite' }}>↻</span>
                  Running…
                </>
              ) : (
                <>
                  Run Query
                  {selected.size > 0 && (
                    <span style={{
                      background: canRun ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.06)',
                      padding: '1px 7px',
                      borderRadius: 99,
                      fontSize: 12,
                      fontWeight: 700,
                    }}>
                      {selected.size}
                    </span>
                  )}
                </>
              )}
            </button>
          </div>

          {/* Alignment warning */}
          {timeSeries && timeSeries.granularity !== 'day' && !isAligned(startDate, endDate, timeSeries.granularity) && (() => {
            const snapped = snapToGranularity(startDate, endDate, timeSeries.granularity)
            return (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                background: '#fffbeb', border: '1px solid #fde68a',
                borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: 12,
              }}>
                <span style={{ color: '#92400e' }}>
                  ⚠ {alignmentWarning(startDate, endDate, timeSeries.granularity)}
                </span>
                <button
                  onClick={() => { setStartDate(snapped.start); setEndDate(snapped.end); setSnapCount(c => c + 1) }}
                  style={{
                    flexShrink: 0, padding: '4px 10px',
                    background: '#92400e', color: '#fff', border: 'none',
                    borderRadius: 'var(--radius-xs)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {snapLabel(startDate, endDate, timeSeries.granularity)}
                </button>
              </div>
            )
          })()}

          {/* Progress bar */}
          {loading && progress && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {progress.phase && <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>[{progress.phase}]</span>}
                  {progress.current
                    ? <><span style={{ color: 'var(--text-muted)' }}>Querying</span> <strong style={{ fontWeight: 500, color: 'var(--text)' }}>{progress.current}</strong></>
                    : 'Starting…'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {progress.done} / {progress.total}
                </span>
              </div>
              <div style={{ height: 3, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
                  background: 'var(--primary)',
                  borderRadius: 99,
                  transition: 'width 0.35s ease',
                }} />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              color: 'var(--error)',
              background: 'var(--error-bg)',
              border: '1px solid #fecaca',
              padding: '9px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
            }}>
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 18, padding: 0, lineHeight: 1 }}
              >×</button>
            </div>
          )}
        </div>
      </div>

      {/* ── History ── */}
      <div style={{ paddingTop: 24, paddingBottom: 40 }}>
        <div className="app-container" style={container}>
          {history.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: 80,
              gap: 14,
              color: 'var(--text-muted)',
              textAlign: 'center',
            }}>
              <div style={{
                width: 52, height: 52,
                borderRadius: 14,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: 'var(--shadow-xs)',
                color: '#a1a1aa',
              }}>
                <SproutIcon size={26} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-secondary)', marginBottom: 5 }}>No queries yet</div>
                <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 280 }}>Select properties, add metrics, and run a query.</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {history.map(item => (
                <QueryCard
                  key={item.id}
                  item={item}
                  defaultExpanded={item.id === latestQueryId}
                  onDelete={async () => {
                    await fetch(`/api/history/${item.id}`, { method: 'DELETE' })
                    setHistory(prev => prev.filter(h => h.id !== item.id))
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const container: React.CSSProperties = {
  maxWidth: 'var(--max-width)',
  margin: '0 auto',
  width: '100%',
  padding: '0 32px',
}

const label: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: 7,
  letterSpacing: '0.01em',
}

const pill: React.CSSProperties = {
  background: 'var(--primary-light)',
  color: 'var(--primary-dark)',
  fontSize: 11,
  fontWeight: 500,
  padding: '2px 8px',
  borderRadius: 99,
  border: '1px solid #c4c4f0',
}

const selectStyle: React.CSSProperties = {
  fontFamily: 'inherit',
  fontSize: 13,
  padding: '6px 10px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--surface)',
  color: 'var(--text)',
  outline: 'none',
  cursor: 'pointer',
}

const ghostBtn: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-xs)',
  color: 'var(--text-secondary)',
  fontSize: 12,
  fontWeight: 500,
  padding: '4px 10px',
  cursor: 'pointer',
  transition: 'all 0.15s',
}
