import { useSubscriptionStore } from '@/stores/subscription-store'
import type { SubscriptionTier, TierConfig } from '@/types/subscription'

interface FeatureGate {
  /** Current tier config */
  tier: TierConfig
  /** Whether user has at least the required tier */
  hasAccess: (requiredTier: SubscriptionTier) => boolean
  /** Whether user is within the given limit */
  withinLimit: (limitKey: keyof TierConfig['limits'], currentCount: number) => boolean
  /** Whether collaboration features are available (studio only) */
  canCollaborate: boolean
  /** Whether measurement/annotation tools are available (scout+) */
  hasProTools: boolean
  /** Whether the subscription is active */
  isActive: boolean
}

export function useFeatureGate(): FeatureGate {
  const subscription = useSubscriptionStore((s) => s.subscription)
  const getTierConfig = useSubscriptionStore((s) => s.getTierConfig)
  const hasFeature = useSubscriptionStore((s) => s.hasFeature)
  const withinLimit = useSubscriptionStore((s) => s.withinLimit)

  const tier = getTierConfig()
  const isActive = subscription.status === 'active' ||
    subscription.status === 'trialing' ||
    subscription.tier === 'free'

  return {
    tier,
    hasAccess: hasFeature,
    withinLimit,
    canCollaborate: hasFeature('studio'),
    hasProTools: hasFeature('scout'),
    isActive,
  }
}
