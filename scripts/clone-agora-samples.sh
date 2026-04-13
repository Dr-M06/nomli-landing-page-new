#!/bin/bash

# Script to clone Agora samples repository for reference

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SAMPLES_DIR="$PROJECT_ROOT/agora-samples-reference"

echo "📦 Cloning Agora Video SDK Samples Repository..."
echo ""

# Check if directory already exists
if [ -d "$SAMPLES_DIR" ]; then
    echo "⚠️  Directory already exists: $SAMPLES_DIR"
    echo "   Remove it first if you want to re-clone:"
    echo "   rm -rf $SAMPLES_DIR"
    exit 1
fi

# Clone the repository
echo "🔗 Cloning from GitHub..."
git clone https://github.com/AgoraIO/video-sdk-samples-reactnative.git "$SAMPLES_DIR"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Successfully cloned Agora samples repository!"
    echo ""
    echo "📍 Location: $SAMPLES_DIR"
    echo ""
    echo "📚 Next steps:"
    echo "   1. Review the samples: cd agora-samples-reference"
    echo "   2. Check the structure: ls -la src/"
    echo "   3. Read the README: cat agora-samples-reference/README.md"
    echo ""
    echo "💡 Note: This repository is for reference only."
    echo "   Your implementation uses SDK 4.5.3 (newer than samples)."
else
    echo ""
    echo "❌ Failed to clone repository"
    echo "   Check your internet connection and try again"
    exit 1
fi
