import { NextRequest, NextResponse } from "next/server"
import { generateReferralEmailHTML, generateReferralEmailText } from "@/lib/email"

/**
 * Send email with referral code
 * POST /api/send-email
 * 
 * Body: {
 *   to: string,
 *   subject: string,
 *   name: string,
 *   referralCode: string,
 *   referralLink: string
 * }
 * 
 * NOTE: This is a basic implementation. For production, use:
 * - Resend (https://resend.com) - Recommended
 * - SendGrid (https://sendgrid.com)
 * - Nodemailer with SMTP
 * - Firebase Extensions: Trigger Email
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { to, subject, name, referralCode, referralLink } = body

    if (!to || !name || !referralCode || !referralLink) {
      return NextResponse.json(
        { error: "to, name, referralCode, and referralLink are required" },
        { status: 400 }
      )
    }

    // Generate email content
    const html = generateReferralEmailHTML(name, referralCode, referralLink)
    const text = generateReferralEmailText(name, referralCode, referralLink)

    // TODO: Replace this with your email service
    // Option 1: Use Resend (recommended)
    // Option 2: Use SendGrid
    // Option 3: Use Nodemailer with SMTP
    // Option 4: Use Firebase Extensions: Trigger Email
    
    // For now, we'll log the email (you can check console)
    // In production, replace this with actual email sending
    console.log("=".repeat(60))
    console.log("📧 EMAIL TO SEND:")
    console.log("To:", to)
    console.log("Subject:", subject || "Welcome to Nomli Mingle Influencer Program!")
    console.log("Referral Code:", referralCode)
    console.log("Referral Link:", referralLink)
    console.log("=".repeat(60))
    
    // TODO: Uncomment and configure your email service:
    
    /*
    // Example with Resend:
    import { Resend } from 'resend'
    const resend = new Resend(process.env.RESEND_API_KEY)
    
    await resend.emails.send({
      from: 'Nomli Mingle <onboarding@nomlimingle.com>',
      to: to,
      subject: subject || "Welcome to Nomli Mingle Influencer Program!",
      html: html,
      text: text,
    })
    */
    
    /*
    // Example with SendGrid:
    import sgMail from '@sendgrid/mail'
    sgMail.setApiKey(process.env.SENDGRID_API_KEY!)
    
    await sgMail.send({
      from: 'hello@nomlimingle.com',
      to: to,
      subject: subject || "Welcome to Nomli Mingle Influencer Program!",
      html: html,
      text: text,
    })
    */

    // For development: Return success (email is logged to console)
    // In production, uncomment the email service code above
    return NextResponse.json({
      success: true,
      message: "Email sent successfully (logged to console in development)",
    })
  } catch (error: any) {
    console.error("Error sending email:", error)
    return NextResponse.json(
      { error: error.message || "Failed to send email" },
      { status: 500 }
    )
  }
}

