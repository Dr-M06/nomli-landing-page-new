#!/bin/bash

echo "🍎 Complete iOS Setup Script"
echo "============================"
echo ""

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo "📦 Homebrew not found. Installing Homebrew..."
    echo "----------------------------------------------"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Add Homebrew to PATH for Apple Silicon Macs
    if [[ $(uname -m) == 'arm64' ]]; then
        echo ""
        echo "Adding Homebrew to PATH for Apple Silicon..."
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
    
    echo ""
    echo "✅ Homebrew installed successfully!"
else
    echo "✅ Homebrew is already installed"
fi

echo ""
echo "📦 Installing CocoaPods via Homebrew..."
echo "---------------------------------------"
brew install cocoapods

if [ $? -ne 0 ]; then
    echo "❌ Failed to install CocoaPods via Homebrew"
    exit 1
fi

echo ""
echo "✅ CocoaPods installed successfully!"
pod --version

echo ""
echo "📦 Installing iOS dependencies (pod install)..."
echo "-----------------------------------------------"
cd /Users/nomli/Downloads/nomli-mingle-ios/ios
pod install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install pods"
    echo ""
    echo "Try running manually:"
    echo "  cd /Users/nomli/Downloads/nomli-mingle-ios/ios"
    echo "  pod install"
    exit 1
fi

echo ""
echo "✅ All iOS dependencies installed!"
echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Open Xcode workspace:"
echo "     open /Users/nomli/Downloads/nomli-mingle-ios/ios/NomliMingle.xcworkspace"
echo ""
echo "  2. In Xcode:"
echo "     - Select your device or simulator"
echo "     - Click the Run button (or press Cmd + R)"
echo ""
echo "  3. After installing on a real device:"
echo "     - Login to the app"
echo "     - Check Supabase for your real push token"
echo "     - Test with: node test-push.js \"ExponentPushToken[YOUR_TOKEN]\""
echo ""

