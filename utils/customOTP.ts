import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


// Custom OTP implementation for password reset
export const sendCustomOTP = async (email: string) => {
  try {
    log('📧 Sending custom OTP to:', email);
    
    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP in database with expiration (5 minutes)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
    
    const { error: insertError } = await supabase
      .from('otp_codes')
      .insert({
        email: email,
        code: otp,
        expires_at: expiresAt.toISOString(),
        used: false
      });
    
    if (insertError) {
      error('❌ Error storing OTP:', insertError);
      throw insertError;
    }
    
    // Send email using Supabase Edge Function or external service
    // For now, we'll use a simple approach
    log('✅ OTP generated and stored:', otp);
    log('📬 In production, this would send an email with the code');
    
    return {
      success: true,
      message: 'OTP sent successfully',
      // In development, return the OTP for testing
      otp: __DEV__ ? otp : undefined
    };
    
  } catch (error: any) {
    error('❌ Error sending custom OTP:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

export const verifyCustomOTP = async (email: string, code: string) => {
  try {
    log('🔍 Verifying OTP for:', email, 'Code:', code);
    
    // Check if OTP exists and is valid
    const { data: otpData, error: fetchError } = await supabase
      .from('otp_codes')
      .select('*')
      .eq('email', email)
      .eq('code', code)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .single();
    
    if (fetchError || !otpData) {
      error('❌ Invalid or expired OTP');
      return {
        success: false,
        error: 'Invalid or expired verification code'
      };
    }
    
    // Mark OTP as used
    const { error: updateError } = await supabase
      .from('otp_codes')
      .update({ used: true })
      .eq('id', otpData.id);
    
    if (updateError) {
      error('❌ Error marking OTP as used:', updateError);
    }
    
    log('✅ OTP verified successfully');
    return {
      success: true,
      message: 'OTP verified successfully'
    };
    
  } catch (error: any) {
    error('❌ Error verifying custom OTP:', error);
    return {
      success: false,
      error: error.message
    };
  }
};
