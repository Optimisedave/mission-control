'use client'

import { useEffect, useState, useCallback } from 'react'
import { TIER_LABELS, type WarmthTier } from '@/lib/resend-tiers'

interface ResendEvent {
  id: number
  resend_id: string
  contact_email: string | null
  company: string | null
  event_type: string
  warmth_tier: WarmthTier | null
  occurred_at: number | null
}

interface ResendData {
  hot: ResendEvent[]
  warm: ResendEvent[]
  mild: ResendEvent[]
  cold: ResendEvent[]
  total: number
  last_updated: number | null
}

interface Props {
  product: 'wildform' | 'conditionregister'
}

function timeAgo(ts: number | null): string {
  if (!ts) return 'never'
  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function TierSection({
  tier,
  events,
}: {
  tier: WarmthTier
  events: ResendEvent[]
}) {
  const [open, setOpen] = useState(false)
  const { emoji, label, hint } = TIER_LABELS[tier]

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-secondary/50 hover:bg-secondary transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <span>{emoji} {label}</span>
          <span className="text-xs text-muted-foreground font-normal">— {hint}</span>
          <span className="text-xs text-muted-foreground font-normal">({events.length})</span>
        </div>
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="4,6 8,10 12,6" />
        </svg>
      </button>
      {open && events.length > 0 && (
        <div className="divide-y divide-border">
          {events.map((e) => (
            <div key={e.id} className="px-4 py-2 text-xs flex items-center justify-between gap-3">
              <div>
                <span className="font-medium text-foreground">{e.company || '—'}</span>
                <span className="text-muted-foreground ml-2">{e.contact_email || e.resend_id}</span>
              </div>
              <span className="text-muted-foreground shrink-0">{e.event_type}</span>
            </div>
          ))}
        </div>
      )}
      {open && events.length === 0 && (
        <div className="px-4 py-3 text-xs text-muted-foreground">No contacts in this tier.</div>
      )}
    </div>
  )
}

export function ResendEventsPanel({ product }: Props) {
  const [data, setData] = useState<ResendData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastFetched, setLastFetched] = useState<number | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/wildform/resend-events?product=${product}&limit=200`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
        setLastFetched(Math.floor(Date.now() / 1000))
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [product])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchData])

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <div className="h-5 w-40 rounded bg-muted animate-pulse" />
        <div className="h-10 rounded bg-muted animate-pulse" />
        <div className="h-10 rounded bg-muted animate-pulse" />
        <div className="h-10 rounded bg-muted animate-pulse" />
      </div>
    )
  }

  const isEmpty = !data || data.total === 0

  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Resend Events</h3>
        <button
          onClick={fetchData}
          className="text-xs px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          Refresh
        </button>
      </div>

      {isEmpty ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No Resend data yet — polling runs hourly
        </div>
      ) : (
        <div className="space-y-2">
          <TierSection tier="hot"  events={data!.hot} />
          <TierSection tier="warm" events={data!.warm} />
          <TierSection tier="mild" events={data!.mild} />
          <div className="px-4 py-2.5 rounded-lg border border-border bg-secondary/30 text-xs text-muted-foreground flex items-center gap-2">
            <span>{TIER_LABELS.cold.emoji} {TIER_LABELS.cold.label}</span>
            <span>— {TIER_LABELS.cold.hint}</span>
            <span className="ml-auto font-medium text-foreground">{data!.cold.length}</span>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground pt-1">
        Last polled: {timeAgo(lastFetched)}
      </div>
    </div>
  )
}
