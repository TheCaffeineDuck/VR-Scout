import { create } from 'zustand'
import type { SubscriptionTier, UserSubscription, TierConfig } from '@/types/subscription'
import { DEFAULT_SUBSCRIPTION, TIERS } from '@/types/subscription'
import { isFirebaseAvailable, db } from '@/lib/firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { localGet, localSet } from '@/lib/local-persistence'

interface SubscriptionState {
  subscription: UserSubscription
  loading: boolean

  /** Load subscription for the given user */
  loadSubscription: (uid: string) => Promise<void>
  /** Update subscription locally (called from webhook or manual) */
  setSubscription: (sub: Partial<UserSubscription>) => void
  /** Get the current tier config */
  getTierConfig: () => TierConfig
  /** Check if a feature is available at the current tier */
  hasFeature: (requiredTier: SubscriptionTier) => boolean
  /** Check if a limit allows the given count */
  withinLimit: (limitKey: keyof TierConfig['limits'], currentCount: number) => boolean
}

const TIER_ORDER: SubscriptionTier[] = ['free', 'scout', 'studio']

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  subscription: DEFAULT_SUBSCRIPTION,
  loading: false,

  loadSubscription: async (uid: string) => {
    set({ loading: true })

    if (isFirebaseAvailable() && db) {
      try {
        const docRef = doc(db, 'user_subscriptions', uid)
        const snap = await getDoc(docRef)
        if (snap.exists()) {
          const data = snap.data()
          set({
            subscription: {
              tier: data.tier || 'free',
              status: data.status || 'none',
              stripeCustomerId: data.stripeCustomerId || null,
              stripeSubscriptionId: data.stripeSubscriptionId || null,
              currentPeriodEnd: data.currentPeriodEnd?.toDate?.() || null,
              cancelAtPeriodEnd: data.cancelAtPeriodEnd || false,
            },
            loading: false,
          })
          return
        }
      } catch (err) {
        console.warn('[Subscription] Failed to load from Firestore:', err)
      }
    }

    // Local fallback
    const local = localGet<UserSubscription>('subscription', uid)
    set({
      subscription: local || DEFAULT_SUBSCRIPTION,
      loading: false,
    })
  },

  setSubscription: (partial) => {
    set((state) => ({
      subscription: { ...state.subscription, ...partial },
    }))
  },

  getTierConfig: () => {
    return TIERS[get().subscription.tier]
  },

  hasFeature: (requiredTier: SubscriptionTier) => {
    const currentIndex = TIER_ORDER.indexOf(get().subscription.tier)
    const requiredIndex = TIER_ORDER.indexOf(requiredTier)
    return currentIndex >= requiredIndex
  },

  withinLimit: (limitKey, currentCount) => {
    const config = get().getTierConfig()
    const limit = config.limits[limitKey]
    return limit === Infinity || currentCount < limit
  },
}))

/** Persist subscription to Firestore or localStorage */
export async function persistSubscription(uid: string, sub: UserSubscription): Promise<void> {
  if (isFirebaseAvailable() && db) {
    try {
      await setDoc(doc(db, 'user_subscriptions', uid), {
        ...sub,
        currentPeriodEnd: sub.currentPeriodEnd || null,
      })
      return
    } catch (err) {
      console.warn('[Subscription] Failed to persist to Firestore:', err)
    }
  }
  localSet('subscription', uid, sub)
}
