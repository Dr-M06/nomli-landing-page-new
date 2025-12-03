# 🚀 Vercel Deployment Guide

## Quick Setup (Recommended for Next.js)

Vercel is the easiest and best option for Next.js apps - it's made by the creators of Next.js!

### Step 1: Deploy to Vercel

1. **Go to Vercel**: https://vercel.com
   - Sign up/login with your GitHub account
   - Click **"Add New Project"**
   - Import your repository: `Dr-M06/Nomli-_mingle_landingpage`
   - Vercel will auto-detect Next.js settings ✅
   - Click **"Deploy"**

2. **Wait for deployment** (usually 2-3 minutes)

### Step 2: Add Custom Domain

1. In your Vercel project dashboard, go to **Settings** → **Domains**
2. Add your domain: `nomli.cc` (or whatever your domain is)
3. Vercel will show you DNS records to add

### Step 3: Configure Cloudflare DNS

1. **Go to Cloudflare Dashboard**: https://dash.cloudflare.com
2. Select your domain
3. Go to **DNS** → **Records**
4. Add these records:

   **For root domain (nomli.cc):**
   ```
   Type: CNAME
   Name: @
   Target: cname.vercel-dns.com
   Proxy: ON (orange cloud)
   TTL: Auto
   ```

   **For www subdomain:**
   ```
   Type: CNAME
   Name: www
   Target: cname.vercel-dns.com
   Proxy: ON (orange cloud)
   TTL: Auto
   ```

   **OR use A record (if CNAME doesn't work):**
   ```
   Type: A
   Name: @
   IPv4 address: 76.76.21.21
   Proxy: ON (orange cloud)
   TTL: Auto
   ```

### Step 4: Update Namecheap Nameservers

1. **Go to Namecheap**: https://www.namecheap.com
2. Go to **Domain List** → Select your domain
3. Click **Manage** → **Nameservers**
4. Change nameservers to Cloudflare:
   - Select **Custom DNS**
   - Add Cloudflare nameservers (found in Cloudflare dashboard)
   - Example (yours will be different):
     ```
     dante.ns.cloudflare.com
     kira.ns.cloudflare.com
     ```

### Step 5: SSL/HTTPS Setup

- **Cloudflare**: Enable SSL/TLS in **SSL/TLS** → **Overview**
  - Set to **Full (strict)** mode
- **Vercel**: Automatically provides SSL certificates ✅

### Step 6: Wait for Propagation

- DNS changes can take 24-48 hours, but usually work within 1-2 hours
- Check status: https://www.whatsmydns.net

---

## Build Configuration

Vercel automatically detects Next.js and uses these settings:
- **Framework**: Next.js (auto-detected)
- **Build Command**: `npm run build` (auto)
- **Output Directory**: `.next` (auto)
- **Install Command**: `npm install` (auto)

**No configuration needed!** Vercel handles everything automatically.

---

## Automatic Deployments

After setup, Vercel will automatically:
- ✅ Deploy on every push to `main` branch
- ✅ Create preview deployments for pull requests
- ✅ Show build logs and status
- ✅ Handle environment variables
- ✅ Provide analytics and monitoring

---

## Environment Variables (if needed)

If you need to add environment variables later:

1. Go to your Vercel project → **Settings** → **Environment Variables**
2. Add your variables
3. Redeploy (or wait for next automatic deployment)

---

## Troubleshooting

### Build Fails?

1. Check build logs in Vercel dashboard
2. Test build locally: `npm run build`
3. Make sure all dependencies are in `package.json`

### Domain Not Working?

1. **Check DNS propagation**: https://www.whatsmydns.net
2. **Verify nameservers**: Make sure Namecheap points to Cloudflare
3. **Check Cloudflare DNS**: Ensure records are correct
4. **Wait**: DNS can take up to 48 hours (usually 1-2 hours)

### SSL Certificate Issues?

- **Cloudflare**: Set SSL/TLS mode to "Full (strict)"
- **Vercel**: SSL is automatic, wait 24 hours if needed

### 404 Errors?

- Make sure you're deploying the correct branch (usually `main`)
- Check build logs in Vercel
- Verify Next.js configuration is correct

---

## Why Vercel?

- ✅ Made by Next.js creators
- ✅ Automatic SSL certificates
- ✅ Free tier available
- ✅ Fast global CDN
- ✅ Easy GitHub integration
- ✅ Automatic deployments
- ✅ Preview deployments for PRs
- ✅ Built-in analytics

---

## Quick Reference

**Your Repository**: https://github.com/Dr-M06/Nomli-_mingle_landingpage

**Vercel Dashboard**: https://vercel.com/dashboard

**Cloudflare Dashboard**: https://dash.cloudflare.com

**Domain Setup Flow**:
1. Namecheap → Cloudflare nameservers
2. Cloudflare → DNS records → Vercel
3. Vercel → Add custom domain
4. Wait for DNS propagation

---

## Post-Deployment Checklist

- [ ] Domain is connected and working
- [ ] HTTPS/SSL is enabled (automatic on Vercel)
- [ ] www redirects to root domain (or vice versa)
- [ ] Test all pages (home, privacy, terms)
- [ ] Test all buttons (Play Store, social links)
- [ ] Check mobile responsiveness
- [ ] Verify SEO metadata is working
- [ ] Test favicon displays correctly

Good luck! 🚀

