/**
 * Next.js Edge Middleware — must live at src/middleware.ts (not src/proxy.ts).
 *
 * Wraps proxy.ts with async Redis session validation so that cold-start Vercel
 * instances (where SQLite is empty) still authenticate users correctly by
 * injecting the `x-mc-redis-user` header before the request reaches a route handler.
 *
 * Sign-out bug root cause: proxy.ts was never auto-detected by Next.js (the
 * framework only reads src/middleware.ts). Without this file the middleware was
 * entirely bypassed, so x-mc-redis-user was never injected and route handlers
 * relying on the header fell back to synchronous SQLite validation — which is
 * always empty on Vercel cold-start instances.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Re-export the route matcher from proxy.ts so we don't duplicate it.
export { config } from './proxy'

// ---------------------------------------------------------------------------
// Minimal Upstash Redis helper (REST API — no npm dependency, edge-safe)
// ---------------------------------------------------------------------------
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

async function redisGet(key: string): Promise<string | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null
  try {
    const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = await res.json() as { result: string | null }
    return json.result
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Security helpers (subset of proxy.ts — reproduced for edge-safe runtime)
// ---------------------------------------------------------------------------
function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  return response
}

function envFlag(name: string): boolean {
  const raw = process.env[name]
  if (raw === undefined) return false
  const v = String(raw).trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

function getRequestHostname(request: NextRequest): string {
  const raw = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const first = raw.split(',')[0] || ''
  return first.trim().split(':')[0] || ''
}

function hostMatches(pattern: string, hostname: string): boolean {
  const p = pattern.trim().toLowerCase()
  const h = hostname.trim().toLowerCase()
  if (!p || !h) return false
  if (p.startsWith('*.')) return h.endsWith(`.${p.slice(2)}`)
  if (p.endsWith('.*')) return h.startsWith(p.slice(0, -1))
  return h === p
}

function extractApiKey(request: NextRequest): string {
  const direct = (request.headers.get('x-api-key') || '').trim()
  if (direct) return direct
  const authorization = (request.headers.get('authorization') || '').trim()
  if (!authorization) return ''
  const [scheme, ...rest] = authorization.split(/\s+/)
  if (!scheme || rest.length === 0) return ''
  const normalized = scheme.toLowerCase()
  if (normalized === 'bearer' || normalized === 'apikey' || normalized === 'token') {
    return rest.join(' ').trim()
  }
  return ''
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // -- Host allowlist --
  const hostName = getRequestHostname(request)
  const allowAnyHost = envFlag('MC_ALLOW_ANY_HOST') || process.env.NODE_ENV !== 'production'
  const allowedPatterns = String(process.env.MC_ALLOWED_HOSTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const enforceAllowlist = !allowAnyHost && allowedPatterns.length > 0
  const isAllowedHost = !enforceAllowlist || allowedPatterns.some((p) => hostMatches(p, hostName))
  if (!isAllowedHost) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  // -- CSRF check for mutating requests --
  const method = request.method.toUpperCase()
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    const origin = request.headers.get('origin')
    if (origin) {
      let originHost: string
      try { originHost = new URL(origin).host } catch { originHost = '' }
      const requestHost = request.headers.get('host')?.split(',')[0]?.trim() || request.nextUrl.host || ''
      if (originHost && requestHost && originHost !== requestHost) {
        return NextResponse.json({ error: 'CSRF origin mismatch' }, { status: 403 })
      }
    }
  }

  // -- Public routes (no auth needed) --
  const isPublicAuthRoute =
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/logout' ||
    pathname.startsWith('/api/auth/google')
  if (pathname === '/login' || isPublicAuthRoute || pathname === '/api/docs' || pathname === '/docs') {
    return applySecurityHeaders(NextResponse.next())
  }

  // -- Session resolution --
  const sessionToken = request.cookies.get('mc-session')?.value

  // Try to validate session against Redis and inject x-mc-redis-user header.
  // This is the critical fix for cold-start sign-out: route handlers read this
  // header instead of hitting an empty SQLite DB.
  if (sessionToken) {
    const raw = await redisGet(`session:${sessionToken}`)
    if (raw) {
      try {
        const session = JSON.parse(raw) as {
          userId: number
          workspaceId: number
          expiresAt: number
          user?: unknown
        }
        const now = Math.floor(Date.now() / 1000)
        if (session.expiresAt > now) {
          // Inject validated session data as request header for route handlers.
          const requestHeaders = new Headers(request.headers)
          requestHeaders.set(
            'x-mc-redis-user',
            JSON.stringify({
              userId: session.userId,
              workspaceId: session.workspaceId,
              token: sessionToken,
              user: session.user ?? null,
            }),
          )
          return applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }))
        }
        // Session expired in Redis — clear cookie and redirect to login for page routes.
      } catch {
        // Malformed session data — fall through.
      }
    }
    // Redis miss or expired: fall through. Route handlers will get a 401 for API routes.
    // For page routes, redirect to login below.
  }

  // -- API routes: accept session cookie OR API key --
  if (pathname.startsWith('/api/')) {
    const configuredApiKey = (process.env.API_KEY || '').trim()
    const apiKey = extractApiKey(request)
    const hasAgentKey = apiKey.startsWith('mca_')

    // If session token was present (Redis miss/expired) or API key present, pass through.
    // Route handlers will perform final validation.
    if (sessionToken || (configuredApiKey && apiKey === configuredApiKey) || hasAgentKey) {
      return applySecurityHeaders(NextResponse.next())
    }
    // No credentials at all.
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // -- Page routes: redirect to login if no session --
  if (sessionToken) {
    // Cookie present but Redis miss — still allow through; route handler will handle auth.
    return applySecurityHeaders(NextResponse.next())
  }

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  return NextResponse.redirect(loginUrl)
}
