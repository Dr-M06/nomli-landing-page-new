import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system';
import { log, warn, error } from './productionLogger';


export interface ReportUserData {
  reportedUserId: string;
  reportedUsername: string;
  reporterUserId: string;
  reporterUsername: string;
  reason: string;
  customReason?: string;
  photoUris?: string[];
  /** When set with applyAdultContentBlur, edge function marks this post 18+ if caller is admin. */
  postId?: string;
  applyAdultContentBlur?: boolean;
}

/**
 * Send a user report via Supabase Edge Function
 * The Edge Function will send an email to hello@nomli.cc
 */
export async function sendUserReport(data: ReportUserData): Promise<boolean> {
  try {
    log('[ReportUser] Submitting report:', {
      reportedUserId: data.reportedUserId,
      reportedUsername: data.reportedUsername,
      reason: data.reason,
      ...(data.postId ? { postId: data.postId } : {}),
      ...(data.applyAdultContentBlur ? { applyAdultContentBlur: true } : {}),
    });

    // Convert photos to base64 if provided
    const photoBase64Array: string[] = [];
    if (data.photoUris && data.photoUris.length > 0) {
      for (const photoUri of data.photoUris) {
        try {
          // Use expo-file-system to read file as base64
          const base64String = await FileSystem.readAsStringAsync(photoUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          photoBase64Array.push(base64String);
        } catch (error) {
          error('[ReportUser] Error converting photo to base64:', error);
          // Continue with other photos if one fails
        }
      }
    }

    // Call Supabase Edge Function to send email
    const { data: result, error } = await supabase.functions.invoke('send-user-report', {
      body: {
        reportedUserId: data.reportedUserId,
        reportedUsername: data.reportedUsername,
        reporterUserId: data.reporterUserId,
        reporterUsername: data.reporterUsername,
        reason: data.reason,
        customReason: data.customReason,
        photoBase64Array: photoBase64Array.length > 0 ? photoBase64Array : undefined,
        timestamp: new Date().toISOString(),
        postId: data.postId,
        applyAdultContentBlur: data.applyAdultContentBlur,
      },
    });

    if (error) {
      error('[ReportUser] Error calling Edge Function:', error);
      error('[ReportUser] Error details:', {
        message: error.message,
        context: error.context,
        status: (error as any).status,
      });
      
      // Check if it's a function not found error
      if (error.message?.includes('not found') || error.message?.includes('404')) {
        error('[ReportUser] Edge Function may not be deployed. Please deploy: supabase functions deploy send-user-report');
      }
      
      return false;
    }

    if (result?.success) {
      if (data.applyAdultContentBlur && (result as { adultBlurApplied?: boolean }).adultBlurApplied !== true) {
        error('[ReportUser] Report sent but 18+ blur was not applied (admin only; check service role on send-user-report)');
        return false;
      }
      const extra = result as { adultBlurApplied?: boolean };
      log(
        '[ReportUser] Report submitted successfully',
        data.applyAdultContentBlur
          ? { adultBlurApplied: extra.adultBlurApplied === true }
          : data.postId
            ? { postId: data.postId }
            : undefined
      );
      return true;
    } else {
      error('[ReportUser] Edge Function returned error:', result?.error);
      error('[ReportUser] Full result:', result);
      return false;
    }
  } catch (error) {
    error('[ReportUser] Exception sending report:', error);
    return false;
  }
}

