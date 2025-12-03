# 🚀 Favicon Setup Instructions

## Step 1: Save Your Logo

**IMPORTANT:** You need to save the Nomli logo image you shared to:
```
/Users/nomli/Desktop/saa-s-landing-page/public/nomli-logo.png
```

Right-click the logo image and save it as `nomli-logo.png` in the `public` folder.

---

## Step 2: Generate Favicons

Once you've saved the logo, run this command:

```bash
cd /Users/nomli/Desktop/saa-s-landing-page
npm run generate-favicons
```

This will automatically create:
- ✅ favicon-16x16.png
- ✅ favicon-32x32.png  
- ✅ favicon-48x48.png
- ✅ icon-192x192.png
- ✅ icon-512x512.png
- ✅ apple-touch-icon.png
- ✅ apple-icon.png
- ✅ og-image.png (1200x630 for social media)
- ✅ twitter-image.png (1200x600 for Twitter)

---

## Step 3: Add Team Photos

Add your team member photos to:
```
/Users/nomli/Desktop/saa-s-landing-page/public/team/umaru.jpg
/Users/nomli/Desktop/saa-s-landing-page/public/team/philips.jpg
```

Recommended: Square photos, at least 400x400px

---

## Alternative: Use Online Tools

If you prefer not to use the script, you can use these free online tools:

### Option 1: Favicon.io
1. Go to https://favicon.io/favicon-converter/
2. Upload your `nomli-logo.png`
3. Download the generated files
4. Extract to `/public/` folder

### Option 2: RealFaviconGenerator
1. Go to https://realfavicongenerator.net/
2. Upload your logo
3. Customize settings for each platform
4. Download and extract to `/public/` folder

---

## What's Already Done ✅

- ✅ Logo integrated in header and footer
- ✅ Enhanced SEO metadata (Open Graph, Twitter Cards)
- ✅ Web manifest created
- ✅ Sitemap generated  
- ✅ Robots.txt created
- ✅ Favicon generation script ready

---

## Testing After Setup

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Check favicon:** Open http://localhost:3000 and look at the browser tab

3. **Test social sharing:**
   - Facebook: https://developers.facebook.com/tools/debug/
   - Twitter: https://cards-dev.twitter.com/validator
   - LinkedIn: https://www.linkedin.com/post-inspector/

---

## Need Help?

If you encounter any issues:
1. Make sure the logo file is a valid PNG image
2. Check that sharp is installed: `npm list sharp`
3. Try regenerating: `npm run generate-favicons`

Contact: hello@nomli.cc

