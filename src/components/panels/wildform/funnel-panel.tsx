'use client'

interface Snapshot {
  product: string
  status_counts: Record<string, number>
  bounce_count: number
  dnc_count: number
}

interface Props {
  snapshot: Snapshot | null
}

const STAGES = [
  { key: 'New',     label: 'New',     color: 'bg-slate-500' },
  { key: 'Queued',  label: 'Queued',  color: 'bg-blue-500' },
  { key: 'Sent_1',  label: 'Sent 1',  color: 'bg-indigo-500' },
  { key: 'Sent_2',  label: 'Sent 2',  color: 'bg-violet-500' },
  { key: 'Sent_3',  label: 'Sent 3',  color: 'bg-purple-500' },
  { key: 'Replied', label: 'Replied', color: 'bg-green-500' },
]

export function FunnelPanel({ snapshot }: Props) {
  if (!snapshot) {
    return (
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="h-5 w-32 rounded bg-muted animate-pulse" />
        <div className="space-y-2">
          {STAGES.map((s) => (
            <div key={s.key} className="h-8 rounded bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const counts = snapshot.status_counts || {}

  // Total = sum of pipeline stages (excluding Replied)
  const pipelineTotal = STAGES.slice(0, 5).reduce((acc, s) => acc + (counts[s.key] ?? 0), 0)
  const grandTotal = STAGES.reduce((acc, s) => acc + (counts[s.key] ?? 0), 0)

  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Outreach Funnel</h3>

      <div className="space-y-2">
        {STAGES.map((stage) => {
          const count = counts[stage.key] ?? 0
          const pct = grandTotal > 0 ? Math.round((count / grandTotal) * 100) : 0
          const barWidth = grandTotal > 0 ? Math.max((count / grandTotal) * 100, count > 0 ? 2 : 0) : 0

          return (
            <div key={stage.key} className="space-y-0.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{stage.label}</span>
                <span>{count} · {pct}%</span>
              </div>
              <div className="h-5 w-full rounded bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded transition-all duration-500 ${stage.color}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Bounce + DNC badges */}
      <div className="flex gap-3 pt-1">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
          Bounce: {snapshot.bounce_count ?? 0}
        </span>
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
          DNC: {snapshot.dnc_count ?? 0}
        </span>
      </div>
    </div>
  )
}
