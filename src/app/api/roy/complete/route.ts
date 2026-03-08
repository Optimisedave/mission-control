/**
 * POST /api/roy/complete
 *
 * Called by Roy at the end of a spawned task session to:
 *   - Post a result comment on the task card
 *   - Move the task to dave_review or done
 *   - Send a Telegram ping to Dave
 *
 * Body: {
 *   task_id: number
 *   status: 'dave_review' | 'done' | 'blocked'
 *   summary: string          — shown on the card comment + Telegram
 *   blocker?: string         — required when status='blocked', included in Telegram ping
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'

const TELEGRAM_CHAT_ID = '6531865806'
const AGENT_NAME = 'Roy'

async function getBotToken(): Promise<string | null> {
  try {
    const { readFile } = require('fs/promises')
    const raw = await readFile('/Users/openclaw/.openclaw/openclaw.json', 'utf-8')
    const config = JSON.parse(raw)
    return config?.channels?.telegram?.accounts?.wildform?.botToken || null
  } catch { return null }
}

async function sendTelegram(message: string) {
  try {
    const botToken = await getBotToken()
    if (!botToken) return
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' }),
    })
  } catch (err) {
    logger.warn({ err }, 'Failed to send Telegram')
  }
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await request.json()
    const { task_id, status, summary, blocker } = body

    if (!task_id || !status || !summary) {
      return NextResponse.json({ error: 'task_id, status, and summary are required' }, { status: 400 })
    }

    const validStatuses = ['dave_review', 'done', 'blocked']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${validStatuses.join(', ')}` }, { status: 400 })
    }

    if (status === 'blocked' && !blocker) {
      return NextResponse.json({ error: 'blocker is required when status=blocked' }, { status: 400 })
    }

    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1
    const now = Math.floor(Date.now() / 1000)

    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?')
      .get(task_id, workspaceId) as any | undefined

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Post comment
    const commentLines: string[] = []
    if (status === 'blocked') {
      commentLines.push(`🚧 **Blocked**`)
      commentLines.push(``)
      commentLines.push(`**What I need from you:** ${blocker}`)
      if (summary !== blocker) {
        commentLines.push(``)
        commentLines.push(`**Progress so far:** ${summary}`)
      }
    } else if (status === 'dave_review') {
      commentLines.push(`✅ **Done — needs your review**`)
      commentLines.push(``)
      commentLines.push(summary)
    } else {
      commentLines.push(`✅ **Completed**`)
      commentLines.push(``)
      commentLines.push(summary)
    }

    db.prepare(`INSERT INTO comments (task_id, author, content, created_at) VALUES (?, ?, ?, ?)`)
      .run(task_id, AGENT_NAME, commentLines.join('\n'), now)

    // Update task status
    db.prepare(`UPDATE tasks SET status = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`)
      .run(status, now, task_id, workspaceId)

    // Telegram ping
    let tgMessage: string
    if (status === 'blocked') {
      tgMessage = [
        `🚧 <b>Blocked: ${task.title}</b>`,
        ``,
        `<b>I need from you:</b> ${blocker}`,
        ``,
        `Reply here or open the card: http://127.0.0.1:3000`,
      ].join('\n')
    } else if (status === 'dave_review') {
      tgMessage = [
        `📋 <b>Ready for your review: ${task.title}</b>`,
        ``,
        summary.slice(0, 300) + (summary.length > 300 ? '...' : ''),
        ``,
        `Open Mission Control to approve: http://127.0.0.1:3000`,
      ].join('\n')
    } else {
      tgMessage = [
        `✅ <b>Done: ${task.title}</b>`,
        ``,
        summary.slice(0, 300) + (summary.length > 300 ? '...' : ''),
      ].join('\n')
    }

    await sendTelegram(tgMessage)

    return NextResponse.json({ ok: true, task_id, status })

  } catch (error: any) {
    logger.error({ err: error }, 'POST /api/roy/complete error')
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 })
  }
}
