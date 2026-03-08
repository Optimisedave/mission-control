# Mission Control v2 — Project Status

**Last updated:** 2026-03-05
**Framework:** [builderz-labs/mission-control](https://github.com/builderz-labs/mission-control)
**Server:** `http://localhost:3000` — `npm run dev` from `_mission-control/`
**DB:** `.data/mission-control.db` (SQLite)

---

## What's live

### Phase 1 — Complete (signed off 2026-03-05)

- **Task board end-to-end:** Inbox → Ready → Roy's Desk (in_progress) → Blocked → Dave Review → Done
- **Roy execution engine:** `/api/roy/execute` polls `status=ready` tasks on a cycle; executes via OpenClaw session; comments results; moves card to Dave Review; pings Dave on Telegram
- **External-human guardrail:** tasks tagged `outreach`, `email`, `linkedin`, `post`, `send`, or `dm` are blocked from auto-execution and always route to Dave Review before anything leaves the machine
- **SQLite snapshot layer:** Python pipeline scripts POST a snapshot to `/api/wildform/snapshot` after every send, inbox check, and enrichment run. Dashboard reads from snapshots — no live Maton/Sheets calls on page load
- **Hero metric per product:** days of queue remaining = `queued_count ÷ daily_cap`, colour-coded: green >10d, amber 5–10d, red <5d
- **Roy agent registered:** id=1, name="Roy", role="outreach-orchestrator", session_key=`agent:main:main`
- **DB migrations applied:** 027 (Roy columns), 028 (crm_snapshots), 029 (resend_events)

### Phase 2 — Complete (signed off 2026-03-05)

- **Pipeline page** (`/pipeline`): WF/CR tab switcher; LinkedIn placeholder sits inside the Wildform tab (CR gets LinkedIn only after post-validation)
- **Outreach funnel chart** (`FunnelPanel`): horizontal bar chart, stages New → Queued → Sent_1 → Sent_2 → Sent_3 → Replied, counts + % of pipeline, per-product
- **Resend events panel** (`ResendEventsPanel`): warmth-tier display — Hot (clicked link), Warm (2+ opens/no click), Mild (1 open/no click), Cold (no opens). Tier definitions live in `src/lib/resend-tiers.ts` — one place to adjust thresholds. Panel shows criteria inline
- **Resend hourly scheduler:** `scheduler.ts` task `resend_poll` runs every 60 minutes; spawns `scripts/resend_poll_mc.py` which reads both Outreach_Logs, extracts Resend UUIDs, pipes to `resend_check_events.py --stdin`, POSTs to `/api/wildform/resend-events`. First run is 1 hour after startup. Toggleable via `general.resend_poll` setting
- **LinkedIn placeholder panel** (`LinkedInPanel`): "Pending API Approval" state, greyed-out stat slots. No data fetching
- **TypeScript type alignment fixed:** single `Task` interface in `src/store/index.ts`, imported by `task-board-panel.tsx` — no local redeclaration. Eliminates a class of silent status-mismatch bugs where dragged cards would write unrecognised status values to the store

---

## Architecture decisions (locked)

| Decision | Detail |
|---|---|
| Python pipeline unchanged | One fire-and-forget POST added to 4 scripts: `send_batch_TEMPLATE.py`, `send_batch_cr_E1.py`, `inbox_check.py`, `send_followups_auto.py` |
| No live Maton dependency on Node side | Outreach_Log parsed Python-side, snapshotted at send time; dashboard reads SQLite only |
| Resend polling via MC scheduler | Native hourly job in `scheduler.ts` spawns Python wrapper; no Node-side Resend client needed |
| Distinct secrets | `AUTH_PASS` = dashboard login; `API_KEY` = Python POST writes. Set in `~/.openclaw/.env` |
| Framework scope | Task board, agent polling, SSE real-time, SQLite, scheduler come from the framework. Pipeline page, hero metric, funnel, Resend panel, Roy execution engine are custom |

---

## What's not built yet — Phase 3

Gated on **LinkedIn Community Management API approval**.

- LinkedIn panel: posting queue, performance metrics, ad campaign data
- GitHub sync and weekly standup reports — on task board Inbox, deferred until live usage patterns are established

---

## What to watch

- **WF queue runway:** was 2 days (red) as of 2026-03-05. Monitor after cooloff requeue fires 2026-03-16
- **CR queue runway:** was 3 days (red) as of 2026-03-05. Monitor after next restock run
- **Resend panel on restart:** first poll runs 1 hour after startup — panel will show empty state until then. This is expected
- **Pre-existing framework panels:** 28 panels from the framework are untouched and still accessible via nav. Only Pipeline and Tasks are used operationally

---

## Key files

```
_mission-control/
  src/
    app/
      [[...panel]]/page.tsx              # ContentRouter + PipelinePage (tab switcher)
      api/
        wildform/
          snapshot/route.ts              # GET + POST CRM snapshots
          resend-events/route.ts         # GET + POST Resend warmth events
        roy/
          execute/route.ts               # Roy task polling + execution
          complete/route.ts              # Roy task completion handler
    components/panels/wildform/
      product-hero-panel.tsx             # Days remaining hero metric
      funnel-panel.tsx                   # Pipeline funnel chart
      resend-events-panel.tsx            # Warmth tier display
      linkedin-panel.tsx                 # Placeholder
    lib/
      migrations.ts                      # DB schema (migrations 001–029)
      scheduler.ts                       # Hourly Resend poll + standard tasks
      resend-tiers.ts                    # Warmth tier thresholds (edit here to adjust)
    store/index.ts                       # Single Task type — source of truth

workspace/scripts/
  mc_snapshot.py                         # push_snapshot() — called by pipeline scripts
  resend_poll_mc.py                      # Hourly Resend poller (spawned by scheduler)
```
