/**
 * POST /api/wildform/snapshot
 *
 * Receives CRM status snapshots from Python pipeline scripts (send_batch,
 * inbox_check, send_followups, enrichment). Writes to crm_snapshots table.
 * Dashboard reads from this table — sub-millisecond, no Maton round-trips.
 *
 * Also accepts conditionregister product via the same endpoint.
 *
 * Body: {
 *   product: 'wildform' | 'conditionregister'
 *   source: 'send_batch' | 'inbox_check' | 'followups' | 'enrichment' | 'manual'
 *   status_counts: Record<string, number>
 *   sent_today?: number
 *   sent_week?: number
 *   queued_count?: number
 *   new_count?: number
 *   replied_count?: number
 *   bounce_count?: number
 *   dnc_count?: number
 * }
 *
 * GET /api/wildform/snapshot?product=wildform
 * Returns the latest snapshot for that product.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'

// Redis helpers for snapshot persistence (survives cold starts)
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

async function redisPost(...args: unknown[]) {
  if (!REDIS_URL || !REDIS_TOKEN) return null
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  }).catch(() => null)
  if (!res?.ok) return null
  const json = await res.json() as { result: unknown }
  return json.result
}

async function redisSetSnapshot(product: string, payload: object) {
  await redisPost('SET', `snapshot:${product}`, JSON.stringify(payload))
}

async function redisGetSnapshot(product: string): Promise<object | null> {
  try {
    const raw = await redisPost('GET', `snapshot:${product}`) as string | null
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

const VALID_PRODUCTS = new Set(['wildform', 'conditionregister'])
const VALID_SOURCES = new Set(['send_batch', 'inbox_check', 'followups', 'enrichment', 'manual'])

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await request.json()
    const {
      product,
      source,
      status_counts,
      sent_today = 0,
      sent_week = 0,
      queued_count,
      new_count,
      replied_count,
      bounce_count,
      dnc_count,
      daily_cap = 20,
    } = body

    if (!VALID_PRODUCTS.has(product)) {
      return NextResponse.json({ error: `product must be one of: ${[...VALID_PRODUCTS].join(', ')}` }, { status: 400 })
    }
    if (!VALID_SOURCES.has(source)) {
      return NextResponse.json({ error: `source must be one of: ${[...VALID_SOURCES].join(', ')}` }, { status: 400 })
    }
    if (!status_counts || typeof status_counts !== 'object') {
      return NextResponse.json({ error: 'status_counts must be an object' }, { status: 400 })
    }

    const db = getDatabase()
    const now = Math.floor(Date.now() / 1000)

    // Derive counts from status_counts if not provided explicitly
    const counts = status_counts as Record<string, number>
    const q = queued_count ?? counts['Queued'] ?? 0
    const n = new_count ?? counts['New'] ?? 0
    const r = replied_count ?? counts['Replied'] ?? 0
    const b = bounce_count ?? counts['Bounce'] ?? 0
    const d = dnc_count ?? counts['DNC'] ?? 0

    db.prepare(`
      INSERT INTO crm_snapshots
        (product, source, status_counts, sent_today, sent_week,
         queued_count, new_count, replied_count, bounce_count, dnc_count, daily_cap, snapshot_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      product,
      source,
      JSON.stringify(counts),
      sent_today,
      sent_week,
      q, n, r, b, d,
      daily_cap,
      now, now
    )

    const snapshotPayload = { product, source, status_counts: counts, sent_today, sent_week, queued_count: q, new_count: n, replied_count: r, bounce_count: b, dnc_count: d, daily_cap, snapshot_at: now }
    await redisSetSnapshot(product, snapshotPayload)

    logger.info({ product, source, queued: q }, 'CRM snapshot written')
    return NextResponse.json({ ok: true, product, source, queued_count: q, snapshot_at: now })

  } catch (error: any) {
    logger.error({ err: error }, 'POST /api/wildform/snapshot error')
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { searchParams } = new URL(request.url)
    const product = searchParams.get('product') || 'wildform'

    if (!VALID_PRODUCTS.has(product)) {
      return NextResponse.json({ error: 'Invalid product' }, { status: 400 })
    }

    // Redis first (survives cold starts), SQLite fallback
    const redisSnap = await redisGetSnapshot(product)
    if (redisSnap) {
      return NextResponse.json({ snapshot: redisSnap, product })
    }

    try {
      const db = getDatabase()
      const latest = db.prepare(`
        SELECT * FROM crm_snapshots
        WHERE product = ?
        ORDER BY snapshot_at DESC
        LIMIT 1
      `).get(product) as any | undefined

      if (!latest) {
        return NextResponse.json({ snapshot: null, product })
      }

      return NextResponse.json({
        snapshot: { ...latest, status_counts: JSON.parse(latest.status_counts || '{}') },
        product,
      })
    } catch {
      return NextResponse.json({ snapshot: null, product })
    }

  } catch (error: any) {
    logger.error({ err: error }, 'GET /api/wildform/snapshot error')
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 })
  }
}
