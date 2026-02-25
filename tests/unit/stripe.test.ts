import { describe, it, expect } from 'vitest'
import { isStripeAvailable, getPriceId } from '@/lib/stripe'

describe('stripe', () => {
  describe('isStripeAvailable', () => {
    it('returns false when no key is set (env has placeholder)', () => {
      // In test environment, env vars aren't set with real Stripe keys
      expect(isStripeAvailable()).toBe(false)
    })
  })

  describe('getPriceId', () => {
    it('returns null for scout when env has placeholder', () => {
      expect(getPriceId('scout')).toBeNull()
    })

    it('returns null for studio when env has placeholder', () => {
      expect(getPriceId('studio')).toBeNull()
    })
  })
})
