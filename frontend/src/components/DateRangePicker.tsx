import { useEffect, useRef, useState } from 'react'

interface DateRangePickerProps {
  startDate: string
  endDate: string
  onChange: (start: string, end: string, preset: string | null) => void
}

function daysAgoStr(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
function formatDisplay(date: string) {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const PRESETS = [
  {
    label: 'Last 7 days',
    start: () => daysAgoStr(7),
    end: () => daysAgoStr(1),
  },
  {
    label: 'Last 28 days',
    start: () => daysAgoStr(28),
    end: () => daysAgoStr(1),
  },
  {
    label: 'Last 90 days',
    start: () => daysAgoStr(90),
    end: () => daysAgoStr(1),
  },
  {
    label: 'This month',
    start: () => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    },
    end: () => daysAgoStr(1),
  },
  {
    label: 'Last month',
    start: () => {
      const d = new Date()
      d.setDate(1)
      d.setMonth(d.getMonth() - 1)
      return d.toISOString().slice(0, 10)
    },
    end: () => {
      const d = new Date()
      d.setDate(0)
      return d.toISOString().slice(0, 10)
    },
  },
  {
    label: 'Year to date',
    start: () => `${new Date().getFullYear()}-01-01`,
    end: () => daysAgoStr(1),
  },
]

export default function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [activePreset, setActivePreset] = useState<string | null>('Last 28 days')
  const [draft, setDraft] = useState({ start: startDate, end: endDate })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const applyPreset = (preset: typeof PRESETS[number]) => {
    const s = preset.start()
    const e = preset.end()
    setDraft({ start: s, end: e })
    setActivePreset(preset.label)
    onChange(s, e, preset.label)
    setOpen(false)
  }

  const applyCustom = () => {
    onChange(draft.start, draft.end, null)
    setOpen(false)
  }

  const displayLabel = activePreset ?? `${formatDisplay(startDate)} – ${formatDisplay(endDate)}`

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        onClick={() => { setDraft({ start: startDate, end: endDate }); setOpen(o => !o) }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          background: 'var(--surface)',
          border: `1px solid ${open ? 'var(--border-focus)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-sm)',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text)',
          cursor: 'pointer',
          boxShadow: open ? '0 0 0 3px rgba(99,102,241,0.12)' : 'none',
          transition: 'all 0.15s',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontSize: 13 }}>📅</span>
        {displayLabel}
        <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 2 }}>▾</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          zIndex: 300,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          minWidth: 420,
        }}>
          {/* Presets */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid var(--border)',
            padding: '8px 0',
            minWidth: 150,
          }}>
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                style={{
                  background: activePreset === p.label ? 'var(--primary-light)' : 'none',
                  color: activePreset === p.label ? 'var(--primary-dark)' : 'var(--text)',
                  border: 'none',
                  textAlign: 'left',
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: activePreset === p.label ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (activePreset !== p.label) (e.target as HTMLElement).style.background = 'var(--surface-raised)' }}
                onMouseLeave={e => { if (activePreset !== p.label) (e.target as HTMLElement).style.background = 'none' }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom range */}
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Custom range
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>From</label>
                <input
                  type="date"
                  value={draft.start}
                  onChange={e => { setDraft(d => ({ ...d, start: e.target.value })); setActivePreset(null) }}
                  style={{ fontSize: 13, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>To</label>
                <input
                  type="date"
                  value={draft.end}
                  onChange={e => { setDraft(d => ({ ...d, end: e.target.value })); setActivePreset(null) }}
                  style={{ fontSize: 13, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                />
              </div>
            </div>
            <button
              onClick={applyCustom}
              disabled={!draft.start || !draft.end || draft.start > draft.end}
              style={{
                marginTop: 'auto',
                background: '#18181b',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: (!draft.start || !draft.end || draft.start > draft.end) ? 0.4 : 1,
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
