# Favicon & Image Assets Guide

## Required Image Sizes

To complete your branding setup, you need to create the following image files from your Nomli logo:

### 1. Favicon Sizes (PNG)
Save your logo in these sizes to `/public/`:

- **favicon.ico** - 16x16, 32x32, 48x48 (multi-size .ico file)
- **icon-192x192.png** - 192x192px (for Android)
- **icon-512x512.png** - 512x512px (for Android)
- **apple-touch-icon.png** - 180x180px (for iOS)

### 2. Social Media / OG Images
For better social media sharing:

- **og-image.png** - 1200x630px (Open Graph image for Facebook, LinkedIn, etc.)
- **twitter-image.png** - 1200x600px (Twitter card image)

### 3. Team Photos
Add team member photos to `/public/team/`:

- **umaru.jpg** - Umaru Mohammed's photo
- **philips.jpg** - Ikhoria Philips's photo

Recommended: Square photos (at least 400x400px) for best display.

---

## Quick Generation Tools

### Online Tools (Free):
1. **Favicon.io** - https://favicon.io/
   - Upload your logo PNG
   - Generates all favicon sizes automatically
   - Download and extract to `/public/`

2. **RealFaviconGenerator** - https://realfavicongenerator.net/
   - Most comprehensive favicon generator
   - Supports all platforms (iOS, Android, Windows, etc.)
   - Generates manifest.json too

3. **Canva** - https://canva.com
   - Create custom sized images for social media
   - Use 1200x630px template for OG images

### Using ImageMagick (CLI):
If you have ImageMagick installed:

```bash
# Navigate to your project
cd /Users/nomli/Desktop/saa-s-landing-page/public

# Generate different sizes from your logo
convert nomli-logo.png -resize 192x192 icon-192x192.png
convert nomli-logo.png -resize 512x512 icon-512x512.png
convert nomli-logo.png -resize 180x180 apple-touch-icon.png
convert nomli-logo.png -resize 32x32 favicon-32x32.png
convert nomli-logo.png -resize 16x16 favicon-16x16.png

# Create .ico file (requires all sizes)
convert favicon-16x16.png favicon-32x32.png favicon.ico

# Create OG image (with padding/background if needed)
convert nomli-logo.png -resize 1200x630 -background white -gravity center -extent 1200x630 og-image.png
```

---

## Current Status

✅ Logo updated in header and footer
✅ Enhanced SEO metadata (Open Graph, Twitter Cards)
✅ Web manifest created
✅ Sitemap generated
✅ Robots.txt created

⏳ Pending:
- Generate favicon sizes from your logo
- Create social media OG images
- Add team member photos

---

## File Structure

```
/public/
├── nomli-logo.png ✅ (your main logo)
├── favicon.ico ⏳
├── icon-192x192.png ⏳
├── icon-512x512.png ⏳
├── apple-touch-icon.png ⏳
├── og-image.png ⏳
├── twitter-image.png ⏳
├── manifest.json ✅
├── robots.txt ✅
└── team/
    ├── umaru.jpg ⏳
    └── philips.jpg ⏳
```

---

## Testing Your Setup

After adding all images:

1. **Favicon**: Visit your site and check the browser tab icon
2. **Social Sharing**: Use these tools to test:
   - Facebook: https://developers.facebook.com/tools/debug/
   - Twitter: https://cards-dev.twitter.com/validator
   - LinkedIn: https://www.linkedin.com/post-inspector/

3. **Mobile**: Test the PWA manifest on mobile devices

---

## Notes

- All images should use your purple-to-cyan gradient branding
- Maintain transparency where appropriate
- Optimize images for web (compress without losing quality)
- Consider adding a white or colored background for social media images

Need help? Contact: hello@nomli.cc

