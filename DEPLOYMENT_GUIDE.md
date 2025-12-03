# 🚀 Deployment Guide: Nomli Mingle Landing Page

## Option 1: Deploy to Vercel (Recommended for Next.js)

Vercel is the easiest and best option for Next.js apps. It's made by the creators of Next.js.

### Step 1: Deploy to Vercel

1. **Push your code to GitHub** (already done ✅)

2. **Go to Vercel**: https://vercel.com
   - Sign up/login with your GitHub account
   - Click "Add New Project"
   - Import your repository: `Dr-M06/Nomli-_mingle_landingpage`
   - Vercel will auto-detect Next.js settings
   - Click "Deploy"

3. **Wait for deployment** (usually 2-3 minutes)

### Step 2: Add Custom Domain in Vercel

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
   Type: A
   Name: @
   IPv4 address: 76.76.21.21
   Proxy: ON (orange cloud)
   TTL: Auto
   ```

   **OR use CNAME (recommended):**
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

### Step 4: Update Namecheap Nameservers

1. **Go to Namecheap**: https://www.namecheap.com
2. Go to **Domain List** → Select your domain
3. Click **Manage** → **Advanced DNS**
4. Change nameservers to Cloudflare:
   - Go to **Nameservers** section
   - Select **Custom DNS**
   - Add Cloudflare nameservers (you'll find these in Cloudflare dashboard):
     ```
     [Your Cloudflare nameserver 1]
     [Your Cloudflare nameserver 2]
     ```
   - Example nameservers (yours will be different):
     ```
     dante.ns.cloudflare.com
     kira.ns.cloudflare.com
     ```

### Step 5: SSL/HTTPS Setup

- **Cloudflare**: Enable SSL/TLS in **SSL/TLS** → **Overview**
  - Set to **Full (strict)** mode
- **Vercel**: Automatically provides SSL certificates

### Step 6: Wait for Propagation

- DNS changes can take 24-48 hours, but usually work within 1-2 hours
- Check status: https://www.whatsmydns.net

---

## Option 2: Deploy to Cloudflare Pages

If you prefer to host directly on Cloudflare:

### Step 1: Connect GitHub to Cloudflare Pages

1. Go to **Cloudflare Dashboard** → **Pages**
2. Click **Create a project**
3. Connect your GitHub account
4. Select repository: `Dr-M06/Nomli-_mingle_landingpage`
5. Configure build settings:
   - **Framework preset**: Next.js
   - **Build command**: `npm run build`
   - **Build output directory**: `.next`
   - **Root directory**: `/` (leave as is)
6. Click **Save and Deploy**

### Step 2: Add Custom Domain

1. In your Cloudflare Pages project, go to **Custom domains**
2. Add your domain: `nomli.cc`
3. Cloudflare will automatically configure DNS

### Step 3: Update Namecheap Nameservers

Same as Option 1, Step 4 above.

---

## Option 3: Deploy to Netlify

Alternative hosting option:

### Step 1: Deploy to Netlify

1. Go to https://netlify.com
2. Sign up/login with GitHub
3. Click **Add new site** → **Import an existing project**
4. Select your GitHub repository
5. Configure:
   - **Build command**: `npm run build`
   - **Publish directory**: `.next`
6. Click **Deploy site**

### Step 2: Add Custom Domain

1. Go to **Site settings** → **Domain management**
2. Add custom domain: `nomli.cc`
3. Netlify will show DNS records

### Step 3: Configure Cloudflare DNS

Add these records in Cloudflare:

```
Type: CNAME
Name: @
Target: [your-netlify-domain].netlify.app
Proxy: ON
```

```
Type: CNAME
Name: www
Target: [your-netlify-domain].netlify.app
Proxy: ON
```

---

## Recommended: Vercel Setup (Easiest)

### Quick Setup Steps:

1. ✅ **Code is on GitHub** (done)
2. 🔄 **Deploy to Vercel**:
   - Visit: https://vercel.com/new
   - Import: `Dr-M06/Nomli-_mingle_landingpage`
   - Deploy
3. 🔄 **Add domain in Vercel**:
   - Settings → Domains → Add `nomli.cc`
4. 🔄 **Update Cloudflare DNS**:
   - Add CNAME: `@` → `cname.vercel-dns.com`
   - Add CNAME: `www` → `cname.vercel-dns.com`
5. 🔄 **Update Namecheap**:
   - Change nameservers to Cloudflare

---

## Environment Variables (if needed)

If you need to add environment variables later:

1. **Vercel**: Settings → Environment Variables
2. **Cloudflare Pages**: Settings → Environment Variables
3. **Netlify**: Site settings → Environment variables

---

## Post-Deployment Checklist

- [ ] Domain is connected and working
- [ ] HTTPS/SSL is enabled (automatic on Vercel/Cloudflare)
- [ ] www redirects to root domain (or vice versa)
- [ ] Test all pages (home, privacy, terms)
- [ ] Test all buttons (Play Store, social links)
- [ ] Check mobile responsiveness
- [ ] Verify SEO metadata is working
- [ ] Test favicon displays correctly

---

## Troubleshooting

### Domain not working?

1. **Check DNS propagation**: https://www.whatsmydns.net
2. **Verify nameservers**: Make sure Namecheap points to Cloudflare
3. **Check Cloudflare DNS**: Ensure records are correct
4. **Wait**: DNS can take up to 48 hours (usually 1-2 hours)

### SSL Certificate Issues?

- **Cloudflare**: Set SSL/TLS mode to "Full (strict)"
- **Vercel**: SSL is automatic, wait 24 hours if needed

### 404 Errors?

- Make sure you're deploying the correct branch (usually `main`)
- Check build logs in your hosting platform
- Verify Next.js configuration is correct

---

## Need Help?

- **Vercel Docs**: https://vercel.com/docs
- **Cloudflare Docs**: https://developers.cloudflare.com
- **Namecheap Support**: https://www.namecheap.com/support/

---

## Quick Reference

**Your Repository**: https://github.com/Dr-M06/Nomli-_mingle_landingpage

**Recommended Hosting**: Vercel (best for Next.js)

**Domain Setup Flow**:
1. Namecheap → Cloudflare nameservers
2. Cloudflare → DNS records → Vercel
3. Vercel → Add custom domain
4. Wait for DNS propagation

Good luck! 🚀

