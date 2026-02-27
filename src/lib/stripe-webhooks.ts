// TODO: Move this entire file to server/functions/ — this logic should not
// ship in the client bundle. It documents the expected webhook handling that
// the server implementation must perform.

/**
 * Stripe webhook handler stubs.
 *
 * In production, these run server-side (Firebase Functions, Cloudflare Workers, etc.)
 * handling POST /api/subscriptions/webhook.
 *
 * The server MUST verify the webhook signature before processing events:
 *   const event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
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
 * IMPORTANT: The server handler MUST verify the Stripe signature:
 *   const event = stripe.webhooks.constructEvent(rawBody, req.headers['stripe-signature'], webhookSecret)
 *   If verification fails, return 400 immediately.
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

// ---- Runtime validation helpers ----

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

interface ValidatedCheckoutFields {
  subscriptionId: string
  customerId: string
  clientReferenceId: string
  priceId: string | null
}

function validateCheckoutSession(
  session: Record<string, unknown>
): ValidatedCheckoutFields | null {
  const subscriptionId = session.subscription
  const customerId = session.customer
  const clientReferenceId = session.client_reference_id

  if (!isNonEmptyString(subscriptionId)) return null
  if (!isNonEmptyString(customerId)) return null
  if (!isNonEmptyString(clientReferenceId)) return null

  // Extract price ID from line items (optional — may not be present)
  let priceId: string | null = null
  const lineItems = session.line_items
  if (
    lineItems &&
    typeof lineItems === 'object' &&
    'data' in lineItems &&
    Array.isArray((lineItems as { data?: unknown }).data)
  ) {
    const items = (lineItems as { data: Array<Record<string, unknown>> }).data
    const firstPrice = items[0]?.price
    if (firstPrice && typeof firstPrice === 'object' && 'id' in firstPrice) {
      const id = (firstPrice as { id: unknown }).id
      if (isNonEmptyString(id)) priceId = id
    }
  }

  return { subscriptionId, customerId, clientReferenceId, priceId }
}

interface ValidatedSubscriptionFields {
  status: string
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: number | null
  priceId: string | null
}

function validateSubscriptionUpdate(
  subscription: Record<string, unknown>
): ValidatedSubscriptionFields | null {
  const status = subscription.status
  if (!isNonEmptyString(status)) return null

  const cancelAtPeriodEnd = subscription.cancel_at_period_end
  const currentPeriodEnd = subscription.current_period_end

  let priceId: string | null = null
  const items = subscription.items
  if (
    items &&
    typeof items === 'object' &&
    'data' in items &&
    Array.isArray((items as { data?: unknown }).data)
  ) {
    const data = (items as { data: Array<Record<string, unknown>> }).data
    const firstPrice = data[0]?.price
    if (firstPrice && typeof firstPrice === 'object' && 'id' in firstPrice) {
      const id = (firstPrice as { id: unknown }).id
      if (isNonEmptyString(id)) priceId = id
    }
  }

  return {
    status,
    cancelAtPeriodEnd: isBoolean(cancelAtPeriodEnd) ? cancelAtPeriodEnd : false,
    currentPeriodEnd: isNumber(currentPeriodEnd) ? currentPeriodEnd : null,
    priceId,
  }
}

/** Process a checkout.session.completed event */
export function handleCheckoutCompleted(
  session: Record<string, unknown>,
  priceMapping: PriceMapping
): Partial<UserSubscription> | null {
  const validated = validateCheckoutSession(session)
  if (!validated) return null

  const { subscriptionId, customerId, clientReferenceId, priceId } = validated
  const tier = priceId ? priceMapping[priceId] || 'scout' : 'scout'

  // clientReferenceId is used by the server to identify which user document to update
  void clientReferenceId

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
  const validated = validateSubscriptionUpdate(subscription)
  if (!validated) return null

  const { status, cancelAtPeriodEnd, currentPeriodEnd, priceId } = validated
  const tier = priceId ? priceMapping[priceId] : undefined

  const mapped: Partial<UserSubscription> = {
    status: mapStripeStatus(status),
    cancelAtPeriodEnd,
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
      console.warn(`[Stripe] Unknown subscription status: "${stripeStatus}" — defaulting to "canceled"`)
      return 'canceled'
  }
}
