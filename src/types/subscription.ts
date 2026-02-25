export type SubscriptionTier = 'free' | 'scout' | 'studio'

export interface TierConfig {
  tier: SubscriptionTier
  name: string
  price: number // monthly USD
  features: string[]
  limits: {
    tours: number
    collaborators: number
    storageGb: number
    screenshots: number
    annotations: number
  }
}

export const TIERS: Record<SubscriptionTier, TierConfig> = {
  free: {
    tier: 'free',
    name: 'Free',
    price: 0,
    features: [
      'View shared tours',
      'Basic navigation',
      'Up to 3 screenshots per tour',
      '5 annotations per tour',
    ],
    limits: {
      tours: 1,
      collaborators: 0,
      storageGb: 0.5,
      screenshots: 3,
      annotations: 5,
    },
  },
  scout: {
    tier: 'scout',
    name: 'Scout',
    price: 29,
    features: [
      'Up to 10 tours',
      'All measurement tools',
      'Unlimited screenshots',
      'Unlimited annotations',
      'Sun path simulator',
      'Virtual cameras',
      'Floor plan overlay',
    ],
    limits: {
      tours: 10,
      collaborators: 3,
      storageGb: 10,
      screenshots: Infinity,
      annotations: Infinity,
    },
  },
  studio: {
    tier: 'studio',
    name: 'Studio',
    price: 99,
    features: [
      'Unlimited tours',
      'All Scout features',
      'Real-time collaboration',
      'Spatial voice chat',
      'Priority support',
      'Custom branding',
      'API access',
    ],
    limits: {
      tours: Infinity,
      collaborators: 25,
      storageGb: 100,
      screenshots: Infinity,
      annotations: Infinity,
    },
  },
}

export interface UserSubscription {
  tier: SubscriptionTier
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'none'
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
}

export const DEFAULT_SUBSCRIPTION: UserSubscription = {
  tier: 'free',
  status: 'none',
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
}
