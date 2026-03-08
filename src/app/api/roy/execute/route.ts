/**
 * POST /api/roy/execute
 *
 * Called by the OpenClaw cron job every 5 minutes (business hours only).
 * Polls for the next ready task, checks guardrails, then either:
 *   - Spawns a Roy session to execute it (safe tasks)
 *   - Moves it straight to dave_review (external-human tasks)
 *
 * Guardrail tags that skip to dave_review (never auto-execute):
 *   outreach, email, linkedin, post, send, dm
 *
 * Returns: { picked_up: boolean, task_id?, action: 'executing'|'dave_review'|'none' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'

const EXTERNAL_TAGS = new Set(['outreach', 'email', 'linkedin', 'post', 'send', 'dm'])
const AGENT_NAME = 'Roy'
const OPENCLAW_GATEWAY = process.env.OPENCLAW_GATEWAY_HOST || '127.0.0.1'
const OPENCLAW_PORT = process.env.OPENCLAW_GATEWAY_PORT || '18789'
const OPENCLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || ''
const TELEGRAM_CHAT_ID = '6531865806'

async function postComment(db: any, taskId: number, content: string, workspaceId: number) {
  const now = Math.floor(Date.now() / 1000)
  db.prepare(
    `INSERT INTO comments (task_id, author, content, created_at) VALUES (?, ?, ?, ?)`
  ).run(taskId, AGENT_NAME, content, now)
}

async function setTaskStatus(db: any, taskId: number, status: string, workspaceId: number) {
  const now = Math.floor(Date.now() / 1000)
  db.prepare(
    `UPDATE tasks SET status = ?, updated_at = ?, assigned_to = ? WHERE id = ? AND workspace_id = ?`
  ).run(status, now, AGENT_NAME, taskId, workspaceId)
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
    logger.warn({ err }, 'Failed to send Telegram notification')
  }
}

async function getBotToken(): Promise<string | null> {
  try {
    const { readFile } = require('fs/promises')
    const raw = await readFile('/Users/openclaw/.openclaw/openclaw.json', 'utf-8')
    const config = JSON.parse(raw)
    return config?.channels?.telegram?.accounts?.wildform?.botToken || null
  } catch {
    return null
  }
}

function hasExternalTag(tags: string[]): boolean {
  return tags.some(t => EXTERNAL_TAGS.has(t.toLowerCase()))
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1
    const now = Math.floor(Date.now() / 1000)

    // Poll next ready task for Roy
    const task = db.prepare(`
      SELECT * FROM tasks
      WHERE workspace_id = ? AND status = 'ready'
        AND (assigned_to IS NULL OR assigned_to = ?)
      ORDER BY
        CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ASC,
        created_at ASC
      LIMIT 1
    `).get(workspaceId, AGENT_NAME) as any | undefined

    if (!task) {
      return NextResponse.json({ picked_up: false, action: 'none' })
    }

    // Parse tags
    let tags: string[] = []
    try { tags = JSON.parse(task.tags || '[]') } catch {}

    // GUARDRAIL: external-human tasks go straight to dave_review with rendered output comment
    if (hasExternalTag(tags)) {
      await setTaskStatus(db, task.id, 'dave_review', workspaceId)
      const comment = [
        `⚠️ **Guardrail: external send required**`,
        `This task is tagged [${tags.join(', ')}] — it involves outbound communication to a real person.`,
        `Roy will not auto-execute this. Please review and approve, then re-queue with a \`ready\` status and the tag removed, or handle manually.`,
        ``,
        `**Task:** ${task.title}`,
        task.description ? `**Details:** ${task.description}` : '',
      ].filter(Boolean).join('\n')
      await postComment(db, task.id, comment, workspaceId)
      await sendTelegram(
        `📋 <b>Dave Review needed</b>\n\nTask: <b>${task.title}</b>\n\nThis task involves outbound communication and needs your approval before Roy can proceed.\n\nOpen Mission Control to review: http://127.0.0.1:3000`
      )
      return NextResponse.json({ picked_up: true, task_id: task.id, action: 'dave_review' })
    }

    // Claim the task
    const claimed = db.prepare(`
      UPDATE tasks SET status = 'in_progress', assigned_to = ?, updated_at = ?
      WHERE id = ? AND workspace_id = ? AND status = 'ready'
    `).run(AGENT_NAME, now, task.id, workspaceId)

    if (claimed.changes === 0) {
      // Race condition — another process claimed it
      return NextResponse.json({ picked_up: false, action: 'none' })
    }

    await postComment(db, task.id, `🚀 Picked up. Working on it...`, workspaceId)

    // Spawn Roy session via OpenClaw gateway HTTP API
    const spawnPayload = {
      message: buildTaskPrompt(task),
      model: 'sonnet',
      timeoutSeconds: 1200,
    }

    const spawnRes = await fetch(
      `http://${OPENCLAW_GATEWAY}:${OPENCLAW_PORT}/api/sessions/spawn`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
        },
        body: JSON.stringify(spawnPayload),
      }
    )

    if (!spawnRes.ok) {
      const errText = await spawnRes.text()
      throw new Error(`Spawn failed: ${spawnRes.status} ${errText}`)
    }

    const spawnData = await spawnRes.json()
    const sessionKey = spawnData?.sessionKey || spawnData?.session_key || 'unknown'

    // Store session key in task metadata for tracking
    const meta = (() => { try { return JSON.parse(task.metadata || '{}') } catch { return {} } })()
    meta.spawn_session = sessionKey
    meta.spawned_at = now
    db.prepare(`UPDATE tasks SET metadata = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`)
      .run(JSON.stringify(meta), now, task.id, workspaceId)

    logger.info({ taskId: task.id, sessionKey }, 'Roy task spawned')
    return NextResponse.json({ picked_up: true, task_id: task.id, action: 'executing', session_key: sessionKey })

  } catch (error: any) {
    logger.error({ err: error }, 'POST /api/roy/execute error')
    return NextResponse.json({ error: error.message || 'Execution failed' }, { status: 500 })
  }
}

function buildTaskPrompt(task: any): string {
  const lines = [
    `You are Roy, executing a task from Mission Control.`,
    ``,
    `## Task`,
    `**Title:** ${task.title}`,
    task.description ? `**Description:**\n${task.description}` : '',
    `**Priority:** ${task.priority}`,
    `**Task ID:** ${task.id}`,
    ``,
    `## On completion`,
    `When done, update the task in Mission Control:`,
    `1. POST a comment to http://127.0.0.1:3000/api/tasks/${task.id}/comments with your result summary`,
    `2. PUT http://127.0.0.1:3000/api/tasks/${task.id} with status="dave_review" if output needs Dave's sign-off, or status="done" if it's self-contained`,
    `3. Send Dave a Telegram message summarising what you did`,
    `Use x-api-key: ${process.env.API_KEY || ''} header for all MC API calls.`,
    ``,
    `## On failure or if you need Dave's input`,
    `1. POST a comment explaining exactly what you need or what went wrong`,
    `2. PUT status="blocked" on the task`,
    `3. Send Dave a Telegram message with the specific question or blocker`,
  ].filter(s => s !== undefined && s !== null).join('\n')

  return lines
}
