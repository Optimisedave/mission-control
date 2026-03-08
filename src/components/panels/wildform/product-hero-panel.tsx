'use client'

/**
 * ProductHeroPanel
 *
 * Per-product hero metric: days of queue remaining, colour-coded.
 * Green >10 days | Amber 5–10 | Red <5
 *
 * Also shows: Queued, New, Replied, Bounce, DNC raw counts.
 * Refresh button triggers a live pull from the snapshot endpoint.
 */

import { useEffect, useState, useCallback } from 'react'

interface Snapshot {
  product: string
  source: string
  queued_count: number
  new_count: number
  replied_count: number
  bounce_count: number
  dnc_count: number
  daily_cap: number
  sent_today: number
  snapshot_at: number
  status_counts: Record<string, number>
}

interface Props {
  product: 'wildform' | 'conditionregister'
  label: string
}

function daysColour(days: number): { bg: string; text: string; ring: string } {
  if (days > 10) return { bg: 'bg-green-500/10', text: 'text-green-400', ring: 'ring-green-500/30' }
  if (days >= 5)  return { bg: 'bg-amber-500/10',  text: 'text-amber-400',  ring: 'ring-amber-500/30' }
  return              { bg: 'bg-red-500/10',   text: 'text-red-400',   ring: 'ring-red-500/30' }
}

function timeAgo(unixTs: number): string {
  const secs = Math.floor(Date.now() / 1000) - unixTs
  if (secs < 60)   return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export function ProductHeroPanel({ product, label }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchSnapshot = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/wildform/snapshot?product=${product}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setSnapshot(data.snapshot)
    } catch (e: any) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [product])

  useEffect(() => {
    fetchSnapshot()
    // Auto-refresh every 5 minutes
    const id = setInterval(() => fetchSnapshot(), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchSnapshot])

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-6 animate-pulse">
        <div className="h-5 w-32 bg-muted rounded mb-4" />
        <div className="h-20 w-24 bg-muted rounded mx-auto" />
      </div>
    )
  }

  if (error || !snapshot) {
    return (
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{label}</h3>
          <button onClick={() => fetchSnapshot(true)} className="text-xs text-muted-foreground hover:text-foreground">
            Retry
          </button>
        </div>
        <p className="text-sm text-red-400">{error || 'No snapshot yet — pipeline hasn\'t run'}</p>
      </div>
    )
  }

  // Business days remaining: count only Mon–Fri send days
  const calendarDays = Math.floor(snapshot.queued_count / (snapshot.daily_cap || 20))
  function businessDaysFromNow(n: number): number {
    let count = 0
    const d = new Date()
    while (count < n) {
      d.setDate(d.getDate() + 1)
      const dow = d.getDay()
      if (dow !== 0 && dow !== 6) count++ // skip Sat(6) and Sun(0)
    }
    const msPerDay = 86400000
    return Math.round((d.getTime() - Date.now()) / msPerDay)
  }
  const days = calendarDays > 0 ? businessDaysFromNow(calendarDays) : 0
  const colour = daysColour(days)
  const statusEntries = Object.entries(snapshot.status_counts)
    .filter(([k]) => !['icp_fail', 'No_Contact', 'Manual_Enrichment', 'Audit_Hold', 'Cooloff'].includes(k))
    .sort(([, a], [, b]) => b - a)

  return (
    <div className={`rounded-xl border bg-card p-6 ring-1 ${colour.ring}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{label}</h3>
        <button
          onClick={() => fetchSnapshot(true)}
          disabled={refreshing}
          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-opacity"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Hero number */}
      <div className={`rounded-lg ${colour.bg} p-5 text-center mb-5`}>
        <div className={`text-6xl font-bold tabular-nums ${colour.text}`}>
          {days}
        </div>
        <div className="text-sm text-muted-foreground mt-1">
          days of queue remaining
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {snapshot.queued_count} queued ÷ {snapshot.daily_cap}/day
        </div>
      </div>

      {/* Key counts */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Queued"  value={snapshot.queued_count}  colour="text-foreground" />
        <Stat label="New"     value={snapshot.new_count}     colour="text-muted-foreground" />
        <Stat label="Replied" value={snapshot.replied_count} colour="text-green-400" />
        <Stat label="Bounce"  value={snapshot.bounce_count}  colour="text-amber-400" />
        <Stat label="DNC"     value={snapshot.dnc_count}     colour="text-red-400" />
        <Stat label="Sent today" value={snapshot.sent_today} colour="text-blue-400" />
      </div>

      {/* Full status breakdown (collapsed by default) */}
      <details className="group">
        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
          Full status breakdown
        </summary>
        <div className="mt-2 space-y-1">
          {statusEntries.map(([status, count]) => (
            <div key={status} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{status}</span>
              <span className="tabular-nums font-medium">{count}</span>
            </div>
          ))}
        </div>
      </details>

      {/* Staleness */}
      <p className="text-xs text-muted-foreground mt-3 text-right">
        via {snapshot.source} · {timeAgo(snapshot.snapshot_at)}
      </p>
    </div>
  )
}

function Stat({ label, value, colour }: { label: string; value: number; colour: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
      <div className={`text-lg font-semibold tabular-nums ${colour}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
