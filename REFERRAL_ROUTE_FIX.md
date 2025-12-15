# Referral Route Fix Guide

## Issue
The route `/invite/[code]` is showing a 404 error in production, even though:
- ✅ The route file exists at `app/invite/[code]/page.tsx`
- ✅ The route is recognized in the build (`Route (app) ├ ƒ /invite/[code]`)
- ✅ The code is correct and uses `useParams()` properly

## Solution Steps

### 1. Clear Build Cache and Rebuild
```bash
# Remove build cache
Remove-Item -Recurse -Force .next

# Rebuild
npm run build

# Test locally
npm run dev
# Visit: http://localhost:3000/invite/NOMLI-2UA4HM
```

### 2. Verify Route File Structure
Ensure the file structure is exactly:
```
app/
  invite/
    [code]/
      page.tsx
```

### 3. Check Deployment
- Ensure the route file is committed to git
- Verify the deployment includes the latest build
- Clear any CDN/proxy cache (Cloudflare, etc.)
- Redeploy the application

### 4. Test the Route
After rebuilding, test:
- Local: `http://localhost:3000/invite/NOMLI-2UA4HM`
- Production: `https://nomlimingle.com/invite/NOMLI-2UA4HM`

### 5. If Still Not Working
Check:
- Server logs for routing errors
- Next.js version compatibility
- Hosting platform routing configuration
- Ensure dynamic routes are enabled in hosting settings

## Current Route Configuration

The route is a **client component** (`"use client"`), which means:
- ✅ No need for `export const dynamic = 'force-dynamic'` (only for server components)
- ✅ Uses `useParams()` from `next/navigation`
- ✅ Handles URL decoding and validation
- ✅ Stores referral code in localStorage/sessionStorage

## Expected Behavior

When visiting `/invite/NOMLI-2UA4HM`:
1. Page loads (not 404)
2. Shows welcome message with referral code
3. Stores code in localStorage: `nomli_referral_code`
4. Shows download button and instructions

## Debugging

If the route still doesn't work:
1. Check browser console for errors
2. Check network tab for failed requests
3. Verify the route appears in `.next/routes-manifest.json` after build
4. Check server logs for routing errors

