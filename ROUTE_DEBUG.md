# Route Debugging Guide

## Issue: `/invite/[code]` route showing 404

### Route Structure
The route should be at: `app/invite/[code]/page.tsx`

### Verification Steps

1. **Check if route file exists:**
   ```bash
   ls app/invite/[code]/page.tsx
   ```

2. **Verify the route is a client component:**
   - File should start with `"use client"`
   - Should use `useParams()` from `next/navigation`

3. **Test locally:**
   ```bash
   npm run dev
   ```
   Then visit: `http://localhost:3000/invite/NOMLI-2UA4HM`

4. **Rebuild the project:**
   ```bash
   npm run build
   ```
   Check if the route appears in the build output

5. **Check Next.js build output:**
   - Look for `/invite/[code]` in the build logs
   - Verify no errors related to this route

### Common Issues

1. **Route not recognized:**
   - Ensure folder is named exactly `[code]` (with brackets)
   - Ensure `page.tsx` is inside that folder
   - Restart dev server after creating route

2. **Build issues:**
   - Clear `.next` folder: `rm -rf .next`
   - Rebuild: `npm run build`

3. **Deployment issues:**
   - Ensure route is committed to git
   - Verify deployment includes the route file
   - Check deployment logs for errors

### Current Route Code

The route at `app/invite/[code]/page.tsx` should:
- Extract code from `params.code`
- Validate the referral code format
- Store it in localStorage
- Show welcome page with download button

### Testing

Test URL: `https://nomlimingle.com/invite/NOMLI-2UA4HM`

Expected behavior:
- Page loads (not 404)
- Shows welcome message
- Stores code in localStorage
- Shows download button

