import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { classifyTier } from '@/lib/resend-tiers'

const API_KEY = process.env.API_KEY || '9e11322f0bc1bfcdea2ef669870d001b7205ddba'

export async function GET(req: NextRequest) {
  const auth = requireRole(req, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(req.url)
  const product = searchParams.get('product') || 'wildform'
  const limit = parseInt(searchParams.get('limit') || '50', 10)

  const db = getDatabase()

  const rows = db.prepare(`
    SELECT id, product, resend_id, contact_email, company, event_type, warmth_tier, occurred_at, recorded_at
    FROM resend_events
    WHERE product = ?
    ORDER BY occurred_at DESC
    LIMIT ?
  `).all(product, limit) as any[]

  const grouped: Record<string, any[]> = { hot: [], warm: [], mild: [], cold: [] }
  let lastUpdated = 0

  for (const row of rows) {
    const tier = row.warmth_tier || 'cold'
    if (grouped[tier]) grouped[tier].push(row)
    else grouped['cold'].push(row)
    if (row.recorded_at > lastUpdated) lastUpdated = row.recorded_at
  }

  return NextResponse.json({
    hot: grouped.hot,
    warm: grouped.warm,
    mild: grouped.mild,
    cold: grouped.cold,
    total: rows.length,
    last_updated: lastUpdated || null,
  })
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key')
  if (apiKey !== API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { product, events } = body as {
    product: string
    events: Array<{
      resend_id: string
      contact_email?: string
      company?: string
      event_type: string
      warmth_tier?: string
      opens?: number       // optional: auto-classify if warmth_tier not provided
      clicks?: number
      occurred_at?: number
    }>
  }

  if (!product || !Array.isArray(events)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const db = getDatabase()
  const upsert = db.prepare(`
    INSERT INTO resend_events (product, resend_id, contact_email, company, event_type, warmth_tier, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(resend_id, event_type) DO UPDATE SET
      contact_email = excluded.contact_email,
      company = excluded.company,
      warmth_tier = excluded.warmth_tier,
      occurred_at = excluded.occurred_at,
      recorded_at = unixepoch()
  `)

  const insertMany = db.transaction((evts: typeof events) => {
    for (const e of evts) {
      // Use provided tier, or auto-classify from opens/clicks counts
      const tier = e.warmth_tier ?? (
        (e.opens !== undefined || e.clicks !== undefined)
          ? classifyTier(e.opens ?? 0, e.clicks ?? 0)
          : null
      )
      upsert.run(
        product,
        e.resend_id,
        e.contact_email ?? null,
        e.company ?? null,
        e.event_type,
        tier,
        e.occurred_at ?? null
      )
    }
  })

  insertMany(events)

  return NextResponse.json({ ok: true, inserted: events.length })
}
