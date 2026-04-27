import AsyncStorage from '@react-native-async-storage/async-storage';
import { log, warn, error } from './productionLogger';


const COINS_KEY = 'user_virtual_coins';
const DEFAULT_COINS = 1000;

export interface VirtualCoins {
  balance: number;
  totalEarned: number;
  totalSpent: number;
}

export const getVirtualCoins = async (): Promise<VirtualCoins> => {
  try {
    const stored = await AsyncStorage.getItem(COINS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    return {
      balance: DEFAULT_COINS,
      totalEarned: DEFAULT_COINS,
      totalSpent: 0,
    };
  } catch (error) {
    error('Error getting virtual coins:', error);
    return {
      balance: DEFAULT_COINS,
      totalEarned: DEFAULT_COINS,
      totalSpent: 0,
    };
  }
};

export const updateVirtualCoins = async (amount: number, type: 'earn' | 'spend'): Promise<VirtualCoins> => {
  try {
    const current = await getVirtualCoins();
    const newBalance = type === 'earn' 
      ? current.balance + amount 
      : Math.max(0, current.balance - amount);
    
    const updated: VirtualCoins = {
      balance: newBalance,
      totalEarned: type === 'earn' ? current.totalEarned + amount : current.totalEarned,
      totalSpent: type === 'spend' ? current.totalSpent + amount : current.totalSpent,
    };
    
    await AsyncStorage.setItem(COINS_KEY, JSON.stringify(updated));
    return updated;
  } catch (error) {
    error('Error updating virtual coins:', error);
    return await getVirtualCoins();
  }
};

export const addVirtualCoins = async (amount: number): Promise<VirtualCoins> => {
  return updateVirtualCoins(amount, 'earn');
};

export const spendVirtualCoins = async (amount: number): Promise<VirtualCoins> => {
  return updateVirtualCoins(amount, 'spend');
};

export const resetVirtualCoins = async (): Promise<VirtualCoins> => {
  const reset: VirtualCoins = {
    balance: DEFAULT_COINS,
    totalEarned: DEFAULT_COINS,
    totalSpent: 0,
  };
  await AsyncStorage.setItem(COINS_KEY, JSON.stringify(reset));
  return reset;
};
