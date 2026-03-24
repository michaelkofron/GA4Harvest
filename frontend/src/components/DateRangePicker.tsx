import { useEffect, useRef, useState } from 'react'

interface DateRangePickerProps {
  startDate: string
  endDate: string
  onChange: (start: string, end: string, preset: string | null) => void
  onCompareChange?: (range: { start: string; end: string } | null) => void
  compareActive?: boolean  // controlled externally; false forces compare off
  clearPreset?: number     // increment to clear the active preset label
}

function daysAgoStr(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function formatDisplay(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

function shiftBack(start: string, end: string): { start: string; end: string } {
  const days = daysBetween(start, end) + 1
  const s = new Date(start)
  const e = new Date(end)
  s.setDate(s.getDate() - days)
  e.setDate(e.getDate() - days)
  return { start: s.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10) }
}

const PRESETS = [
  { label: 'Last 7 days',  start: () => daysAgoStr(7),  end: () => daysAgoStr(1) },
  { label: 'Last 28 days', start: () => daysAgoStr(28), end: () => daysAgoStr(1) },
  { label: 'Last 90 days', start: () => daysAgoStr(90), end: () => daysAgoStr(1) },
  {
    label: 'This month',
    start: () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` },
    end: () => daysAgoStr(1),
  },
  {
    label: 'Last month',
    start: () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,10) },
    end: () => { const d = new Date(); d.setDate(0); return d.toISOString().slice(0,10) },
  },
  { label: 'Year to date', start: () => `${new Date().getFullYear()}-01-01`, end: () => daysAgoStr(1) },
]

export default function DateRangePicker({ startDate, endDate, onChange, onCompareChange, compareActive, clearPreset }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [activePreset, setActivePreset] = useState<string | null>('Last 28 days')
  const [draft, setDraft] = useState({ start: startDate, end: endDate })
  const [comparing, setComparing] = useState(false)
  const [compareDraft, setCompareDraft] = useState(shiftBack(startDate, endDate))
  const ref = useRef<HTMLDivElement>(null)

  // Allow parent to force compare off (e.g. when time-series is activated)
  useEffect(() => {
    if (compareActive === false && comparing) setComparing(false)
  }, [compareActive])

  const mountedRef = useRef(false)
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return }
    setActivePreset(null)
  }, [clearPreset])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const applyPreset = (preset: typeof PRESETS[number]) => {
    const s = preset.start(), e = preset.end()
    setDraft({ start: s, end: e })
    setActivePreset(preset.label)
    setCompareDraft(shiftBack(s, e))
    onChange(s, e, preset.label)
    if (!comparing) setOpen(false)
  }

  const applyCustom = () => {
    onChange(draft.start, draft.end, null)
    setCompareDraft(shiftBack(draft.start, draft.end))
    if (!comparing) setOpen(false)
  }

  const applyCompare = () => {
    onCompareChange?.({ start: compareDraft.start, end: compareDraft.end })
    setOpen(false)
  }

  const toggleCompare = () => {
    if (comparing) {
      setComparing(false)
      onCompareChange?.(null)
    } else {
      const prev = shiftBack(startDate, endDate)
      setComparing(true)
      setCompareDraft(prev)
      onCompareChange?.(prev)
    }
  }

  const displayLabel = activePreset ?? `${formatDisplay(startDate)} – ${formatDisplay(endDate)}`

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
      {/* Trigger */}
      <button
        onClick={() => { setDraft({ start: startDate, end: endDate }); setOpen(o => !o) }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px',
          background: 'var(--surface)',
          border: `1px solid ${open ? 'var(--border-focus)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-sm)',
          fontSize: 13, fontWeight: 500, color: 'var(--text)',
          cursor: 'pointer',
          boxShadow: open ? '0 0 0 3px rgba(99,102,241,0.12)' : 'none',
          transition: 'all 0.15s', whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontSize: 13 }}>📅</span>
        {displayLabel}
        {comparing && (
          <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>vs prev</span>
        )}
        <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 2 }}>▾</span>
      </button>

      {/* Compare toggle outside dropdown */}
      {onCompareChange && (
        <button
          onClick={toggleCompare}
          style={{
            padding: '5px 10px',
            border: `1px solid ${comparing ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-sm)',
            background: comparing ? 'var(--primary-light)' : 'none',
            color: comparing ? 'var(--primary-dark)' : 'var(--text-secondary)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          {comparing ? 'Comparing ✕' : 'Compare'}
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div className="date-picker-dropdown" style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 300,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-md)',
          display: 'flex', minWidth: comparing ? 560 : 420,
        }}>
          {/* Presets */}
          <div className="date-picker-presets" style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', padding: '8px 0', minWidth: 150 }}>
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                style={{
                  background: activePreset === p.label ? 'var(--primary-light)' : 'none',
                  color: activePreset === p.label ? 'var(--primary-dark)' : 'var(--text)',
                  border: 'none', textAlign: 'left', padding: '8px 16px',
                  fontSize: 13, fontWeight: activePreset === p.label ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom range */}
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Custom range
            </div>
            <DateInputPair draft={draft} onChange={d => { setDraft(d); setActivePreset(null) }} />
            <button
              onClick={applyCustom}
              disabled={!draft.start || !draft.end || draft.start > draft.end}
              style={{ background: '#18181b', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: (!draft.start || !draft.end || draft.start > draft.end) ? 0.4 : 1 }}
            >
              Apply
            </button>
          </div>

          {/* Compare range */}
          {comparing && (
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1, borderLeft: '1px solid var(--border)', background: 'var(--primary-light)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary-dark)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Compare to
              </div>
              <DateInputPair draft={compareDraft} onChange={setCompareDraft} />
              <button
                onClick={applyCompare}
                disabled={!compareDraft.start || !compareDraft.end || compareDraft.start > compareDraft.end}
                style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: (!compareDraft.start || !compareDraft.end || compareDraft.start > compareDraft.end) ? 0.4 : 1 }}
              >
                Apply comparison
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DateInputPair({ draft, onChange }: { draft: { start: string; end: string }; onChange: (d: { start: string; end: string }) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>From</label>
        <input type="date" value={draft.start} onChange={e => onChange({ ...draft, start: e.target.value })}
          style={{ fontSize: 13, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>To</label>
        <input type="date" value={draft.end} onChange={e => onChange({ ...draft, end: e.target.value })}
          style={{ fontSize: 13, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }} />
      </div>
    </div>
  )
}
