#!/bin/bash

# Image Compression Script
# Compresses PNG images in assets/images to reduce bundle size

echo "🖼️  Compressing images..."
echo ""

# Check if pngquant is installed
if ! command -v pngquant &> /dev/null; then
    echo "❌ pngquant not found. Installing..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install pngquant
    else
        echo "Please install pngquant: https://pngquant.org/"
        exit 1
    fi
fi

# Compress images in assets/images
find assets/images -name "*.png" -type f | while read -r img; do
    if [ -f "$img" ]; then
        size_before=$(stat -f%z "$img" 2>/dev/null || stat -c%s "$img" 2>/dev/null)
        size_before_kb=$((size_before / 1024))
        
        # Create backup
        cp "$img" "${img}.bak"
        
        # Compress (quality 80-100, keep transparency)
        pngquant --quality=80-100 --ext .png --force "$img" 2>/dev/null
        
        if [ $? -eq 0 ]; then
            size_after=$(stat -f%z "$img" 2>/dev/null || stat -c%s "$img" 2>/dev/null)
            size_after_kb=$((size_after / 1024))
            reduction=$((100 - (size_after * 100 / size_before)))
            
            echo "✅ $(basename "$img"): ${size_before_kb}KB → ${size_after_kb}KB (${reduction}% reduction)"
            
            # Remove backup if compression succeeded
            rm -f "${img}.bak"
        else
            echo "⚠️  Failed to compress $(basename "$img"), restoring backup..."
            mv "${img}.bak" "$img"
        fi
    fi
done

echo ""
echo "✨ Image compression complete!"
echo ""
echo "💡 Tip: For even better compression, consider:"
echo "   - Converting to WebP format (better compression)"
echo "   - Using vector icons (SVG) where possible"
echo "   - Serving images from CDN with automatic optimization"
