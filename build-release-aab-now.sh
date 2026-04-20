#!/bin/bash

# Build Release AAB Script with Password Prompt
# This script builds the release AAB with the correct keystore

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$SCRIPT_DIR/android" ]; then
  REPO_ROOT="$SCRIPT_DIR"
else
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
cd "$REPO_ROOT"

# Gradle + Metro need several GB free; "No space left on device" otherwise.
_avail_kb="$(df -k "$REPO_ROOT" 2>/dev/null | tail -1 | awk '{print $4}')"
if [ -n "$_avail_kb" ] && [ "$_avail_kb" -lt 6291456 ] 2>/dev/null; then
  echo "❌ Not enough free disk space on: $REPO_ROOT"
  echo "   Available: $(( _avail_kb / 1024 / 1024 )) GiB (need at least ~6 GiB). Run: npm run wipe:native"
  exit 1
fi

# Version embedded in the AAB: android/app/defaultConfig (must match app.config.js android.versionCode + expo.version)
read_android_versions() {
    ANDROID_VERSION_CODE=""
    ANDROID_VERSION_NAME=""
    if [ -f "android/app/build.gradle" ]; then
        ANDROID_VERSION_CODE=$(grep -E '[[:space:]]versionCode[[:space:]]+[0-9]+' android/app/build.gradle | head -1 | sed -E 's/.*versionCode[[:space:]]+([0-9]+).*/\1/')
        ANDROID_VERSION_NAME=$(grep -E '[[:space:]]versionName[[:space:]]+"' android/app/build.gradle | head -1 | sed -E 's/.*versionName[[:space:]]+"([^"]+)".*/\1/')
    fi
}
read_android_versions

echo "🔨 Building Release AAB..."
if [ -n "$ANDROID_VERSION_CODE" ] && [ -n "$ANDROID_VERSION_NAME" ]; then
    echo "   (Play versionCode $ANDROID_VERSION_CODE, versionName $ANDROID_VERSION_NAME — from android/app/build.gradle)"
fi
echo ""

# Check if passwords are provided as arguments
if [ -n "$1" ] && [ -n "$2" ]; then
    export MYAPP_RELEASE_STORE_PASSWORD="$1"
    export MYAPP_RELEASE_KEY_PASSWORD="$2"
    echo "✅ Using passwords from command line arguments"
elif [ -n "$MYAPP_RELEASE_STORE_PASSWORD" ] && [ -n "$MYAPP_RELEASE_KEY_PASSWORD" ]; then
    echo "✅ Using passwords from environment variables"
else
    echo "⚠️  Keystore passwords not found!"
    echo ""
    echo "Usage:"
    echo "  ./build-release-aab-now.sh <store_password> <key_password>"
    echo ""
    echo "OR set environment variables:"
    echo "  export MYAPP_RELEASE_STORE_PASSWORD=your_store_password"
    echo "  export MYAPP_RELEASE_KEY_PASSWORD=your_key_password"
    echo "  ./build-release-aab-now.sh"
    echo ""
    echo "⚠️  IMPORTANT: Make sure the passwords match your keystore!"
    echo "   Keystore: android/app/nomli-mingle-release-key.keystore"
    echo "   Key Alias: nomli-mingle-key-alias"
    echo ""
    exit 1
fi

# Expand leading ~ to $HOME (bash)
expand_keystore_path() {
    local p="$1"
    if [[ "$p" == '~' ]]; then
        p="$HOME"
    elif [[ "$p" == '~/'* ]]; then
        p="$HOME/${p:2}"
    fi
    printf '%s' "$p"
}

# Determine keystore location (env override, then default paths, then interactive prompt)
# Keystores are gitignored — copy yours from backup or Play App Signing export.
KEYSTORE_PATH=""
if [ -n "$MYAPP_RELEASE_KEYSTORE_PATH" ]; then
    if [ -f "$MYAPP_RELEASE_KEYSTORE_PATH" ]; then
        KEYSTORE_PATH="$MYAPP_RELEASE_KEYSTORE_PATH"
    else
        echo "⚠️  MYAPP_RELEASE_KEYSTORE_PATH is not a valid file (will prompt if interactive):"
        echo "   $MYAPP_RELEASE_KEYSTORE_PATH"
        case "$MYAPP_RELEASE_KEYSTORE_PATH" in
            *"/absolute/path/"*|*"your-upload-key"*|*"your-release"*)
                echo "   (That looks like the docs example — use a real path or enter it below.)"
                ;;
        esac
        echo ""
    fi
fi
if [ -z "$KEYSTORE_PATH" ] && [ -f "android/app/nomli-mingle-release-key.keystore" ]; then
    KEYSTORE_PATH="android/app/nomli-mingle-release-key.keystore"
fi
if [ -z "$KEYSTORE_PATH" ] && [ -f "nomli-mingle-release-key.keystore" ]; then
    KEYSTORE_PATH="nomli-mingle-release-key.keystore"
fi
if [ -z "$KEYSTORE_PATH" ] && [ -f "${HOME}/Desktop/nomli-mingle-release-key.keystore" ]; then
    KEYSTORE_PATH="${HOME}/Desktop/nomli-mingle-release-key.keystore"
fi

if [ -z "$KEYSTORE_PATH" ]; then
    if [ -t 0 ] && [ -t 1 ]; then
        echo "Keystore not found in default locations."
        echo "You can paste or type the path (e.g. ~/Keys/upload.keystore), or drag the .keystore file into this terminal."
        echo ""
        for _try in 1 2 3 4 5; do
            read -r -p "Path to release .keystore (Enter to abort): " _ks || true
            _ks="${_ks#"${_ks%%[![:space:]]*}"}"
            _ks="${_ks%"${_ks##*[![:space:]]}"}"
            if [ -z "$_ks" ]; then
                echo "Aborted."
                exit 1
            fi
            _ks="$(expand_keystore_path "$_ks")"
            if [ -f "$_ks" ]; then
                KEYSTORE_PATH="$_ks"
                break
            fi
            echo "❌ Not a file: $_ks"
        done
    fi
fi

if [ -z "$KEYSTORE_PATH" ] || [ ! -f "$KEYSTORE_PATH" ]; then
    echo "❌ Keystore not found."
    echo "   Defaults: android/app/…, repo root, or ~/Desktop/nomli-mingle-release-key.keystore"
    echo "   Or: export MYAPP_RELEASE_KEYSTORE_PATH=\"/real/path/to/upload.keystore\""
    echo "   Run this script in a terminal (not piped) to be prompted for the path interactively."
    exit 1
fi

echo "✅ Keystore found: $KEYSTORE_PATH"

# Verify keystore passwords before building
echo "🔐 Verifying keystore passwords..."
if keytool -list -v -keystore "$KEYSTORE_PATH" -alias nomli-mingle-key-alias -storepass "$MYAPP_RELEASE_STORE_PASSWORD" -keypass "$MYAPP_RELEASE_KEY_PASSWORD" > /dev/null 2>&1; then
    echo "✅ Keystore passwords verified successfully"
else
    echo "❌ ERROR: Keystore password verification failed!"
    echo "   Please check that your passwords are correct for:"
    echo "   - Store password: $MYAPP_RELEASE_STORE_PASSWORD"
    echo "   - Key password: $MYAPP_RELEASE_KEY_PASSWORD"
    echo "   - Keystore: $KEYSTORE_PATH"
    echo "   - Key Alias: nomli-mingle-key-alias"
    echo ""
    echo "   To verify manually, run:"
    echo "   keytool -list -v -keystore $KEYSTORE_PATH -alias nomli-mingle-key-alias"
    exit 1
fi

# Get absolute path to keystore before changing directory
KEYSTORE_ABSOLUTE_PATH=$(cd "$(dirname "$KEYSTORE_PATH")" && pwd)/$(basename "$KEYSTORE_PATH")

# Navigate to android directory
cd android
echo ""

# Same env as local dev: faster/safer JS bundle + embed (createBundleReleaseJsAndAssets can take many minutes).
export EXPO_NO_DOTENV="${EXPO_NO_DOTENV:-1}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=16384}"
export CI="${CI:-true}"

# Export with standard names for Gradle
export MYAPP_RELEASE_KEY_ALIAS="${MYAPP_RELEASE_KEY_ALIAS:-nomli-mingle-key-alias}"

# Use absolute path to keystore to avoid path resolution issues
export MYAPP_RELEASE_STORE_FILE="$KEYSTORE_ABSOLUTE_PATH"

echo "🧹 Preparing clean build (stop daemons → remove outputs + Gradle project cache)..."
./gradlew --stop 2>/dev/null || true
sleep 2
cd "$REPO_ROOT"
# android/.gradle holds execution history; stale paths (e.g. deleted oldrepo_ref/**) break :createBundleReleaseJsAndAssets.
rm -rf android/app/build android/build android/.gradle node_modules/.cache .expo 2>/dev/null || true
cd android

# Gradle 8 + AGP can fail :app:checkReleaseDuplicateClasses with "Cannot access output property
# dummyOutputDirectory" / NoSuchFileException if the global build cache + parallel workers race a
# freshly deleted app/build. Pre-create the output leaf and disable build-cache for this invocation.
mkdir -p "app/build/intermediates/duplicate_classes_check/release/checkReleaseDuplicateClasses" 2>/dev/null || true

echo ""
echo "📦 Building Release AAB..."
echo "   Version Code: ${ANDROID_VERSION_CODE:-?}"
echo "   Version Name: ${ANDROID_VERSION_NAME:-?}"
echo "   Keystore: $KEYSTORE_PATH"
echo "   Key Alias: $MYAPP_RELEASE_KEY_ALIAS"
echo ""
echo "⏳  :app:createBundleReleaseJsAndAssets (Expo export:embed + Metro + Hermes)"
echo "   Gradle often stays around ~40–50% for a long time with little new output."
echo "   That is normal on large apps (commonly 20–60+ minutes). If a \"node\" process"
echo "   is using CPU, the bundle step is still working — not necessarily stuck."
echo "   More embed logs:  EXPO_DEBUG=1 ./build-release-aab-now.sh …"
echo "   Metro parallelism: EXPO_METRO_MAX_WORKERS=6 ./build-release-aab-now.sh …"
echo ""

# Build the AAB with explicit Gradle properties (--no-build-cache / --max-workers=1: see mkdir note above)
./gradlew bundleRelease \
    --no-build-cache \
    --max-workers=1 \
    -PMYAPP_RELEASE_STORE_FILE="$MYAPP_RELEASE_STORE_FILE" \
    -PMYAPP_RELEASE_STORE_PASSWORD="$MYAPP_RELEASE_STORE_PASSWORD" \
    -PMYAPP_RELEASE_KEY_ALIAS="$MYAPP_RELEASE_KEY_ALIAS" \
    -PMYAPP_RELEASE_KEY_PASSWORD="$MYAPP_RELEASE_KEY_PASSWORD"

echo ""
echo "✅ Build complete!"
echo ""
echo "📱 AAB location:"
echo "   android/app/build/outputs/bundle/release/app-release.aab"
echo ""
echo "📄 Deobfuscation (mapping) file (upload in Play Console for crash reports):"
echo "   android/app/build/outputs/mapping/release/mapping.txt"
echo ""
echo "🔍 To verify the signature, run:"
echo "   jarsigner -verify -verbose -certs android/app/build/outputs/bundle/release/app-release.aab"
echo ""
