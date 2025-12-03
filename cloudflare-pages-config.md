# Cloudflare Pages Configuration Guide

## Build Settings for Cloudflare Pages

When setting up your project in Cloudflare Pages, use these settings:

### Framework Preset
- **Next.js** (Cloudflare will auto-detect)

### Build Configuration
- **Build command**: `npm run build`
- **Build output directory**: `.next`
- **Root directory**: `/` (leave empty or use `/`)

### Environment Variables
- None required for basic setup
- Add any API keys or secrets if needed later

### Node Version
- Cloudflare Pages will use Node.js 18.x or 20.x automatically

---

## Step-by-Step: Deploy to Cloudflare Pages

### 1. Connect GitHub Repository

1. Go to **Cloudflare Dashboard** → **Pages**
2. Click **Create a project**
3. Click **Connect to Git**
4. Authorize Cloudflare to access your GitHub
5. Select repository: `Dr-M06/Nomli-_mingle_landingpage`
6. Click **Begin setup**

### 2. Configure Build Settings

**Project name**: `nomli-mingle-landing` (or your choice)

**Production branch**: `main`

**Framework preset**: `Next.js` (auto-detected)

**Build command**: 
```
npm run build
```

**Build output directory**: 
```
.next
```

**Root directory**: 
```
/ (leave empty)
```

**Environment variables**: 
- None needed initially

### 3. Deploy

1. Click **Save and Deploy**
2. Wait for build to complete (usually 3-5 minutes)
3. Your site will be live at: `https://[project-name].pages.dev`

### 4. Add Custom Domain

1. In your Cloudflare Pages project, go to **Custom domains**
2. Click **Set up a custom domain**
3. Enter your domain: `nomli.cc`
4. Cloudflare will automatically:
   - Create DNS records
   - Set up SSL certificate
   - Configure routing

### 5. Update Namecheap Nameservers

1. Go to **Namecheap** → **Domain List** → Select your domain
2. Click **Manage** → **Nameservers**
3. Select **Custom DNS**
4. Add your Cloudflare nameservers (found in Cloudflare dashboard)
5. Save changes

---

## Important Notes for Next.js on Cloudflare Pages

### Next.js Configuration

Your `next.config.mjs` is already configured correctly:
- Images are unoptimized (good for Cloudflare)
- TypeScript errors are ignored during build

### Potential Issues & Solutions

**Issue**: Build fails with "Module not found"
- **Solution**: Make sure all dependencies are in `package.json`

**Issue**: Images not loading
- **Solution**: Your config already has `unoptimized: true` which is correct

**Issue**: Environment variables not working
- **Solution**: Add them in Cloudflare Pages → Settings → Environment variables

---

## Automatic Deployments

Cloudflare Pages will automatically:
- ✅ Deploy on every push to `main` branch
- ✅ Create preview deployments for pull requests
- ✅ Show build logs and status

---

## Custom Domain Setup

After deployment:

1. **In Cloudflare Pages**:
   - Go to your project → **Custom domains**
   - Add `nomli.cc` and `www.nomli.cc`

2. **In Cloudflare DNS** (if not automatic):
   - Add CNAME: `@` → `[your-project].pages.dev`
   - Add CNAME: `www` → `[your-project].pages.dev`
   - Enable proxy (orange cloud)

3. **In Namecheap**:
   - Update nameservers to Cloudflare

---

## Troubleshooting

### Build Fails?

1. Check build logs in Cloudflare Pages dashboard
2. Test build locally: `npm run build`
3. Make sure all dependencies are installed

### Domain Not Working?

1. Check DNS propagation: https://www.whatsmydns.net
2. Verify nameservers in Namecheap
3. Check DNS records in Cloudflare
4. Wait 1-2 hours for DNS propagation

### SSL Certificate Issues?

- Cloudflare provides free SSL automatically
- Wait 24 hours if certificate is pending
- Check SSL/TLS settings in Cloudflare dashboard

---

## Quick Reference

**Repository**: https://github.com/Dr-M06/Nomli-_mingle_landingpage

**Cloudflare Pages**: https://dash.cloudflare.com → Pages

**Build Command**: `npm run build`

**Output Directory**: `.next`

**Node Version**: 18.x or 20.x (auto)

---

Need help? Check Cloudflare Pages docs: https://developers.cloudflare.com/pages

