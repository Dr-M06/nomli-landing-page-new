import * as FileSystem from 'expo-file-system';
import { log, warn, error } from './productionLogger';


// Template gradient configurations (curated premium selection)
const TEMPLATE_GRADIENTS: Record<string, string[]> = {
  // Christmas Special
  'christmas-red-green': ['#C41E3A', '#165B33', '#FFD700'],
  'christmas-snow': ['#1e3a5f', '#5fa8d3', '#e1f5fe'],
  'christmas-gold': ['#FFD700', '#FFA000', '#FF6F00'],
  // Gen Z Essentials
  'gradient-pink-orange': ['#FF6B9D', '#FFA07A', '#FF8C69'],
  'gradient-purple-blue': ['#667eea', '#764ba2', '#f093fb'],
  'gradient-green-cyan': ['#11998e', '#38ef7d'],
  'gradient-red-orange': ['#eb3349', '#f45c43', '#fc6076'],
  'gradient-dark': ['#000000', '#434343'],
};

const TEMPLATE_TEXT_COLORS: Record<string, string> = {
  // Christmas Special
  'christmas-red-green': '#FFFFFF',
  'christmas-snow': '#1a1a1a',
  'christmas-gold': '#1a1a1a',
  // Gen Z Essentials
  'gradient-pink-orange': '#FFFFFF',
  'gradient-purple-blue': '#FFFFFF',
  'gradient-green-cyan': '#FFFFFF',
  'gradient-red-orange': '#FFFFFF',
  'gradient-dark': '#FFFFFF',
};

// Template decorative patterns (TikTok-style minimal but engaging)
type PatternType = 'dots' | 'circles' | 'stars' | 'snowflakes' | 'sparkles' | 'waves' | 'none';

const TEMPLATE_PATTERNS: Record<string, PatternType> = {
  // Christmas Special
  'christmas-red-green': 'snowflakes',
  'christmas-snow': 'snowflakes',
  'christmas-gold': 'sparkles',
  // Gen Z Essentials
  'gradient-pink-orange': 'circles',
  'gradient-purple-blue': 'stars',
  'gradient-green-cyan': 'dots',
  'gradient-red-orange': 'waves',
  'gradient-dark': 'sparkles',
};

/** Instagram-style text styles for story text (fade = classic look + fade-in animation) */
export type TextStoryStyle = 'classic' | 'neon' | 'strong' | 'typewriter' | 'fade';

function getTextStyleAttrs(
  textStyle: TextStoryStyle,
  textColor: string
): { fontFamily: string; fontWeight: string; letterSpacing: string; stroke: string; strokeWidth: string } {
  // No CSS filter in SVG - many renderers (expo-image, upload pipelines) don't support it and can show blank text.
  // Rely on fill + stroke only so the image is never blank.
  switch (textStyle) {
    case 'neon':
      return {
        fontFamily: 'SF Pro Display, -apple-system, Helvetica Neue, Arial, sans-serif',
        fontWeight: '800',
        letterSpacing: '1',
        stroke: textColor,
        strokeWidth: '3',
      };
    case 'strong':
      return {
        fontFamily: 'SF Pro Display, -apple-system, Helvetica Neue, Arial, sans-serif',
        fontWeight: '900',
        letterSpacing: '0.5',
        stroke: 'rgba(0,0,0,0.6)',
        strokeWidth: '4',
      };
    case 'typewriter':
      return {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontWeight: '700',
        letterSpacing: '2',
        stroke: 'rgba(0,0,0,0.35)',
        strokeWidth: '1.5',
      };
    case 'fade': // same as classic; text drawn as overlay with fade animation
    case 'classic':
    default:
      return {
        fontFamily: 'SF Pro Display, -apple-system, Helvetica Neue, Arial, sans-serif',
        fontWeight: '900',
        letterSpacing: '0.5',
        stroke: 'rgba(0,0,0,0.4)',
        strokeWidth: '2',
      };
  }
}

/** True when text is shown as overlay with animation (fade or typewriter), so we skip drawing text in the image */
function skipTextInImage(textStyle: TextStoryStyle): boolean {
  return textStyle === 'fade' || textStyle === 'typewriter';
}

/**
 * Generate decorative pattern elements for background (TikTok-style with bold shapes)
 */
const generatePatternElements = (patternType: PatternType, width: number, height: number): string => {
  if (patternType === 'none') return '';
  
  const elements: string[] = [];
  
  switch (patternType) {
    case 'dots':
      // Large bold dots with varied opacity
      for (let i = 0; i < 30; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const r = 15 + Math.random() * 35;
        const opacity = 0.1 + Math.random() * 0.15;
        elements.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="white" opacity="${opacity}" />`);
      }
      break;
      
    case 'circles':
      // Large overlapping circles with semi-transparent fills
      elements.push(`<circle cx="${width * 0.85}" cy="${height * 0.15}" r="200" fill="white" opacity="0.12" />`);
      elements.push(`<circle cx="${width * 0.1}" cy="${height * 0.4}" r="180" fill="white" opacity="0.08" />`);
      elements.push(`<circle cx="${width * 0.9}" cy="${height * 0.75}" r="220" fill="white" opacity="0.1" />`);
      elements.push(`<circle cx="${width * 0.15}" cy="${height * 0.9}" r="160" fill="white" opacity="0.15" />`);
      // Add some outlined circles for variety
      elements.push(`<circle cx="${width * 0.5}" cy="${height * 0.2}" r="100" fill="none" stroke="white" stroke-width="4" opacity="0.2" />`);
      elements.push(`<circle cx="${width * 0.3}" cy="${height * 0.65}" r="80" fill="none" stroke="white" stroke-width="3" opacity="0.15" />`);
      break;
      
    case 'stars':
      // Bold filled stars in corners and edges
      const starPositions = [
        { x: width * 0.1, y: height * 0.15, size: 60 },
        { x: width * 0.9, y: height * 0.2, size: 50 },
        { x: width * 0.15, y: height * 0.85, size: 70 },
        { x: width * 0.85, y: height * 0.8, size: 55 },
        { x: width * 0.5, y: height * 0.1, size: 40 },
        { x: width * 0.3, y: height * 0.5, size: 35 },
        { x: width * 0.7, y: height * 0.6, size: 45 },
      ];
      starPositions.forEach(star => {
        const { x, y, size } = star;
        elements.push(`
          <polygon 
            points="${x},${y - size} ${x + size * 0.25},${y - size * 0.25} ${x + size},${y} ${x + size * 0.25},${y + size * 0.25} ${x},${y + size} ${x - size * 0.25},${y + size * 0.25} ${x - size},${y} ${x - size * 0.25},${y - size * 0.25}"
            fill="white" 
            opacity="0.15" 
          />
        `);
      });
      break;
      
    case 'snowflakes':
      // Bold snowflakes
      const snowPositions = [
        { x: width * 0.2, y: height * 0.2, size: 40 },
        { x: width * 0.8, y: height * 0.3, size: 50 },
        { x: width * 0.3, y: height * 0.6, size: 35 },
        { x: width * 0.7, y: height * 0.75, size: 45 },
        { x: width * 0.5, y: height * 0.15, size: 30 },
        { x: width * 0.15, y: height * 0.85, size: 55 },
        { x: width * 0.85, y: height * 0.85, size: 38 },
      ];
      snowPositions.forEach(snow => {
        const { x, y, size } = snow;
        elements.push(`
          <g opacity="0.2">
            <line x1="${x - size}" y1="${y}" x2="${x + size}" y2="${y}" stroke="white" stroke-width="5" stroke-linecap="round" />
            <line x1="${x}" y1="${y - size}" x2="${x}" y2="${y + size}" stroke="white" stroke-width="5" stroke-linecap="round" />
            <line x1="${x - size * 0.7}" y1="${y - size * 0.7}" x2="${x + size * 0.7}" y2="${y + size * 0.7}" stroke="white" stroke-width="5" stroke-linecap="round" />
            <line x1="${x - size * 0.7}" y1="${y + size * 0.7}" x2="${x + size * 0.7}" y2="${y - size * 0.7}" stroke="white" stroke-width="5" stroke-linecap="round" />
          </g>
        `);
      });
      break;
      
    case 'sparkles':
      // Bold plus signs and crosses
      const sparklePositions = [
        { x: width * 0.15, y: height * 0.2, size: 25, rotation: 0 },
        { x: width * 0.85, y: height * 0.25, size: 35, rotation: 45 },
        { x: width * 0.2, y: height * 0.7, size: 30, rotation: 0 },
        { x: width * 0.8, y: height * 0.8, size: 28, rotation: 45 },
        { x: width * 0.5, y: height * 0.15, size: 20, rotation: 0 },
        { x: width * 0.3, y: height * 0.5, size: 22, rotation: 45 },
        { x: width * 0.7, y: height * 0.55, size: 32, rotation: 0 },
        { x: width * 0.9, y: height * 0.5, size: 26, rotation: 45 },
      ];
      sparklePositions.forEach(sparkle => {
        const { x, y, size, rotation } = sparkle;
        elements.push(`
          <g transform="rotate(${rotation} ${x} ${y})" opacity="0.25">
            <rect x="${x - size}" y="${y - size / 4}" width="${size * 2}" height="${size / 2}" fill="white" rx="3" />
            <rect x="${x - size / 4}" y="${y - size}" width="${size / 2}" height="${size * 2}" fill="white" rx="3" />
          </g>
        `);
      });
      break;
      
    case 'waves':
      // Bold geometric shapes instead of waves
      elements.push(`<rect x="0" y="${height * 0.1}" width="${width}" height="3" fill="white" opacity="0.12" />`);
      elements.push(`<rect x="0" y="${height * 0.3}" width="${width}" height="5" fill="white" opacity="0.08" />`);
      elements.push(`<rect x="0" y="${height * 0.7}" width="${width}" height="4" fill="white" opacity="0.1" />`);
      elements.push(`<rect x="0" y="${height * 0.9}" width="${width}" height="6" fill="white" opacity="0.15" />`);
      // Add some angled rectangles
      elements.push(`<rect x="${width * 0.7}" y="0" width="150" height="${height}" fill="white" opacity="0.05" />`);
      elements.push(`<rect x="${width * 0.1}" y="0" width="100" height="${height}" fill="white" opacity="0.08" />`);
      break;
  }
  
  return elements.join('\n');
};

/**
 * Generate a text story image using SVG
 * Creates a premium, large-text story image with gradient background and decorative patterns
 */
export const generateTextStoryImage = async (
  text: string,
  templateId: string,
  fontSize: number = 18, // Snapchat/Instagram-style compact text
  textAlign: 'left' | 'center' | 'right' = 'center',
  textStyle: TextStoryStyle = 'classic'
): Promise<string> => {
  try {
    const gradient = TEMPLATE_GRADIENTS[templateId] || TEMPLATE_GRADIENTS['gradient-pink-orange'];
    const textColor = TEMPLATE_TEXT_COLORS[templateId] || '#FFFFFF';
    const patternType = TEMPLATE_PATTERNS[templateId] || 'none';
    const styleAttrs = getTextStyleAttrs(textStyle, textColor);
    const skipText = skipTextInImage(textStyle);

    // Create an SVG with the text and gradient (1080x1920 - Instagram Story size)
    const width = 1080;
    const height = 1920;

    // Editor passes logical font size (e.g. 18–24). Scale to SVG pixels for Snapchat/Instagram-style compact text.
    const logicalWidth = 360;
    const scaledFontSize = Math.max(48, Math.round(fontSize * (width / logicalWidth)));
    
    // Calculate gradient stops
    const gradientStops = gradient.map((color, index) => {
      const offset = (index / (gradient.length - 1)) * 100;
      return `<stop offset="${offset}%" style="stop-color:${color};stop-opacity:1" />`;
    }).join('\n');

    let textElements: string;
    if (skipText) { // fade or typewriter: text shown as overlay
      textElements = '';
    } else {
    // Format text with line breaks - wrap at word boundaries
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    const maxCharsPerLine = Math.max(15, Math.floor(30 - (scaledFontSize - 48) / 4)); // Dynamic based on font size
    
    words.forEach(word => {
      if ((currentLine + word).length <= maxCharsPerLine) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    });
    if (currentLine) lines.push(currentLine);

    const lineHeight = scaledFontSize * 1.4; // Increased line height for better readability
    const totalTextHeight = lines.length * lineHeight;
    const startY = (height - totalTextHeight) / 2 + scaledFontSize;

    textElements = lines.map((line, index) => {
      const y = startY + (index * lineHeight);
      let x = width / 2;
      let anchor = 'middle';
      
      if (textAlign === 'left') {
        x = 100; // More padding on left
        anchor = 'start';
      } else if (textAlign === 'right') {
        x = width - 100; // More padding on right
        anchor = 'end';
      }

      // Escape XML special characters
      const escapedLine = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

      return `
        <text 
          x="${x}" 
          y="${y}" 
          fill="${textColor}" 
          stroke="${styleAttrs.stroke}"
          stroke-width="${styleAttrs.strokeWidth}"
          paint-order="stroke fill"
          font-size="${scaledFontSize}" 
          font-family="${styleAttrs.fontFamily}" 
          font-weight="${styleAttrs.fontWeight}" 
          text-anchor="${anchor}"
          letter-spacing="${styleAttrs.letterSpacing}"
        >${escapedLine}</text>
      `;
    }).join('\n');
    }

    // Generate decorative pattern elements (placed BEFORE text for proper layering)
    const patternElements = generatePatternElements(patternType, width, height);

    // Create SVG with embedded namespace and self-contained gradients
    const svg = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      ${gradientStops}
    </linearGradient>
  </defs>
  <!-- Background with gradient -->
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#grad)" opacity="1"/>
  <!-- Decorative pattern elements -->
  ${patternElements}
  <!-- Text elements -->
  ${textElements}
</svg>`;

    // Save as a temporary file with proper headers for better compatibility
    const fileName = `text-story-${Date.now()}.svg`;
    const filePath = `${FileSystem.cacheDirectory}${fileName}`;
    
    await FileSystem.writeAsStringAsync(filePath, svg, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    log('[TextStoryGenerator] ✨ Generated premium text story SVG:', filePath);
    log('[TextStoryGenerator] SVG size:', svg.length, 'bytes');
    return filePath;

  } catch (error) {
    error('[TextStoryGenerator] Error generating text story image:', error);
    throw error;
  }
};

/**
 * Get template configuration
 */
export const getTextStoryTemplate = (templateId: string) => {
  return {
    gradient: TEMPLATE_GRADIENTS[templateId] || TEMPLATE_GRADIENTS['gradient-pink-orange'],
    textColor: TEMPLATE_TEXT_COLORS[templateId] || '#FFFFFF',
  };
};
