import { describe, it, expect } from 'vitest'
import {
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
} from '@/lib/stripe-webhooks'

const PRICE_MAPPING = {
  'price_scout_123': 'scout' as const,
  'price_studio_456': 'studio' as const,
}

describe('stripe-webhooks', () => {
  describe('handleCheckoutCompleted', () => {
    it('creates subscription from checkout session', () => {
      const session = {
        subscription: 'sub_123',
        customer: 'cus_456',
        client_reference_id: 'user_789',
        line_items: {
          data: [{ price: { id: 'price_scout_123' } }],
        },
      }

      const result = handleCheckoutCompleted(session, PRICE_MAPPING)
      expect(result).not.toBeNull()
      expect(result!.tier).toBe('scout')
      expect(result!.status).toBe('active')
      expect(result!.stripeCustomerId).toBe('cus_456')
      expect(result!.stripeSubscriptionId).toBe('sub_123')
      expect(result!.cancelAtPeriodEnd).toBe(false)
    })

    it('returns null if no client_reference_id', () => {
      const session = { subscription: 'sub_123', customer: 'cus_456' }
      expect(handleCheckoutCompleted(session, PRICE_MAPPING)).toBeNull()
    })

    it('defaults to scout for unknown price ID', () => {
      const session = {
        subscription: 'sub_123',
        customer: 'cus_456',
        client_reference_id: 'user_789',
        line_items: { data: [{ price: { id: 'price_unknown' } }] },
      }
      const result = handleCheckoutCompleted(session, PRICE_MAPPING)
      expect(result!.tier).toBe('scout')
    })
  })

  describe('handleSubscriptionUpdated', () => {
    it('maps active status correctly', () => {
      const sub = {
        status: 'active',
        cancel_at_period_end: false,
        current_period_end: 1735689600, // 2025-01-01
        items: { data: [{ price: { id: 'price_studio_456' } }] },
      }
      const result = handleSubscriptionUpdated(sub, PRICE_MAPPING)
      expect(result).not.toBeNull()
      expect(result!.status).toBe('active')
      expect(result!.tier).toBe('studio')
      expect(result!.cancelAtPeriodEnd).toBe(false)
      expect(result!.currentPeriodEnd).toBeInstanceOf(Date)
    })

    it('maps trialing status', () => {
      const sub = {
        status: 'trialing',
        cancel_at_period_end: false,
        current_period_end: 1735689600,
      }
      const result = handleSubscriptionUpdated(sub, PRICE_MAPPING)
      expect(result!.status).toBe('trialing')
    })

    it('maps past_due status', () => {
      const sub = {
        status: 'past_due',
        cancel_at_period_end: false,
        current_period_end: 1735689600,
      }
      const result = handleSubscriptionUpdated(sub, PRICE_MAPPING)
      expect(result!.status).toBe('past_due')
    })

    it('handles cancel_at_period_end', () => {
      const sub = {
        status: 'active',
        cancel_at_period_end: true,
        current_period_end: 1735689600,
      }
      const result = handleSubscriptionUpdated(sub, PRICE_MAPPING)
      expect(result!.cancelAtPeriodEnd).toBe(true)
    })
  })

  describe('handleSubscriptionDeleted', () => {
    it('resets to free tier', () => {
      const result = handleSubscriptionDeleted()
      expect(result.tier).toBe('free')
      expect(result.status).toBe('canceled')
      expect(result.stripeSubscriptionId).toBeNull()
      expect(result.cancelAtPeriodEnd).toBe(false)
      expect(result.currentPeriodEnd).toBeNull()
    })
  })
})
