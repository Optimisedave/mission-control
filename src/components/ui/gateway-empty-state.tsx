'use client'

import { useMissionControl } from '@/store'

interface GatewayEmptyStateProps {
  panel?: string
  description?: string
}

/**
 * Shows a "no gateway connection" placeholder when the app is in full mode
 * but no gateway is connected. Drop this into any gateway-dependent panel.
 *
 * Usage:
 *   const gatewayClosed = useGatewayRequired()
 *   if (gatewayClosed) return <GatewayEmptyState panel="Sessions" />
 */
export function useGatewayRequired() {
  const { dashboardMode, connection } = useMissionControl()
  return dashboardMode !== 'local' && !connection.isConnected
}

export function GatewayEmptyState({ panel, description }: GatewayEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[180px] sm:min-h-[300px] gap-3 sm:gap-4 text-center px-4 sm:px-8 py-6 sm:py-0">
      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-secondary flex items-center justify-center shrink-0">
        <svg
          className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
          />
        </svg>
      </div>
      <div className="max-w-[280px] sm:max-w-none">
        <p className="font-medium text-sm sm:text-base text-foreground">
          {panel ? `${panel} requires a gateway connection` : 'Gateway not connected'}
        </p>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          {description ??
            'Connect an OpenClaw gateway in the Gateways panel to see live data here.'}
        </p>
      </div>
    </div>
  )
}
