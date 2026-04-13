import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';

/**
 * Redirect /wallet to the tab-based wallet so the bottom tabs remain visible.
 */
export default function WalletRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/(tabs)/wallet');
  }, [router]);
  return null;
}
