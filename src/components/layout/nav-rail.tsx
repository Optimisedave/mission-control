'use client'

import { useState, useEffect } from 'react'
import { useMissionControl } from '@/store'
import { useNavigateToPanel } from '@/lib/navigation'

interface NavItem {
  id: string
  label: string
  icon: React.ReactNode
  priority: boolean // Show in mobile bottom bar
  requiresGateway?: boolean
}

interface NavGroup {
  id: string
  label?: string // undefined = no header (core group)
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    id: 'core',
    items: [
      { id: 'pipeline',  label: 'Pipeline',     icon: <PipelineIcon />,  priority: true },
      { id: 'roy-board', label: "Roy's Board",   icon: <KanbanIcon />,    priority: true },
      { id: 'tasks',     label: 'Tasks',         icon: <TasksIcon />,     priority: false, requiresGateway: true },
    ],
  },
  {
    id: 'observe',
    label: 'OBSERVE',
    items: [
      { id: 'activity', label: 'Activity', icon: <ActivityIcon />, priority: false, requiresGateway: true },
      { id: 'logs',     label: 'Logs',     icon: <LogsIcon />,     priority: false, requiresGateway: true },
    ],
  },
  {
    id: 'automate',
    label: 'AUTOMATE',
    items: [
      { id: 'cron', label: 'Cron', icon: <CronIcon />, priority: false, requiresGateway: true },
    ],
  },
  {
    id: 'agents',
    label: 'AGENTS',
    items: [
      { id: 'agents', label: 'Agents', icon: <AgentsIcon />, priority: false, requiresGateway: true },
      { id: 'office', label: 'Office', icon: <OfficeIcon />, priority: false, requiresGateway: true },
    ],
  },
  {
    id: 'system',
    label: 'SYSTEM',
    items: [
      { id: 'settings', label: 'Settings', icon: <SettingsIcon />, priority: false },
    ],
  },
]

// Flat list for mobile bar
const allNavItems = navGroups.flatMap(g => g.items)

export function NavRail() {
  const { activeTab, connection, dashboardMode, sidebarExpanded, collapsedGroups, toggleSidebar, toggleGroup } = useMissionControl()
  const navigateToPanel = useNavigateToPanel()
  const isLocal = dashboardMode === 'local'

  // Keyboard shortcut: [ to toggle sidebar
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === '[' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable)) {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [toggleSidebar])

  return (
    <>
      {/* Desktop: Grouped sidebar */}
      <nav
        role="navigation"
        aria-label="Main navigation"
        className={`hidden md:flex flex-col bg-card border-r border-border shrink-0 transition-all duration-200 ease-in-out ${
          sidebarExpanded ? 'w-[220px]' : 'w-14'
        }`}
      >
        {/* Header: Logo + toggle */}
        <div className={`flex items-center shrink-0 ${sidebarExpanded ? 'px-3 py-3 gap-2.5' : 'flex-col py-3 gap-2'}`}>
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <span className="text-primary-foreground font-bold text-xs">MC</span>
          </div>
          {sidebarExpanded && (
            <span className="text-sm font-semibold text-foreground truncate flex-1">Mission Control</span>
          )}
          <button
            onClick={toggleSidebar}
            title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-smooth shrink-0"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              {sidebarExpanded ? (
                <polyline points="10,3 5,8 10,13" />
              ) : (
                <polyline points="6,3 11,8 6,13" />
              )}
            </svg>
          </button>
        </div>

        {/* Nav groups */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
          {navGroups.map((group, groupIndex) => (
            <div key={group.id}>
              {/* Divider between groups (not before first) */}
              {groupIndex > 0 && (
                <div className={`my-1.5 border-t border-border ${sidebarExpanded ? 'mx-3' : 'mx-2'}`} />
              )}

              {/* Group header (expanded mode, only for groups with labels) */}
              {sidebarExpanded && group.label && (
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between px-3 mt-3 mb-1 group/header"
                >
                  <span className="text-[10px] tracking-wider text-muted-foreground/60 font-semibold select-none">
                    {group.label}
                  </span>
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`w-3 h-3 text-muted-foreground/40 group-hover/header:text-muted-foreground transition-transform duration-150 ${
                      collapsedGroups.includes(group.id) ? '-rotate-90' : ''
                    }`}
                  >
                    <polyline points="4,6 8,10 12,6" />
                  </svg>
                </button>
              )}

              {/* Group items */}
              <div
                className={`overflow-hidden transition-all duration-150 ease-in-out ${
                  sidebarExpanded && collapsedGroups.includes(group.id) ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'
                }`}
              >
                <div className={`flex flex-col ${sidebarExpanded ? 'gap-0.5 px-2' : 'items-center gap-1'}`}>
                  {group.items.map((item) => {
                    const disabled = isLocal && item.requiresGateway
                    return (
                      <NavButton
                        key={item.id}
                        item={item}
                        active={activeTab === item.id}
                        expanded={sidebarExpanded}
                        disabled={disabled}
                        onClick={() => { if (!disabled) navigateToPanel(item.id) }}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Connection indicator */}
        <div className={`shrink-0 py-3 flex ${sidebarExpanded ? 'px-3 items-center gap-2' : 'flex-col items-center'}`}>
          <div
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              isLocal
                ? 'bg-blue-500'
                : connection.isConnected ? 'bg-green-500 pulse-dot' : 'bg-red-500'
            }`}
            title={isLocal ? 'Local Mode' : connection.isConnected ? 'Gateway connected' : 'Gateway disconnected'}
          />
          {sidebarExpanded && (
            <span className="text-xs text-muted-foreground truncate">
              {isLocal ? 'Local Mode' : connection.isConnected ? 'Connected' : 'Disconnected'}
            </span>
          )}
        </div>
      </nav>

      {/* Mobile: Bottom tab bar */}
      <MobileBottomBar activeTab={activeTab} navigateToPanel={navigateToPanel} />
    </>
  )
}

function NavButton({ item, active, expanded, disabled, onClick }: {
  item: NavItem
  active: boolean
  expanded: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const disabledClass = disabled ? 'opacity-40 pointer-events-none' : ''
  const tooltipLabel = disabled ? `${item.label} (Requires gateway)` : item.label

  if (expanded) {
    return (
      <button
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        aria-disabled={disabled || undefined}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-smooth relative ${disabledClass} ${
          active
            ? 'bg-primary/15 text-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
        }`}
      >
        {active && (
          <span className="absolute left-0 w-0.5 h-5 bg-primary rounded-r" />
        )}
        <div className="w-5 h-5 shrink-0">{item.icon}</div>
        <span className="text-sm truncate">{item.label}</span>
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      title={tooltipLabel}
      aria-current={active ? 'page' : undefined}
      aria-disabled={disabled || undefined}
      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-smooth group relative ${disabledClass} ${
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
      }`}
    >
      <div className="w-5 h-5">{item.icon}</div>
      {/* Tooltip */}
      <span className="absolute left-full ml-2 px-2 py-1 text-xs font-medium bg-popover text-popover-foreground border border-border rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
        {tooltipLabel}
      </span>
      {/* Active indicator */}
      {active && (
        <span className="absolute left-0 w-0.5 h-5 bg-primary rounded-r" />
      )}
    </button>
  )
}

function MobileBottomBar({ activeTab, navigateToPanel }: {
  activeTab: string
  navigateToPanel: (tab: string) => void
}) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const priorityItems = allNavItems.filter(i => i.priority)
  const nonPriorityIds = new Set(allNavItems.filter(i => !i.priority).map(i => i.id))
  const moreIsActive = nonPriorityIds.has(activeTab)

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border safe-area-bottom">
        <div className="flex items-center justify-around px-1 h-14">
          {priorityItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigateToPanel(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-lg transition-smooth min-w-[48px] min-h-[48px] ${
                activeTab === item.id
                  ? 'text-primary'
                  : 'text-muted-foreground'
              }`}
            >
              <div className="w-5 h-5">{item.icon}</div>
              <span className="text-[10px] font-medium truncate">{item.label}</span>
            </button>
          ))}
          {/* More button */}
          <button
            onClick={() => setSheetOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-lg transition-smooth min-w-[48px] min-h-[48px] relative ${
              moreIsActive ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <div className="w-5 h-5">
              <svg viewBox="0 0 16 16" fill="currentColor">
                <circle cx="4" cy="8" r="1.5" />
                <circle cx="8" cy="8" r="1.5" />
                <circle cx="12" cy="8" r="1.5" />
              </svg>
            </div>
            <span className="text-[10px] font-medium">More</span>
            {moreIsActive && (
              <span className="absolute top-1.5 right-2.5 w-1.5 h-1.5 rounded-full bg-primary" />
            )}
          </button>
        </div>
      </nav>

      {/* Bottom sheet */}
      <MobileBottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        activeTab={activeTab}
        navigateToPanel={navigateToPanel}
      />
    </>
  )
}

function MobileBottomSheet({ open, onClose, activeTab, navigateToPanel }: {
  open: boolean
  onClose: () => void
  activeTab: string
  navigateToPanel: (tab: string) => void
}) {
  // Track mount state for animation
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      // Mount first, then animate in on next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
    } else {
      setVisible(false)
    }
  }, [open])

  // Handle close with animation
  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 200) // match transition duration
  }

  if (!open) return null

  return (
    <div className="md:hidden fixed inset-0 z-[60]">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl max-h-[70vh] overflow-y-auto safe-area-bottom transition-transform duration-200 ease-out ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Grouped navigation */}
        <div className="px-4 pb-6">
          {navGroups.map((group, groupIndex) => (
            <div key={group.id}>
              {groupIndex > 0 && <div className="my-3 border-t border-border" />}

              {/* Group header */}
              <div className="px-1 pt-1 pb-2">
                <span className="text-[10px] tracking-wider text-muted-foreground/60 font-semibold">
                  {group.label || 'CORE'}
                </span>
              </div>

              {/* 2-column grid */}
              <div className="grid grid-cols-2 gap-1.5">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      navigateToPanel(item.id)
                      handleClose()
                    }}
                    className={`flex items-center gap-2.5 px-3 min-h-[48px] rounded-xl transition-smooth ${
                      activeTab === item.id
                        ? 'bg-primary/15 text-primary'
                        : 'text-foreground hover:bg-secondary'
                    }`}
                  >
                    <div className="w-5 h-5 shrink-0">{item.icon}</div>
                    <span className="text-xs font-medium truncate">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// SVG Icons (16x16 viewbox, stroke-based)
// Each icon is unique and purpose-built for its function.
// Pipeline — funnel shape (prospect flows through stages)
function PipelineIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 2h13l-5 6v5l-3-1.5V8L1.5 2z" />
    </svg>
  )
}

// Roy's Board — kanban columns (distinct column heights make it readable small)
function KanbanIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="4" height="10" rx="1" />
      <rect x="6" y="2" width="4" height="7" rx="1" />
      <rect x="11" y="2" width="4" height="5" rx="1" />
    </svg>
  )
}

// Tasks — clipboard with checkbox (distinct from Pipeline funnel and Kanban columns)
function TasksIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.5 1.5h5a1 1 0 010 2h-5a1 1 0 010-2z" />
      <path d="M3 2.5h-.5A1.5 1.5 0 001 4v9.5A1.5 1.5 0 002.5 15h11A1.5 1.5 0 0015 13.5V4a1.5 1.5 0 00-1.5-1.5H13" />
      <path d="M4.5 8l2 2 4-4" />
    </svg>
  )
}

// Activity — pulse/heartbeat waveform
function ActivityIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1,8 4,8 6,3 8,13 10,6 12,8 15,8" />
    </svg>
  )
}

// Logs — terminal prompt (>_ is universally understood as "console")
function LogsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="14" height="12" rx="1.5" />
      <path d="M4 6l2.5 2.5L4 11" />
      <path d="M9 11h3" />
    </svg>
  )
}

// Cron — clock face with tick marks (scheduling / time-based)
function CronIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 4.5V8l2.5 2.5" />
      <path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1" />
    </svg>
  )
}

// Agents — single person silhouette (unambiguous "agent/user")
function AgentsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="5" r="3" />
      <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    </svg>
  )
}

// Office — building with floors and windows (clearly "office/workspace")
function OfficeIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 14V4l6-2.5L14 4v10" />
      <path d="M1 14h14" />
      <rect x="5" y="6" width="2" height="2" rx="0.3" />
      <rect x="9" y="6" width="2" height="2" rx="0.3" />
      <rect x="5" y="10" width="2" height="2" rx="0.3" />
      <rect x="9" y="10" width="2" height="2" rx="0.3" />
    </svg>
  )
}

// Settings — gear (universal)
function SettingsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.4 1.4M11.55 11.55l1.4 1.4M3.05 12.95l1.4-1.4M11.55 4.45l1.4-1.4" />
    </svg>
  )
}
