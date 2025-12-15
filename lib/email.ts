/**
 * Email utility for sending referral codes
 * 
 * You can use any email service:
 * - Resend (recommended): https://resend.com
 * - SendGrid: https://sendgrid.com
 * - Nodemailer with SMTP
 * - Firebase Extensions: Trigger Email
 */

interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

/**
 * Send email with referral code
 * 
 * For now, this uses a simple API route approach.
 * You can replace this with your preferred email service.
 */
export async function sendReferralCodeEmail(
  email: string,
  name: string,
  referralCode: string,
  referralLink: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Use API route to send email (prevents exposing email service credentials)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const response = await fetch(`${baseUrl}/api/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: email,
        subject: 'Welcome to Nomli Mingle Influencer Program!',
        name,
        referralCode,
        referralLink,
      }),
    })

    // Check if response is ok
    if (!response.ok) {
      const text = await response.text()
      let errorMessage = `HTTP ${response.status}`
      try {
        const jsonError = JSON.parse(text)
        errorMessage = jsonError.error || errorMessage
      } catch {
        errorMessage = text || errorMessage
      }
      console.error('Email sending failed:', errorMessage)
      return { success: false, error: errorMessage }
    }

    // Try to parse JSON response, but handle empty or non-JSON responses gracefully
    const contentType = response.headers.get('content-type')
    if (contentType && contentType.includes('application/json')) {
      try {
        const text = await response.text()
        if (!text) {
          // Empty response is OK for development
          return { success: true }
        }
        const result = JSON.parse(text)
        return { success: result.success !== false }
      } catch (parseError) {
        // If JSON parsing fails, but response was OK, assume success (for dev mode)
        console.warn('Email API returned non-JSON response, assuming success')
        return { success: true }
      }
    } else {
      // Non-JSON response is OK for development
      return { success: true }
    }
  } catch (error: any) {
    console.error('Error sending email:', error)
    return { success: false, error: error.message || 'Unknown error' }
  }
}

/**
 * Generate email HTML template
 */
export function generateReferralEmailHTML(
  name: string,
  referralCode: string,
  referralLink: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Nomli Mingle Influencer Program</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px; text-align: center;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%); border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Welcome to Nomli Mingle!</h1>
              <p style="margin: 10px 0 0; color: #ffffff; font-size: 16px; opacity: 0.9;">Influencer Program</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                Hi ${name},
              </p>
              
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                Congratulations! Your application has been approved. You're now part of the Nomli Mingle Influencer Program!
              </p>
              
              <div style="background-color: #f8f9fa; border-left: 4px solid #8b5cf6; padding: 20px; margin: 30px 0; border-radius: 4px;">
                <p style="margin: 0 0 10px; color: #666666; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Your Referral Code</p>
                <p style="margin: 0; color: #1a1a1a; font-size: 32px; font-weight: bold; font-family: 'Courier New', monospace; letter-spacing: 2px;">${referralCode}</p>
              </div>
              
              <p style="margin: 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Share your unique referral link to start earning rewards:
              </p>
              
              <div style="background-color: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0; word-break: break-all;">
                <a href="${referralLink}" style="color: #8b5cf6; text-decoration: none; font-size: 14px;">${referralLink}</a>
              </div>
              
              <table role="presentation" style="width: 100%; margin: 30px 0;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${referralLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%); color: #ffffff; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 16px;">Copy Your Referral Link</a>
                  </td>
                </tr>
              </table>
              
              <div style="border-top: 1px solid #e0e0e0; margin: 30px 0; padding-top: 20px;">
                <p style="margin: 0 0 15px; color: #666666; font-size: 14px; font-weight: 600;">How It Works:</p>
                <ul style="margin: 0; padding-left: 20px; color: #666666; font-size: 14px; line-height: 1.8;">
                  <li>Share your referral link with your audience</li>
                  <li>When users sign up and become active, you earn rewards</li>
                  <li>Track your progress in your dashboard</li>
                </ul>
              </div>
              
              <div style="background-color: #fff9e6; border: 1px solid #ffd700; border-radius: 8px; padding: 20px; margin: 30px 0;">
                <p style="margin: 0 0 10px; color: #333333; font-size: 14px; font-weight: 600;">💰 Reward Milestones:</p>
                <ul style="margin: 0; padding-left: 20px; color: #666666; font-size: 14px; line-height: 1.8;">
                  <li><strong>5 Active Users</strong> → $7</li>
                  <li><strong>10 Active Users</strong> → $13</li>
                  <li><strong>20 Active Users</strong> → $34</li>
                </ul>
              </div>
              
              <p style="margin: 30px 0 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Ready to get started? Visit your dashboard to track your referrals and earnings.
              </p>
              
              <table role="presentation" style="width: 100%; margin: 30px 0 0;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://nomlimingle.com'}/influencer/dashboard" style="display: inline-block; padding: 12px 28px; background-color: #ffffff; color: #8b5cf6; text-decoration: none; border: 2px solid #8b5cf6; border-radius: 50px; font-weight: 600; font-size: 14px;">View Dashboard</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; text-align: center; background-color: #f8f9fa; border-radius: 0 0 12px 12px; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0 0 10px; color: #666666; font-size: 12px;">
                Questions? Contact us at <a href="mailto:hello@nomlimingle.com" style="color: #8b5cf6; text-decoration: none;">hello@nomlimingle.com</a>
              </p>
              <p style="margin: 0; color: #999999; font-size: 11px;">
                © ${new Date().getFullYear()} Nomli Mingle. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

/**
 * Generate plain text email
 */
export function generateReferralEmailText(
  name: string,
  referralCode: string,
  referralLink: string
): string {
  return `
Hi ${name},

Congratulations! Your application has been approved. You're now part of the Nomli Mingle Influencer Program!

Your Referral Code: ${referralCode}

Share your unique referral link to start earning rewards:
${referralLink}

How It Works:
- Share your referral link with your audience
- When users sign up and become active, you earn rewards
- Track your progress in your dashboard

Reward Milestones:
- 5 Active Users → $7
- 10 Active Users → $13
- 20 Active Users → $34

Visit your dashboard: ${process.env.NEXT_PUBLIC_BASE_URL || 'https://nomlimingle.com'}/influencer/dashboard

Questions? Contact us at hello@nomlimingle.com

© ${new Date().getFullYear()} Nomli Mingle. All rights reserved.
  `.trim()
}

