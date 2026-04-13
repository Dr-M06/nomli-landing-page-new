import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export const setupGiftTransactionsTable = async (): Promise<boolean> => {
  try {
    log('🎁 [Gift Transactions] Checking gift_transactions table...');
    
    // Simply try to query the table to see if it exists and is accessible
    const { data, error } = await supabase
      .from('gift_transactions')
      .select('id')
      .limit(1);
    
    if (error) {
      error('❌ [Gift Transactions] Table not accessible:', error);
      log('🎁 [Gift Transactions] This might be due to missing table or RLS policies');
      log('🎁 [Gift Transactions] Please ensure the gift_transactions table exists in your database');
      return false;
    }
    
    log('✅ [Gift Transactions] Table is accessible');
    return true;
    
  } catch (error) {
    error('❌ [Gift Transactions] Error checking table:', error);
    return false;
  }
};
