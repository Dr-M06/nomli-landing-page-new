#!/usr/bin/env node
/**
 * Script to extract styles used by PostItemDisplay from community.tsx
 */

const fs = require('fs');
const path = require('path');

const COMMUNITY_FILE = path.join(__dirname, '../app/(tabs)/community.tsx');
const POSTITEMDISPLAY_FILE = path.join(__dirname, '../components/PostItemDisplay.tsx');
const STYLES_FILE = '/tmp/postitemdisplay_styles.txt';

// Read the styles list
const stylesList = fs.readFileSync(STYLES_FILE, 'utf8').split('\n').filter(Boolean);
const styleKeys = stylesList.map(line => line.replace('styles.', ''));

// Read community.tsx to find styles
const content = fs.readFileSync(COMMUNITY_FILE, 'utf8');
const lines = content.split('\n');

// Find where styles object starts (around line 10015)
let stylesStart = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const styles = StyleSheet.create({')) {
    stylesStart = i;
    break;
  }
}

if (stylesStart === -1) {
  console.error('❌ Could not find styles object');
  process.exit(1);
}

// Find where styles object ends (look for closing });
let stylesEnd = -1;
let braceCount = 0;
for (let i = stylesStart; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('{')) braceCount++;
  if (line.includes('}')) braceCount--;
  if (braceCount === 0 && line.includes('});')) {
    stylesEnd = i;
    break;
  }
}

if (stylesEnd === -1) {
  console.error('❌ Could not find end of styles object');
  process.exit(1);
}

const stylesLines = lines.slice(stylesStart, stylesEnd + 1);
const stylesContent = stylesLines.join('\n');

// Extract only the styles we need
const extractedStyles = {};
let currentKey = null;
let currentStyle = [];
let inStyle = false;
let braceLevel = 0;

for (let i = 0; i < stylesLines.length; i++) {
  const line = stylesLines[i];
  
  // Check if this line starts a new style key
  const keyMatch = line.match(/^\s*([a-zA-Z0-9_]+):\s*\{/);
  if (keyMatch && styleKeys.includes(keyMatch[1])) {
    if (currentKey) {
      // Save previous style
      extractedStyles[currentKey] = currentStyle.join('\n');
    }
    currentKey = keyMatch[1];
    currentStyle = [line];
    inStyle = true;
    braceLevel = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
  } else if (inStyle && currentKey) {
    currentStyle.push(line);
    braceLevel += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    if (braceLevel === 0) {
      // Style ended
      extractedStyles[currentKey] = currentStyle.join('\n');
      currentKey = null;
      currentStyle = [];
      inStyle = false;
    }
  }
}

// Build the styles object string
const stylesObject = `const styles = StyleSheet.create({
${Object.values(extractedStyles).join(',\n')}
});`;

// Read PostItemDisplay file
let postItemDisplayContent = fs.readFileSync(POSTITEMDISPLAY_FILE, 'utf8');

// Find where to insert styles (before export default)
const exportIndex = postItemDisplayContent.indexOf('export default');
if (exportIndex === -1) {
  console.error('❌ Could not find export statement');
  process.exit(1);
}

// Insert styles before export
const beforeExport = postItemDisplayContent.substring(0, exportIndex);
const afterExport = postItemDisplayContent.substring(exportIndex);

// Check if styles already exist
if (beforeExport.includes('const styles = StyleSheet.create')) {
  console.log('⚠️  Styles already exist in PostItemDisplay.tsx');
} else {
  // Add styles before export
  const newContent = beforeExport + '\n\n' + stylesObject + '\n\n' + afterExport;
  fs.writeFileSync(POSTITEMDISPLAY_FILE, newContent, 'utf8');
  console.log(`✅ Added ${Object.keys(extractedStyles).length} styles to PostItemDisplay.tsx`);
}

console.log(`   Extracted styles: ${Object.keys(extractedStyles).length} out of ${styleKeys.length} requested`);
