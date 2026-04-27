import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export interface NetworkDiagnostics {
  isOnline: boolean;
  canReachGoogle: boolean;
  canReachSupabase: boolean;
  supabaseUrl?: string;
  userAgent?: string;
  timestamp: string;
  errors: string[];
}

export const runNetworkDiagnostics = async (): Promise<NetworkDiagnostics> => {
  const diagnostics: NetworkDiagnostics = {
    isOnline: navigator.onLine,
    canReachGoogle: false,
    canReachSupabase: false,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    errors: []
  };

  log('🔍 [NetworkDiagnostics] Starting network diagnostics...');
  log('🔍 [NetworkDiagnostics] Navigator online status:', diagnostics.isOnline);

  // Test 1: Can we reach Google?
  try {
    log('🔍 [NetworkDiagnostics] Testing connection to Google...');
    
    // Create a timeout manually for React Native compatibility
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const googleResponse = await fetch('https://www.google.com', {
      method: 'HEAD',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    diagnostics.canReachGoogle = googleResponse.ok;
    log('🔍 [NetworkDiagnostics] Google reachable:', diagnostics.canReachGoogle);
  } catch (error) {
    diagnostics.errors.push(`Google test failed: ${error.message}`);
    error('🔍 [NetworkDiagnostics] Google test failed:', error);
  }

  // Test 2: Can we reach Supabase?
  try {
    log('🔍 [NetworkDiagnostics] Testing connection to Supabase...');
    
    // First test raw Supabase URL
    const supabaseUrl = supabase.supabaseUrl;
    diagnostics.supabaseUrl = supabaseUrl;
    
    if (!supabaseUrl) {
      throw new Error('Supabase URL not configured');
    }

    // Create a timeout manually for React Native compatibility
    const controller2 = new AbortController();
    const timeoutId2 = setTimeout(() => controller2.abort(), 5000);
    
    const supabaseResponse = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      signal: controller2.signal
    });
    
    clearTimeout(timeoutId2);
    
    log('🔍 [NetworkDiagnostics] Supabase raw URL test:', supabaseResponse.status);
    
    // Test actual Supabase client
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);
    
    if (error) {
      throw new Error(`Supabase client error: ${error.message}`);
    }
    
    diagnostics.canReachSupabase = true;
    log('🔍 [NetworkDiagnostics] Supabase reachable:', true);
    
  } catch (error) {
    diagnostics.errors.push(`Supabase test failed: ${error.message}`);
    error('🔍 [NetworkDiagnostics] Supabase test failed:', error);
  }

  log('🔍 [NetworkDiagnostics] Diagnostics complete:', diagnostics);
  return diagnostics;
};

export const logNetworkDiagnostics = async (): Promise<void> => {
  const diagnostics = await runNetworkDiagnostics();
  
  log('📊 [NetworkDiagnostics] === NETWORK DIAGNOSTICS REPORT ===');
  log('📊 [NetworkDiagnostics] Online Status:', diagnostics.isOnline);
  log('📊 [NetworkDiagnostics] Google Reachable:', diagnostics.canReachGoogle);
  log('📊 [NetworkDiagnostics] Supabase Reachable:', diagnostics.canReachSupabase);
  log('📊 [NetworkDiagnostics] Supabase URL:', diagnostics.supabaseUrl);
  log('📊 [NetworkDiagnostics] User Agent:', diagnostics.userAgent);
  log('📊 [NetworkDiagnostics] Timestamp:', diagnostics.timestamp);
  
  if (diagnostics.errors.length > 0) {
    log('📊 [NetworkDiagnostics] Errors:');
    diagnostics.errors.forEach((error, index) => {
      log(`📊 [NetworkDiagnostics]   ${index + 1}. ${error}`);
    });
  }
  
  log('📊 [NetworkDiagnostics] === END REPORT ===');
};
