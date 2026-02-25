/**
 * Stripe integration with conditional initialization.
 * Falls back to informational UI when keys are missing.
 */

import type { SubscriptionTier } from '@/types/subscription'

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
const PRICE_IDS: Record<Exclude<SubscriptionTier, 'free'>, string | undefined> = {
  scout: import.meta.env.VITE_STRIPE_PRICE_SCOUT,
  studio: import.meta.env.VITE_STRIPE_PRICE_STUDIO,
}

function isKeyValid(key: string | undefined): boolean {
  return Boolean(key && !key.includes('your-') && key.startsWith('pk_'))
}

export function isStripeAvailable(): boolean {
  return isKeyValid(STRIPE_PUBLISHABLE_KEY)
}

export function getPriceId(tier: Exclude<SubscriptionTier, 'free'>): string | null {
  const id = PRICE_IDS[tier]
  return id && !id.includes('your-') ? id : null
}

let stripePromise: Promise<unknown> | null = null

/**
 * Lazy-load Stripe.js only when needed.
 * Returns null if Stripe is not configured.
 */
export async function getStripe(): Promise<unknown> {
  if (!isStripeAvailable()) return null
  if (!stripePromise) {
    stripePromise = import('@stripe/stripe-js').then((mod) =>
      mod.loadStripe(STRIPE_PUBLISHABLE_KEY!)
    )
  }
  return stripePromise
}

/**
 * Create a Stripe Checkout session.
 * In production, this calls your server endpoint.
 * Returns the checkout URL to redirect to.
 */
export async function createCheckoutSession(params: {
  tier: Exclude<SubscriptionTier, 'free'>
  userId: string
  email: string | null
  successUrl: string
  cancelUrl: string
}): Promise<{ url: string } | { error: string }> {
  if (!isStripeAvailable()) {
    return { error: 'Stripe is not configured. Set VITE_STRIPE_PUBLISHABLE_KEY in your environment.' }
  }

  const priceId = getPriceId(params.tier)
  if (!priceId) {
    return { error: `No price ID configured for ${params.tier} tier.` }
  }

  // In production, this would call: POST /api/subscriptions/create-checkout
  // For now, we'll attempt to use Stripe Checkout directly via the client
  try {
    const stripe = await getStripe() as { redirectToCheckout?: (opts: Record<string, unknown>) => Promise<{ error?: { message: string } }> } | null
    if (!stripe || !stripe.redirectToCheckout) {
      return { error: 'Failed to load Stripe.js' }
    }

    const result = await stripe.redirectToCheckout({
      lineItems: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
      customerEmail: params.email || undefined,
      clientReferenceId: params.userId,
    })

    if (result.error) {
      return { error: result.error.message }
    }
    // redirectToCheckout navigates away, so this won't be reached on success
    return { url: '' }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed'
    return { error: message }
  }
}

/**
 * Open a Stripe Customer Portal session for managing subscriptions.
 * In production, calls: POST /api/subscriptions/portal
 */
export async function openCustomerPortal(_customerId: string): Promise<{ url: string } | { error: string }> {
  if (!isStripeAvailable()) {
    return { error: 'Stripe is not configured.' }
  }
  // In production, call server to create portal session
  // The server would use stripe.billingPortal.sessions.create()
  return { error: 'Customer portal requires a server endpoint. Implement POST /api/subscriptions/portal.' }
}
