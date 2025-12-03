# 🚀 Cloudflare Pages Deployment Setup

## Option 1: Automatic Deployment via GitHub Actions (Recommended)

I've set up a GitHub Actions workflow that will automatically deploy to Cloudflare Pages whenever you push to GitHub.

### Step 1: Get Your Cloudflare API Credentials

1. **Go to Cloudflare Dashboard**: https://dash.cloudflare.com/profile/api-tokens
2. **Create API Token**:
   - Click "Create Token"
   - Use "Edit Cloudflare Workers" template OR create custom token with these permissions:
     - Account: `Cloudflare Pages:Edit`
     - Zone: `Zone:Read` (if using custom domain)
   - Click "Continue to summary" → "Create Token"
   - **Copy the token** (you won't see it again!)

3. **Get Account ID**:
   - Go to https://dash.cloudflare.com
   - Select any domain (or go to Workers & Pages)
   - Your Account ID is in the right sidebar
   - **Copy the Account ID**

### Step 2: Add Secrets to GitHub

1. **Go to your GitHub repository**: https://github.com/Dr-M06/Nomli-_mingle_landingpage
2. **Settings** → **Secrets and variables** → **Actions**
3. **Click "New repository secret"**
4. **Add these two secrets**:

   **Secret 1:**
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: `[paste your API token from Step 1]`

   **Secret 2:**
   - Name: `CLOUDFLARE_ACCOUNT_ID`
   - Value: `[paste your Account ID from Step 1]`

### Step 3: Create Cloudflare Pages Project

1. **Go to Cloudflare Dashboard** → **Workers & Pages** → **Pages**
2. **Click "Create a project"**
3. **Project name**: `nomli-mingle-landing` (must match the workflow file)
4. **Click "Create project"** (don't connect Git, we're using GitHub Actions)

### Step 4: Push to GitHub

The workflow is already set up! Just push your code:

```bash
git add .
git commit -m "Add Cloudflare Pages deployment"
git push
```

The GitHub Action will automatically:
- ✅ Build your Next.js app
- ✅ Deploy to Cloudflare Pages
- ✅ Update on every push to `main` branch

### Step 5: Add Custom Domain

1. In Cloudflare Pages → Your project → **Custom domains**
2. Click **Set up a custom domain**
3. Enter: `nomli.cc`
4. Cloudflare will automatically configure DNS and SSL

---

## Option 2: Manual Setup via Cloudflare Dashboard

If you prefer the web interface:

### Step 1: Connect GitHub

1. Go to **Cloudflare Dashboard** → **Pages** → **Create a project**
2. Click **Connect to Git**
3. Authorize Cloudflare → Select repository: `Dr-M06/Nomli-_mingle_landingpage`
4. Click **Begin setup**

### Step 2: Configure Build

- **Project name**: `nomli-mingle-landing`
- **Production branch**: `main`
- **Framework preset**: `Next.js`
- **Build command**: `npm run build`
- **Build output directory**: `.next`
- **Root directory**: `/` (leave empty)

### Step 3: Deploy

1. Click **Save and Deploy**
2. Wait 3-5 minutes
3. Your site will be live!

---

## Option 3: Using Wrangler CLI (Advanced)

If you want to deploy manually from command line:

### Install Wrangler

```bash
npm install -g wrangler
```

### Login to Cloudflare

```bash
wrangler login
```

### Deploy

```bash
npm run build
wrangler pages deploy .next --project-name=nomli-mingle-landing
```

---

## Troubleshooting

### GitHub Action Fails?

1. **Check secrets are set correctly**:
   - Go to GitHub → Settings → Secrets
   - Verify `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exist

2. **Check Cloudflare project exists**:
   - Project name must match: `nomli-mingle-landing`
   - Create it in Cloudflare Dashboard first

3. **Check build logs**:
   - GitHub → Actions tab → View failed workflow

### Build Errors?

1. **Test build locally**:
   ```bash
   npm run build
   ```

2. **Check Node version**: Cloudflare uses Node 18/20

3. **Check dependencies**: Make sure all packages are in `package.json`

### Domain Not Working?

1. **Check DNS**: Verify nameservers point to Cloudflare
2. **Check SSL**: Wait 24 hours for certificate
3. **Check DNS records**: Ensure CNAME records are correct

---

## Quick Reference

**GitHub Repository**: https://github.com/Dr-M06/Nomli-_mingle_landingpage

**Cloudflare Dashboard**: https://dash.cloudflare.com

**Project Name**: `nomli-mingle-landing` (must match in workflow and Cloudflare)

**Build Command**: `npm run build`

**Output Directory**: `.next`

---

## Next Steps

1. ✅ Get Cloudflare API token and Account ID
2. ✅ Add secrets to GitHub
3. ✅ Create Cloudflare Pages project
4. ✅ Push to GitHub (deployment happens automatically!)
5. ✅ Add custom domain in Cloudflare

That's it! Your site will auto-deploy on every push! 🎉

