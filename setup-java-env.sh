#!/bin/bash

# Script to set up JAVA_HOME after Java installation
# Run this after installing Java 17

echo "Setting up Java environment..."

# Try to find Java 17
JAVA_HOME_PATH=$(/usr/libexec/java_home -v 17 2>/dev/null)

if [ -z "$JAVA_HOME_PATH" ]; then
    echo "Java 17 not found. Trying Java 21..."
    JAVA_HOME_PATH=$(/usr/libexec/java_home -v 21 2>/dev/null)
fi

if [ -z "$JAVA_HOME_PATH" ]; then
    echo "Java 17 or 21 not found. Trying any Java version..."
    JAVA_HOME_PATH=$(/usr/libexec/java_home 2>/dev/null)
fi

if [ -n "$JAVA_HOME_PATH" ]; then
    echo "Found Java at: $JAVA_HOME_PATH"
    
    # Add to .zshrc if not already there
    if ! grep -q "JAVA_HOME" ~/.zshrc 2>/dev/null; then
        echo "" >> ~/.zshrc
        echo "# Java configuration" >> ~/.zshrc
        echo "export JAVA_HOME=\$(/usr/libexec/java_home -v 17 2>/dev/null || /usr/libexec/java_home -v 21 2>/dev/null || /usr/libexec/java_home)" >> ~/.zshrc
        echo "export PATH=\$JAVA_HOME/bin:\$PATH" >> ~/.zshrc
        echo "Added JAVA_HOME to ~/.zshrc"
    else
        echo "JAVA_HOME already configured in ~/.zshrc"
    fi
    
    # Set for current session
    export JAVA_HOME="$JAVA_HOME_PATH"
    export PATH="$JAVA_HOME/bin:$PATH"
    
    echo ""
    echo "Java version:"
    java -version
    
    echo ""
    echo "JAVA_HOME: $JAVA_HOME"
    echo ""
    echo "To use in current terminal, run:"
    echo "  source ~/.zshrc"
    echo ""
    echo "Or manually set:"
    echo "  export JAVA_HOME=$JAVA_HOME_PATH"
    echo "  export PATH=\$JAVA_HOME/bin:\$PATH"
else
    echo "ERROR: Java not found. Please install Java 17 or higher first."
    echo ""
    echo "If you just installed Java, try:"
    echo "  1. Close and reopen your terminal"
    echo "  2. Run this script again"
    exit 1
fi

