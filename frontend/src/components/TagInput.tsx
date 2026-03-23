import { useEffect, useRef, useState } from 'react'
import type { MetaItem } from '../types'

interface TagInputProps {
  value: string[]
  onChange: (value: string[]) => void
  suggestions: MetaItem[]
  placeholder?: string
  loading?: boolean
  onRequestMetadata?: () => void
}

export default function TagInput({
  value,
  onChange,
  suggestions,
  placeholder,
  loading,
  onRequestMetadata,
}: TagInputProps) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeItemRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  // No slice — show all matches, dropdown scrolls
  const filtered = suggestions.filter(
    s =>
      !value.includes(s.api_name) &&
      (s.api_name.toLowerCase().includes(input.toLowerCase()) ||
        s.ui_name.toLowerCase().includes(input.toLowerCase())),
  )

  const add = (api_name: string) => {
    if (!value.includes(api_name)) onChange([...value, api_name])
    setInput('')
    setActiveIdx(0)
    inputRef.current?.focus()
  }

  const remove = (api_name: string) => onChange(value.filter(v => v !== api_name))

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[activeIdx]) add(filtered[activeIdx].api_name)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'Backspace' && input === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 5,
          padding: '6px 8px',
          border: `1px solid ${open ? 'var(--border-focus)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-sm)',
          background: 'var(--surface)',
          cursor: 'text',
          minHeight: 38,
          transition: 'border-color 0.15s',
          boxShadow: open ? '0 0 0 3px rgba(99,102,241,0.12)' : 'none',
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map(tag => (
          <span
            key={tag}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: 'var(--primary-light)',
              color: 'var(--primary-dark)',
              border: '1px solid #c7d2fe',
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 12,
              fontWeight: 500,
              lineHeight: 1.6,
            }}
          >
            {tag}
            <button
              onClick={e => { e.stopPropagation(); remove(tag) }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                color: '#818cf8',
                fontSize: 15,
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true); setActiveIdx(0) }}
          onFocus={() => { setOpen(true); onRequestMetadata?.() }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          style={{
            border: 'none',
            outline: 'none',
            flex: '1 0 140px',
            fontSize: 13,
            padding: '2px 0',
            background: 'transparent',
            color: 'var(--text)',
          }}
        />
      </div>

      {open && (loading || filtered.length > 0 || input.length > 0) && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            zIndex: 200,
            boxShadow: 'var(--shadow-md)',
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {loading ? (
            <div style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13 }}>
              Loading metadata…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13 }}>
              No matches
            </div>
          ) : (
            <>
              <div style={{ padding: '6px 10px 4px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>
                {filtered.length} available
              </div>
              {filtered.map((s, i) => (
                <div
                  key={s.api_name}
                  ref={i === activeIdx ? activeItemRef : null}
                  className="suggestion-row"
                  onMouseDown={() => add(s.api_name)}
                  style={{
                    padding: '8px 14px',
                    cursor: 'pointer',
                    background: i === activeIdx ? 'var(--primary-light)' : 'transparent',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid #f8fafc',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{s.api_name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 12 }}>{s.ui_name}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
