import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'nomli_dm_awaiting_v1:';

function key(viewerId: string, partnerId: string) {
  return `${PREFIX}${viewerId}:${partnerId}`;
}

/** Client remembers cold-DM “wait for reply” when Supabase dm_initiations isn’t migrated or sync lags. */
export async function setDmAwaitingReciprocity(viewerId: string, partnerId: string): Promise<void> {
  if (!viewerId || !partnerId) return;
  await AsyncStorage.setItem(key(viewerId, partnerId), '1');
}

export async function clearDmAwaitingReciprocity(viewerId: string, partnerId: string): Promise<void> {
  if (!viewerId || !partnerId) return;
  await AsyncStorage.removeItem(key(viewerId, partnerId));
}

export async function getDmAwaitingReciprocity(viewerId: string, partnerId: string): Promise<boolean> {
  if (!viewerId || !partnerId) return false;
  const v = await AsyncStorage.getItem(key(viewerId, partnerId));
  return v === '1';
}
