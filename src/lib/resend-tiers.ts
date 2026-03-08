export const RESEND_TIER_THRESHOLDS = {
  // A contact is HOT if they clicked any link
  hot:  { clicks: 1 },
  // WARM = opened 2+ times with no click
  warm: { opens: 2, clicks: 0 },
  // MILD = opened exactly 1 time with no click
  mild: { opens: 1, clicks: 0 },
  // COLD = delivered but no opens
  cold: { opens: 0 },
} as const

export type WarmthTier = 'hot' | 'warm' | 'mild' | 'cold'

export function classifyTier(opens: number, clicks: number): WarmthTier {
  if (clicks >= RESEND_TIER_THRESHOLDS.hot.clicks) return 'hot'
  if (opens >= RESEND_TIER_THRESHOLDS.warm.opens)  return 'warm'
  if (opens >= RESEND_TIER_THRESHOLDS.mild.opens)  return 'mild'
  return 'cold'
}

export const TIER_LABELS: Record<WarmthTier, { emoji: string; label: string; hint: string }> = {
  hot:  { emoji: '🔥', label: 'Hot',  hint: 'clicked link' },
  warm: { emoji: '♨️', label: 'Warm', hint: '2+ opens, no click' },
  mild: { emoji: '🌡️', label: 'Mild', hint: '1 open, no click' },
  cold: { emoji: '❄️', label: 'Cold', hint: 'no opens' },
}
