import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  fetchCreatorMonetizationSnapshot,
  fetchProfileCreatorProUntil,
  getActiveCreatorProPlan,
  getCreatorProAnnualPlan,
  hasCreatorProAccess,
  mergeCreatorSnapshotWithProfile,
  startCreatorProCheckout,
  type CreatorMonetizationSnapshot,
} from '../utils/creatorMonetizationService';
import type { PaymentPlan } from '../utils/stripeService';

export function useCreatorMonetization() {
  const [snapshot, setSnapshot] = useState<CreatorMonetizationSnapshot | null>(null);
  const [profileCreatorProUntil, setProfileCreatorProUntil] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [creatorPlan, setCreatorPlan] = useState<PaymentPlan | null>(null);
  const [creatorAnnualPlan, setCreatorAnnualPlan] = useState<PaymentPlan | null>(null);

  const load = useCallback(async (): Promise<CreatorMonetizationSnapshot | null> => {
    setLoading(true);
    try {
      const [s, untilProf] = await Promise.all([
        fetchCreatorMonetizationSnapshot(),
        fetchProfileCreatorProUntil(),
      ]);
      setProfileCreatorProUntil(untilProf);
      const merged = mergeCreatorSnapshotWithProfile(s, untilProf);
      const next = merged ?? s;
      setSnapshot(next);

      // RevenueCat may be ahead of `profiles` / snapshot RPC; opening paywall used to be the only implicit sync.
      void import('../utils/revenueCatService').then(({ maybeSyncCreatorProBackendThrottled }) => {
        void (async () => {
          const { ran, ok } = await maybeSyncCreatorProBackendThrottled();
          if (!ran || !ok) return;
          const [s2, until2] = await Promise.all([
            fetchCreatorMonetizationSnapshot(),
            fetchProfileCreatorProUntil(),
          ]);
          setProfileCreatorProUntil(until2);
          setSnapshot((prev) => {
            const fromRpc = mergeCreatorSnapshotWithProfile(s2, until2);
            if (fromRpc) return fromRpc;
            return mergeCreatorSnapshotWithProfile(prev, until2) ?? prev;
          });
        })();
      });

      return next;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getActiveCreatorProPlan().then(setCreatorPlan);
    getCreatorProAnnualPlan().then(setCreatorAnnualPlan);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const ids = [
      creatorPlan?.iap_product_id_apple,
      creatorAnnualPlan?.iap_product_id_apple,
    ].filter(Boolean) as string[];
    if (!ids.length) return;
    import('../utils/storeKitService').then(({ addIapProductIdsForFetching }) => {
      addIapProductIdsForFetching(ids);
    });
  }, [creatorPlan, creatorAnnualPlan]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const subscribeCreatorPro = useCallback(async (period: 'monthly' | 'yearly' = 'monthly') => {
    setCheckoutLoading(true);
    try {
      return await startCreatorProCheckout(period);
    } finally {
      setCheckoutLoading(false);
    }
  }, []);

  /** After IAP / web checkout, DB can lag briefly; poll until Pro is visible or attempts exhausted. */
  const refetchUntilProVisible = useCallback(
    async (maxAttempts = 15) => {
      let last: CreatorMonetizationSnapshot | null = null;
      let untilProf: string | null = null;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        last = await load();
        untilProf = await fetchProfileCreatorProUntil();
        setProfileCreatorProUntil(untilProf);
        if (hasCreatorProAccess(last, untilProf)) {
          return { snapshot: last, profileUntil: untilProf, visible: true as const };
        }
        await new Promise((r) => setTimeout(r, 500 + attempt * 400));
      }
      const visible = hasCreatorProAccess(last, untilProf);
      return { snapshot: last, profileUntil: untilProf, visible };
    },
    [load]
  );

  return {
    snapshot,
    profileCreatorProUntil,
    loading,
    checkoutLoading,
    creatorPlan,
    creatorAnnualPlan,
    refetch: load,
    refetchUntilProVisible,
    subscribeCreatorPro,
  };
}
