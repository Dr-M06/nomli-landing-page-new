# Email Setup Guide

## Current Status

The influencer signup now **automatically approves** applicants and sends them their referral code via email.

## Email Service Options

Currently, the email is logged to the console in development. To send real emails, choose one of these options:

### Option 1: Resend (Recommended - Easiest)

1. Sign up at [resend.com](https://resend.com)
2. Get your API key from the dashboard
3. Add to `.env.local`:
   ```env
   RESEND_API_KEY=re_xxxxxxxxxxxxx
   ```
4. Install Resend:
   ```bash
   npm install resend
   ```
5. Update `app/api/send-email/route.ts`:
   - Uncomment the Resend code
   - Replace the console.log with the Resend implementation

### Option 2: SendGrid

1. Sign up at [sendgrid.com](https://sendgrid.com)
2. Create an API key
3. Add to `.env.local`:
   ```env
   SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
   ```
4. Install SendGrid:
   ```bash
   npm install @sendgrid/mail
   ```
5. Update `app/api/send-email/route.ts`:
   - Uncomment the SendGrid code
   - Replace the console.log with the SendGrid implementation

### Option 3: Nodemailer (SMTP)

1. Get SMTP credentials from your email provider (Gmail, Outlook, etc.)
2. Add to `.env.local`:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   ```
3. Install Nodemailer:
   ```bash
   npm install nodemailer
   ```
4. Update `app/api/send-email/route.ts` to use Nodemailer

### Option 4: Firebase Extensions

1. Go to Firebase Console → Extensions
2. Install "Trigger Email" extension
3. Configure it to send emails when documents are created
4. Update the signup flow to trigger the extension

## Email Template

The email template is in `lib/email.ts` and includes:
- Welcome message
- Referral code (prominently displayed)
- Referral link
- How it works section
- Reward milestones
- Dashboard link

You can customize the template by editing `generateReferralEmailHTML()` and `generateReferralEmailText()` functions.

## Testing

1. Submit an influencer application
2. Check the console for the email log (in development)
3. Once you set up an email service, check the recipient's inbox

## Production

**Important:** Make sure to set up a real email service before going to production. Console logging won't work for real users!

