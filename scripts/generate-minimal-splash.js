const { createCanvas } = require('canvas');
const fs = require('fs');

// Create a minimalistic splash screen
const width = 1284;
const height = 2778;

const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d');

// Black background
ctx.fillStyle = '#000000';
ctx.fillRect(0, 0, width, height);

// Draw centered circle with gradient border
const centerX = width / 2;
const centerY = height / 2;
const logoSize = 200;

// Gradient border (simulate with multiple circles)
const gradient = ctx.createLinearGradient(
  centerX - logoSize/2, centerY - logoSize/2,
  centerX + logoSize/2, centerY + logoSize/2
);
gradient.addColorStop(0, '#8B5CF6');
gradient.addColorStop(0.5, '#A78BFA');
gradient.addColorStop(1, '#C4B5FD');

// Draw gradient border circle
ctx.strokeStyle = gradient;
ctx.lineWidth = 8;
ctx.beginPath();
ctx.arc(centerX, centerY, logoSize / 2 + 4, 0, Math.PI * 2);
ctx.stroke();

// Draw inner black circle
ctx.fillStyle = '#000000';
ctx.beginPath();
ctx.arc(centerX, centerY, logoSize / 2 - 4, 0, Math.PI * 2);
ctx.fill();

// Draw "N" text with gradient
ctx.font = 'bold 120px Arial';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillStyle = gradient;
ctx.fillText('N', centerX, centerY);

// App name
ctx.font = 'bold 64px Arial';
ctx.fillStyle = '#FFFFFF';
ctx.fillText('Nomli Mingle', centerX, centerY + 200);

// Tagline
ctx.font = '28px Arial';
ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
ctx.fillText('Beyond borders. Beyond limits.', centerX, centerY + 270);

// Save
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync('./assets/images/splash.png', buffer);

console.log('✅ Minimal splash screen generated!');
