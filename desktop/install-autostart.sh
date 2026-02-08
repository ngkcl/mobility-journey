#!/bin/bash

# Install script for Posture Monitor LaunchAgent
# This enables the app to auto-start on login

PLIST_NAME="com.posture.monitor.plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_SOURCE="$(cd "$(dirname "$0")" && pwd)/$PLIST_NAME"
PLIST_DEST="$LAUNCH_AGENTS_DIR/$PLIST_NAME"

echo "Installing Posture Monitor auto-start..."

# Create LaunchAgents directory if it doesn't exist
if [ ! -d "$LAUNCH_AGENTS_DIR" ]; then
    echo "Creating LaunchAgents directory..."
    mkdir -p "$LAUNCH_AGENTS_DIR"
fi

# Check if plist source exists
if [ ! -f "$PLIST_SOURCE" ]; then
    echo "Error: $PLIST_NAME not found in current directory"
    exit 1
fi

# Copy plist to LaunchAgents directory
echo "Copying plist to $LAUNCH_AGENTS_DIR..."
cp "$PLIST_SOURCE" "$PLIST_DEST"

# Load the LaunchAgent
echo "Loading LaunchAgent..."
launchctl load "$PLIST_DEST"

# Check if load was successful
if [ $? -eq 0 ]; then
    echo "✓ Posture Monitor auto-start installed successfully"
    echo "The app will now start automatically when you log in"
else
    echo "✗ Failed to load LaunchAgent"
    exit 1
fi
