import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  fetchCreatorMonetizationSnapshot,
  getActiveCreatorProPlan,
  getCreatorProAnnualPlan,
  isCreatorProActive,
  startCreatorProCheckout,
  type CreatorMonetizationSnapshot,
} from '../utils/creatorMonetizationService';
import type { PaymentPlan } from '../utils/stripeService';

export function useCreatorMonetization() {
  const [snapshot, setSnapshot] = useState<CreatorMonetizationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [creatorPlan, setCreatorPlan] = useState<PaymentPlan | null>(null);
  const [creatorAnnualPlan, setCreatorAnnualPlan] = useState<PaymentPlan | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const s = await fetchCreatorMonetizationSnapshot();
    setSnapshot(s);
    setLoading(false);
    return s;
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
    async (maxAttempts = 8) => {
      let last = await load();
      for (let i = 0; i < maxAttempts - 1; i++) {
        const active = !!last?.creator_pro_active || isCreatorProActive(last?.creator_pro_until);
        if (active) break;
        await new Promise((r) => setTimeout(r, 450 + i * 350));
        last = await load();
      }
      return last;
    },
    [load]
  );

  return {
    snapshot,
    loading,
    checkoutLoading,
    creatorPlan,
    creatorAnnualPlan,
    refetch: load,
    refetchUntilProVisible,
    subscribeCreatorPro,
  };
}
