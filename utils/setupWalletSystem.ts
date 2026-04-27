import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export const setupWalletSystem = async () => {
  log('🔧 [WALLET] Setting up wallet system...');
  
  try {
    // Check if token_packages table exists by trying to query it
    log('🔍 [WALLET] Checking if wallet system tables exist...');
    
    // Try to query token_packages to see if it exists
    const { data: packages, error: packageError } = await supabase
      .from('token_packages')
      .select('id')
      .limit(1);

    if (packageError) {
      error('❌ [WALLET] Error checking token_packages table:', packageError);
      log('⚠️ [WALLET] Wallet tables not found. Please run the migration manually:');
      log('1. Go to your Supabase dashboard');
      log('2. Navigate to SQL Editor');
      log('3. Run the contents of supabase/migrations/create_wallet_system.sql');
      return { success: false, error: 'Wallet tables not found. Please run the migration first.' };
    }

    log('✅ [WALLET] Wallet system tables found');

    // Check if token packages exist (read-only check)
    const { data: existingPackages, error: existingPackageError } = await supabase
      .from('token_packages')
      .select('id, name')
      .limit(10);

    if (existingPackageError) {
      error('❌ [WALLET] Error checking packages:', existingPackageError);
      return { success: false, error: 'Failed to check token packages' };
    }

    // Only log status - don't try to create/update packages from client
    // Packages should be managed via migrations or Edge Functions with service role
    if (!existingPackages || existingPackages.length === 0) {
      log('⚠️ [WALLET] No token packages found. Packages should be created via migration.');
      log('📝 [WALLET] To create packages, run the wallet migration in Supabase SQL Editor.');
    } else {
      // Only log summary, not individual package names (too verbose)
      log(`✅ [WALLET] Found ${existingPackages.length} token packages`);
    }

    // Ensure all users have wallets
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: wallet, error: walletError } = await supabase
        .from('user_wallets')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (walletError && walletError.code === 'PGRST116') {
        // Wallet doesn't exist, create one
        log('👤 [WALLET] Creating wallet for current user...');
        
        const { error: createError } = await supabase
          .from('user_wallets')
          .insert({
            user_id: user.id,
            token_balance: 0,
            total_purchased: 0,
            total_redeemed: 0
          });

        if (createError) {
          error('❌ [WALLET] Error creating wallet:', createError);
          return { success: false, error: 'Failed to create user wallet' };
        }

        log('✅ [WALLET] User wallet created successfully');
      } else if (walletError) {
        error('❌ [WALLET] Error checking wallet:', walletError);
        return { success: false, error: 'Failed to check user wallet' };
      } else {
        log('✅ [WALLET] User wallet already exists');
      }
    }

    log('🎉 [WALLET] Wallet system setup completed successfully!');
    return { success: true };
  } catch (error) {
    error('❌ [WALLET] Error setting up wallet system:', error);
    return { success: false, error: 'Failed to setup wallet system' };
  }
};

// Test wallet functionality
export const testWalletFunctionality = async () => {
  log('🧪 [WALLET] Testing wallet functionality...');
  
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      log('⚠️ [WALLET] No authenticated user for testing');
      return { success: false, error: 'No authenticated user' };
    }

    // Test getting wallet
    const wallet = await supabase
      .from('user_wallets')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (wallet.error) {
      error('❌ [WALLET] Error fetching wallet:', wallet.error);
      return { success: false, error: 'Failed to fetch wallet' };
    }

    log('✅ [WALLET] Wallet data:', wallet.data);

    // Test getting packages
    const packages = await supabase
      .from('token_packages')
      .select('*')
      .eq('is_active', true)
      .order('display_order');

    if (packages.error) {
      error('❌ [WALLET] Error fetching packages:', packages.error);
      return { success: false, error: 'Failed to fetch packages' };
    }

    log('✅ [WALLET] Token packages:', packages.data);

    log('🎉 [WALLET] Wallet functionality test completed successfully!');
    return { success: true };
  } catch (error) {
    error('❌ [WALLET] Error testing wallet functionality:', error);
    return { success: false, error: 'Failed to test wallet functionality' };
  }
};
