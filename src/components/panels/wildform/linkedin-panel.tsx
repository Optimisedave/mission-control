'use client'

export function LinkedInPanel() {
  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">LinkedIn</h3>
        <span className="inline-flex items-center px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
          Pending API Approval
        </span>
      </div>

      <p className="text-sm text-muted-foreground">
        Community Management API approval required before posting can be enabled. Ads API is operational.
      </p>

      <div className="grid grid-cols-2 gap-3 pt-1">
        <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3">
          <div className="text-xs text-muted-foreground mb-1">Posts scheduled</div>
          <div className="text-lg font-semibold text-muted-foreground/50">—</div>
        </div>
        <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3">
          <div className="text-xs text-muted-foreground mb-1">Active campaigns</div>
          <div className="text-lg font-semibold text-muted-foreground/50">—</div>
        </div>
      </div>
    </div>
  )
}
