# 🔧 Fix for Blank Page on Cloudflare Pages

## The Problem

Next.js on Cloudflare Pages requires **static export** configuration. The default Next.js build creates server-side rendered files that Cloudflare Pages can't serve directly.

## The Solution

I've updated your configuration to use static export:

### Changes Made:

1. **`next.config.mjs`** - Added `output: 'export'` for static site generation
2. **`.github/workflows/deploy-cloudflare.yml`** - Changed output directory from `.next` to `out`
3. **`app/layout.tsx`** - Made Analytics conditional to avoid build issues

## What You Need to Do:

### Option 1: Update Cloudflare Pages Build Settings (If using Cloudflare Dashboard)

1. Go to **Cloudflare Dashboard** → **Pages** → Your project
2. Go to **Settings** → **Builds & deployments**
3. Update these settings:
   - **Build command**: `npm run build`
   - **Build output directory**: `out` (not `.next`)
   - **Root directory**: `/` (leave empty)

### Option 2: Push the Updated Code (If using GitHub Actions)

The GitHub Actions workflow is already updated. Just push:

```bash
git add .
git commit -m "Fix Cloudflare Pages deployment - use static export"
git push
```

The workflow will automatically:
- Build with static export
- Deploy the `out` directory to Cloudflare Pages

## Verify the Fix:

1. **Test build locally**:
   ```bash
   npm run build
   ```
   You should see an `out` folder created (not just `.next`)

2. **Check the build output**:
   - The `out` folder should contain `index.html` and all static assets
   - This is what Cloudflare Pages needs to serve

3. **After deployment**:
   - Your site should now show content instead of a blank page
   - All pages should work correctly

## Why This Works:

- **Static Export**: Next.js generates pure HTML/CSS/JS files
- **Cloudflare Pages**: Serves static files from the `out` directory
- **No Server Required**: Everything is pre-rendered at build time

## If Still Blank:

1. **Check browser console** for JavaScript errors
2. **Check Cloudflare build logs** for errors
3. **Verify the `out` directory** is being deployed (not `.next`)
4. **Clear browser cache** and hard refresh (Ctrl+Shift+R / Cmd+Shift+R)

## Next Steps:

After the fix is deployed:
- ✅ Your landing page should load correctly
- ✅ All routes should work (`/privacy`, `/terms`)
- ✅ Images and assets should load
- ✅ All interactive features should work

---

**Note**: If you're using Cloudflare Pages dashboard (not GitHub Actions), make sure to update the build output directory to `out` in the project settings!

