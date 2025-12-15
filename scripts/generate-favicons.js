const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../public');
const logoPath = path.join(publicDir, 'icon.png');

// Sizes needed for different platforms
const sizes = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'favicon-48x48.png', size: 48 },
  { name: 'icon-192x192.png', size: 192 }, // Keep for compatibility, but we'll use icon-192.png
  { name: 'icon-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'apple-icon.png', size: 180 },
];

async function generateFavicons() {
  try {
    // Check if logo exists
    if (!fs.existsSync(logoPath)) {
      console.error('❌ Logo file not found at:', logoPath);
      console.log('Please ensure icon.png exists in the public folder');
      return;
    }

    console.log('🎨 Generating favicons from icon.png...\n');

    // Generate each size
    for (const { name, size } of sizes) {
      const outputPath = path.join(publicDir, name);
      
      await sharp(logoPath)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toFile(outputPath);
      
      console.log(`✅ Generated ${name} (${size}x${size})`);
    }

    // Generate OG image for social media (1200x630)
    const ogImagePath = path.join(publicDir, 'og-image.png');
    await sharp(logoPath)
      .resize(600, 600, {
        fit: 'contain',
        background: { r: 10, g: 10, b: 15, alpha: 1 } // Dark background
      })
      .extend({
        top: 15,
        bottom: 15,
        left: 300,
        right: 300,
        background: { r: 10, g: 10, b: 15, alpha: 1 }
      })
      .png()
      .toFile(ogImagePath);
    
    console.log(`✅ Generated og-image.png (1200x630)`);

    // Generate Twitter card image (1200x600)
    const twitterImagePath = path.join(publicDir, 'twitter-image.png');
    await sharp(logoPath)
      .resize(600, 600, {
        fit: 'contain',
        background: { r: 10, g: 10, b: 15, alpha: 1 }
      })
      .extend({
        top: 0,
        bottom: 0,
        left: 300,
        right: 300,
        background: { r: 10, g: 10, b: 15, alpha: 1 }
      })
      .png()
      .toFile(twitterImagePath);
    
    console.log(`✅ Generated twitter-image.png (1200x600)`);

    console.log('\n✨ All favicons generated successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Add team photos to public/team/ folder');
    console.log('2. Test favicons by running: npm run dev');
    console.log('3. Check browser tab for favicon');
    
  } catch (error) {
    console.error('❌ Error generating favicons:', error.message);
    console.log('\n💡 Make sure sharp is installed: npm install sharp');
  }
}

generateFavicons();

