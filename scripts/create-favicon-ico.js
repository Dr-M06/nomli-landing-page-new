const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../public');

async function createFaviconIco() {
  try {
    console.log('🎨 Creating favicon.ico...\n');

    // Use the 32x32 PNG as the favicon.ico (most browsers support PNG in .ico format)
    const favicon32Path = path.join(publicDir, 'favicon-32x32.png');
    const faviconIcoPath = path.join(publicDir, 'favicon.ico');

    if (!fs.existsSync(favicon32Path)) {
      console.error('❌ favicon-32x32.png not found. Run generate-favicons first.');
      return;
    }

    // Copy the 32x32 PNG as favicon.ico
    // Modern browsers support PNG format in .ico files
    fs.copyFileSync(favicon32Path, faviconIcoPath);
    
    console.log('✅ Created favicon.ico');
    console.log('\n✨ Favicon setup complete!');
    
  } catch (error) {
    console.error('❌ Error creating favicon.ico:', error.message);
  }
}

createFaviconIco();

