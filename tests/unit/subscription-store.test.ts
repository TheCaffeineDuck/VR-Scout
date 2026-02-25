import { describe, it, expect, beforeEach } from 'vitest'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { DEFAULT_SUBSCRIPTION, TIERS } from '@/types/subscription'

describe('subscription-store', () => {
  beforeEach(() => {
    localStorage.clear()
    useSubscriptionStore.setState({
      subscription: DEFAULT_SUBSCRIPTION,
      loading: false,
    })
  })

  it('has free tier as default', () => {
    const { subscription } = useSubscriptionStore.getState()
    expect(subscription.tier).toBe('free')
    expect(subscription.status).toBe('none')
  })

  it('gets correct tier config', () => {
    const config = useSubscriptionStore.getState().getTierConfig()
    expect(config.name).toBe('Free')
    expect(config.price).toBe(0)
  })

  describe('hasFeature', () => {
    it('free tier has access to free features', () => {
      expect(useSubscriptionStore.getState().hasFeature('free')).toBe(true)
    })

    it('free tier does not have scout features', () => {
      expect(useSubscriptionStore.getState().hasFeature('scout')).toBe(false)
    })

    it('scout tier has access to free and scout features', () => {
      useSubscriptionStore.getState().setSubscription({ tier: 'scout', status: 'active' })
      expect(useSubscriptionStore.getState().hasFeature('free')).toBe(true)
      expect(useSubscriptionStore.getState().hasFeature('scout')).toBe(true)
      expect(useSubscriptionStore.getState().hasFeature('studio')).toBe(false)
    })

    it('studio tier has access to all features', () => {
      useSubscriptionStore.getState().setSubscription({ tier: 'studio', status: 'active' })
      expect(useSubscriptionStore.getState().hasFeature('free')).toBe(true)
      expect(useSubscriptionStore.getState().hasFeature('scout')).toBe(true)
      expect(useSubscriptionStore.getState().hasFeature('studio')).toBe(true)
    })
  })

  describe('withinLimit', () => {
    it('free tier limits tours to 1', () => {
      expect(useSubscriptionStore.getState().withinLimit('tours', 0)).toBe(true)
      expect(useSubscriptionStore.getState().withinLimit('tours', 1)).toBe(false)
    })

    it('scout tier allows up to 10 tours', () => {
      useSubscriptionStore.getState().setSubscription({ tier: 'scout' })
      expect(useSubscriptionStore.getState().withinLimit('tours', 5)).toBe(true)
      expect(useSubscriptionStore.getState().withinLimit('tours', 10)).toBe(false)
    })

    it('studio tier has unlimited tours', () => {
      useSubscriptionStore.getState().setSubscription({ tier: 'studio' })
      expect(useSubscriptionStore.getState().withinLimit('tours', 1000)).toBe(true)
    })

    it('free tier limits screenshots to 3', () => {
      expect(useSubscriptionStore.getState().withinLimit('screenshots', 2)).toBe(true)
      expect(useSubscriptionStore.getState().withinLimit('screenshots', 3)).toBe(false)
    })
  })

  describe('setSubscription', () => {
    it('partially updates subscription', () => {
      useSubscriptionStore.getState().setSubscription({
        tier: 'scout',
        status: 'active',
        stripeCustomerId: 'cus_123',
      })
      const { subscription } = useSubscriptionStore.getState()
      expect(subscription.tier).toBe('scout')
      expect(subscription.status).toBe('active')
      expect(subscription.stripeCustomerId).toBe('cus_123')
      // Defaults preserved
      expect(subscription.stripeSubscriptionId).toBeNull()
    })
  })
})

describe('TIERS', () => {
  it('has three tiers defined', () => {
    expect(Object.keys(TIERS)).toEqual(['free', 'scout', 'studio'])
  })

  it('free tier costs $0', () => {
    expect(TIERS.free.price).toBe(0)
  })

  it('scout tier costs $29', () => {
    expect(TIERS.scout.price).toBe(29)
  })

  it('studio tier costs $99', () => {
    expect(TIERS.studio.price).toBe(99)
  })

  it('each tier has features listed', () => {
    for (const tier of Object.values(TIERS)) {
      expect(tier.features.length).toBeGreaterThan(0)
    }
  })

  it('studio has at least as many features as scout', () => {
    expect(TIERS.studio.features.length).toBeGreaterThanOrEqual(TIERS.scout.features.length)
  })
})
