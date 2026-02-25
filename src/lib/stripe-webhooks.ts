/**
 * Stripe webhook handler stubs.
 *
 * In production, these run server-side (Firebase Functions, Cloudflare Workers, etc.)
 * handling POST /api/subscriptions/webhook.
 *
 * This file documents the expected webhook events and their handling logic.
 * The actual server implementation will import this logic or replicate it.
 */

import type { UserSubscription, SubscriptionTier } from '@/types/subscription'

/** Map Stripe price IDs to subscription tiers */
interface PriceMapping {
  [priceId: string]: SubscriptionTier
}

/**
 * Server-side webhook handler pseudocode.
 *
 * Expects events:
 *   - checkout.session.completed   → New subscription
 *   - customer.subscription.updated → Plan change, renewal, payment failure
 *   - customer.subscription.deleted → Cancellation
 *   - invoice.payment_succeeded    → Successful payment
 *   - invoice.payment_failed       → Failed payment
 */
export interface WebhookEvent {
  type: string
  data: {
    object: Record<string, unknown>
  }
}

/** Process a checkout.session.completed event */
export function handleCheckoutCompleted(
  session: Record<string, unknown>,
  priceMapping: PriceMapping
): Partial<UserSubscription> | null {
  const subscriptionId = session.subscription as string
  const customerId = session.customer as string
  const clientReferenceId = session.client_reference_id as string // user UID

  if (!clientReferenceId || !subscriptionId) return null

  // In production, fetch subscription details from Stripe to get price info
  // For now, extract from line items
  const lineItems = session.line_items as { data?: Array<{ price?: { id: string } }> } | undefined
  const priceId = lineItems?.data?.[0]?.price?.id
  const tier = priceId ? priceMapping[priceId] || 'scout' : 'scout'

  return {
    tier,
    status: 'active',
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    cancelAtPeriodEnd: false,
  }
}

/** Process a customer.subscription.updated event */
export function handleSubscriptionUpdated(
  subscription: Record<string, unknown>,
  priceMapping: PriceMapping
): Partial<UserSubscription> | null {
  const status = subscription.status as string
  const cancelAtPeriodEnd = subscription.cancel_at_period_end as boolean
  const currentPeriodEnd = subscription.current_period_end as number
  const items = subscription.items as { data?: Array<{ price?: { id: string } }> } | undefined
  const priceId = items?.data?.[0]?.price?.id
  const tier = priceId ? priceMapping[priceId] : undefined

  const mapped: Partial<UserSubscription> = {
    status: mapStripeStatus(status),
    cancelAtPeriodEnd: cancelAtPeriodEnd || false,
    currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
  }

  if (tier) mapped.tier = tier

  return mapped
}

/** Process a customer.subscription.deleted event */
export function handleSubscriptionDeleted(): Partial<UserSubscription> {
  return {
    tier: 'free',
    status: 'canceled',
    stripeSubscriptionId: null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
  }
}

function mapStripeStatus(
  stripeStatus: string
): UserSubscription['status'] {
  switch (stripeStatus) {
    case 'active':
      return 'active'
    case 'trialing':
      return 'trialing'
    case 'past_due':
      return 'past_due'
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'canceled'
    default:
      return 'active'
  }
}
