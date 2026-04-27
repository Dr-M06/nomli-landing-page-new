import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { checkRateLimit, rateLimitResponse, RateLimits, getClientIP } from '../_shared/rateLimit.ts';

/**
 * ENVIRONMENT VARIABLES REQUIRED:
 * 
 * ADMIN_EMAIL - Email address where admin notifications (user reports, alerts, etc.) are sent
 *              This is the "to" address for admin-related emails
 *              Example: admin@nomli.cc
 * 
 * SUPPORT_EMAIL - Email address used in the "from" field of emails
 *                 This must be a verified domain in Resend
 *                 Example: hello@nomli.cc
 * 
 * RESEND_API_KEY - API key for Resend email service
 * 
 * SUPABASE_URL - Supabase project URL
 * SUPABASE_ANON_KEY - Supabase anonymous key
 * SUPABASE_SERVICE_ROLE_KEY - Required for admins to set posts.adult_content when applyAdultContentBlur is true
 */

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
// Admin email for receiving user reports and admin notifications
// Set ADMIN_EMAIL environment variable in Supabase dashboard
// This should be the email address where admin notifications (reports, alerts, etc.) are sent
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') || Deno.env.get('REPORT_EMAIL') || 'hello@nomli.cc';
// Support email for "from" field in emails (should be a verified domain in Resend)
// Set SUPPORT_EMAIL environment variable in Supabase dashboard
const SUPPORT_EMAIL = Deno.env.get('SUPPORT_EMAIL') || 'hello@nomli.cc';

interface ReportData {
  reportedUserId: string;
  reportedUsername: string;
  reporterUserId: string;
  reporterUsername: string;
  reason: string;
  customReason?: string;
  photoBase64Array?: string[];
  timestamp: string;
  /** When set with applyAdultContentBlur, verified admins can mark this post as 18+ (blur in app). */
  postId?: string;
  applyAdultContentBlur?: boolean;
}

const REASON_LABELS: { [key: string]: string } = {
  spam: 'Spam or fake account',
  harassment: 'Harassment or bullying',
  inappropriate: 'Inappropriate content',
  impersonation: 'Impersonation',
  scam: 'Scam or fraud',
  violence: 'Violence or threats',
  hate: 'Hate speech',
  other: 'Other',
  adult_18: 'Sensitive / 18+ (admin content flag)',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight(req);
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    console.log('[SendUserReport] Request received:', {
      method: req.method,
      url: req.url,
      hasAuth: !!req.headers.get('Authorization'),
    });

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[SendUserReport] Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header', success: false }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('[SendUserReport] Missing Supabase environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error', success: false }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user is authenticated
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      console.error('[SendUserReport] Authentication failed:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized', success: false }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('[SendUserReport] User authenticated:', user.id);

    // Rate limiting for user reports
    const ipAddress = getClientIP(req);
    const rateLimitResult = await checkRateLimit(
      supabaseClient,
      user.id,
      ipAddress,
      RateLimits.USER_REPORT
    );
    
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
    }

    // Parse request body
    let reportData: ReportData;
    try {
      reportData = await req.json();
      console.log('[SendUserReport] Report data received:', {
        reportedUserId: reportData.reportedUserId,
        reason: reportData.reason,
        hasPhotos: !!(reportData.photoBase64Array && reportData.photoBase64Array.length > 0),
      });
    } catch (parseError) {
      console.error('[SendUserReport] Error parsing request body:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid request body', success: false }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate required fields
    if (!reportData.reportedUserId || !reportData.reason) {
      console.error('[SendUserReport] Missing required fields:', {
        hasReportedUserId: !!reportData.reportedUserId,
        hasReason: !!reportData.reason,
      });
      return new Response(
        JSON.stringify({ error: 'Missing required fields', success: false }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    let adultBlurApplied = false;
    if (reportData.applyAdultContentBlur === true && reportData.postId) {
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!serviceKey) {
        console.warn('[SendUserReport] SUPABASE_SERVICE_ROLE_KEY missing — cannot apply adult blur');
      } else {
        const adminClient = createClient(supabaseUrl, serviceKey);
        const { data: modProfile, error: modProfileError } = await adminClient
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single();

        if (modProfileError) {
          console.error('[SendUserReport] Admin check failed:', modProfileError);
        } else if (modProfile?.is_admin === true) {
          const { error: updateError } = await adminClient
            .from('posts')
            .update({ adult_content: true })
            .eq('id', reportData.postId);

          if (updateError) {
            console.error('[SendUserReport] Failed to set adult_content:', updateError);
          } else {
            adultBlurApplied = true;
            console.log('[SendUserReport] Admin marked post as adult_content:', reportData.postId);
          }
        } else {
          console.log('[SendUserReport] applyAdultContentBlur ignored — caller is not admin');
        }
      }
    }

    // Get reason label
    const baseReason = reportData.reason.split(':')[0]; // Get base reason if it's "Other: ..."
    const reasonLabel = REASON_LABELS[baseReason] || reportData.reason;
    const fullReason = reportData.customReason 
      ? `${reasonLabel}: ${reportData.customReason}`
      : reasonLabel;

    // Prepare email content
    const emailSubject = `User Report: ${reportData.reportedUsername || 'Unknown User'}`;
    let emailBody = `
User Report Submitted

Reported User:
- ID: ${reportData.reportedUserId}
- Username: ${reportData.reportedUsername || 'Unknown'}

Reporter:
- ID: ${reportData.reporterUserId}
- Username: ${reportData.reporterUsername || 'Unknown'}

Reason: ${fullReason}

Timestamp: ${reportData.timestamp}
${reportData.postId ? `\nPost ID: ${reportData.postId}` : ''}
${adultBlurApplied ? '\nModeration: Post was marked 18+ / sensitive (blur enabled in app).' : ''}

---
This is an automated report from Nomli Mingle app.
    `.trim();

    // Prepare email with photo attachment if provided
    // Use Resend's default domain for testing (onboarding@resend.dev)
    // For production, verify your domain in Resend and use your verified email
    const emailData: any = {
      from: `Nomli Mingle <${SUPPORT_EMAIL}>`, // Use configured support email (must be verified in Resend)
      to: [ADMIN_EMAIL], // Send to admin email
      subject: emailSubject,
      text: emailBody,
    };

    // Add photos as attachments if provided
    if (reportData.photoBase64Array && reportData.photoBase64Array.length > 0) {
      emailData.attachments = reportData.photoBase64Array.map((photoBase64, index) => ({
        filename: `report_${reportData.reportedUserId}_${Date.now()}_${index + 1}.jpg`,
        content: photoBase64,
        type: 'image/jpeg',
      }));
      // Also add photo count to email body as reference
      emailBody += `\n\n${reportData.photoBase64Array.length} photo(s) attached as evidence.`;
    }

    // Send email via Resend API
    console.log('[SendUserReport] Checking RESEND_API_KEY:', RESEND_API_KEY ? 'Set' : 'Not set');
    
    if (RESEND_API_KEY) {
      try {
        console.log('[SendUserReport] Attempting to send email via Resend...');
        console.log('[SendUserReport] Email data:', {
          from: emailData.from,
          to: emailData.to,
          subject: emailData.subject,
          hasAttachments: !!(emailData.attachments && emailData.attachments.length > 0),
        });

        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(emailData),
        });

        const responseText = await resendResponse.text();
        console.log('[SendUserReport] Resend API response status:', resendResponse.status);
        console.log('[SendUserReport] Resend API response:', responseText);

        if (!resendResponse.ok) {
          let errorDetails;
          try {
            errorDetails = JSON.parse(responseText);
          } catch {
            errorDetails = responseText;
          }
          console.error('[SendUserReport] Resend API error:', errorDetails);
          console.error('[SendUserReport] Full error details:', {
            status: resendResponse.status,
            statusText: resendResponse.statusText,
            error: errorDetails,
          });
          // Still return success to user, but log the error
          console.log('[SendUserReport] Report logged (email failed):', emailBody);
        } else {
          const resendResult = JSON.parse(responseText);
          console.log('[SendUserReport] ✅ Email sent successfully!');
          console.log('[SendUserReport] Resend result:', {
            id: resendResult.id,
            from: resendResult.from,
            to: resendResult.to,
          });
        }
      } catch (emailError) {
        console.error('[SendUserReport] ❌ Exception sending email:', emailError);
        console.error('[SendUserReport] Error details:', {
          message: emailError.message,
          stack: emailError.stack,
        });
        // Still return success to user, but log the error
        console.log('[SendUserReport] Report logged (email error):', emailBody);
      }
    } else {
      // Fallback: Log to console if Resend API key is not configured
      console.warn('[SendUserReport] ⚠️ RESEND_API_KEY not configured - email will not be sent');
      console.log('[SendUserReport] Report logged (no API key):', emailBody);
    }

    console.log('[SendUserReport] Report processed successfully');
    return new Response(
      JSON.stringify({ success: true, adultBlurApplied }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('[SendUserReport] Unexpected error:', error);
    console.error('[SendUserReport] Error stack:', error.stack);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        success: false 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

