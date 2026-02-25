import { useState } from 'react'
import { TIERS, type SubscriptionTier } from '@/types/subscription'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useAuthContext } from '@/hooks/useAuthContext'
import { isStripeAvailable, createCheckoutSession } from '@/lib/stripe'

interface SubscriptionPanelProps {
  onClose: () => void
}

const TIER_ORDER: SubscriptionTier[] = ['free', 'scout', 'studio']

export function SubscriptionPanel({ onClose }: SubscriptionPanelProps) {
  const { user } = useAuthContext()
  const subscription = useSubscriptionStore((s) => s.subscription)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [loadingTier, setLoadingTier] = useState<SubscriptionTier | null>(null)
  const stripeReady = isStripeAvailable()

  async function handleSubscribe(tier: Exclude<SubscriptionTier, 'free'>) {
    setCheckoutError(null)
    setLoadingTier(tier)

    const result = await createCheckoutSession({
      tier,
      userId: user.uid,
      email: user.email,
      successUrl: `${window.location.origin}?subscription=success`,
      cancelUrl: `${window.location.origin}?subscription=canceled`,
    })

    if ('error' in result) {
      setCheckoutError(result.error)
    }
    setLoadingTier(null)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-white">Subscription Plans</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {subscription.tier === 'free'
                ? 'Choose a plan to unlock all features'
                : `Current plan: ${TIERS[subscription.tier].name}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg leading-none px-1"
          >
            &times;
          </button>
        </div>

        {/* Stripe status */}
        {!stripeReady && (
          <div className="mx-4 mt-4 bg-amber-900/30 border border-amber-700/50 rounded-lg p-3 text-xs text-amber-300">
            Stripe is not configured. Plans are shown for reference only.
            Set <code className="bg-amber-900/50 px-1 rounded">VITE_STRIPE_PUBLISHABLE_KEY</code> to enable checkout.
          </div>
        )}

        {/* Error */}
        {checkoutError && (
          <div className="mx-4 mt-4 bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-xs text-red-300">
            {checkoutError}
          </div>
        )}

        {/* Pricing cards */}
        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {TIER_ORDER.map((tierKey) => {
            const config = TIERS[tierKey]
            const isCurrent = subscription.tier === tierKey
            const isUpgrade = TIER_ORDER.indexOf(tierKey) > TIER_ORDER.indexOf(subscription.tier)

            return (
              <div
                key={tierKey}
                className={`rounded-xl border p-4 flex flex-col ${
                  isCurrent
                    ? 'border-indigo-500 bg-indigo-950/30'
                    : 'border-gray-700 bg-gray-800/50'
                }`}
              >
                {/* Tier name & price */}
                <div className="mb-3">
                  <h3 className="text-base font-bold text-white">{config.name}</h3>
                  <div className="mt-1">
                    {config.price === 0 ? (
                      <span className="text-2xl font-bold text-white">Free</span>
                    ) : (
                      <>
                        <span className="text-2xl font-bold text-white">${config.price}</span>
                        <span className="text-xs text-gray-400">/month</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Features list */}
                <ul className="flex-1 space-y-1.5 mb-4">
                  {config.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-1.5 text-xs text-gray-300">
                      <span className="text-green-400 mt-0.5 shrink-0">&#10003;</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* Limits */}
                <div className="border-t border-gray-700 pt-3 mb-4 space-y-1 text-xs text-gray-500">
                  <div>Tours: {config.limits.tours === Infinity ? 'Unlimited' : config.limits.tours}</div>
                  <div>Collaborators: {config.limits.collaborators === 0 ? 'None' : config.limits.collaborators === Infinity ? 'Unlimited' : config.limits.collaborators}</div>
                  <div>Storage: {config.limits.storageGb >= 100 ? `${config.limits.storageGb} GB` : `${config.limits.storageGb} GB`}</div>
                </div>

                {/* Action button */}
                {isCurrent ? (
                  <div className="text-center text-xs text-indigo-400 font-medium py-2">
                    Current Plan
                  </div>
                ) : isUpgrade && tierKey !== 'free' ? (
                  <button
                    onClick={() => handleSubscribe(tierKey as Exclude<SubscriptionTier, 'free'>)}
                    disabled={!stripeReady || loadingTier !== null}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white py-2 rounded-lg font-medium text-sm transition-colors"
                  >
                    {loadingTier === tierKey
                      ? 'Redirecting...'
                      : stripeReady
                        ? `Upgrade to ${config.name}`
                        : `${config.name} — $${config.price}/mo`}
                  </button>
                ) : (
                  <div className="text-center text-xs text-gray-500 py-2">
                    {tierKey === 'free' ? 'Included' : ''}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Subscription status */}
        {subscription.tier !== 'free' && (
          <div className="px-4 pb-4">
            <div className="bg-gray-800 rounded-lg p-3 text-xs text-gray-400 space-y-1">
              <div>Status: <span className="text-white capitalize">{subscription.status}</span></div>
              {subscription.currentPeriodEnd && (
                <div>
                  {subscription.cancelAtPeriodEnd ? 'Cancels' : 'Renews'}:{' '}
                  <span className="text-white">
                    {subscription.currentPeriodEnd.toLocaleDateString()}
                  </span>
                </div>
              )}
              {subscription.stripeSubscriptionId && stripeReady && (
                <button className="text-indigo-400 hover:text-indigo-300 mt-1 underline">
                  Manage subscription
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
