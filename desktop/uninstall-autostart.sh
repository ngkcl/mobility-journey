#!/bin/bash

# Uninstall script for Posture Monitor LaunchAgent
# This disables the app auto-start on login

PLIST_NAME="com.posture.monitor.plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_DEST="$LAUNCH_AGENTS_DIR/$PLIST_NAME"

echo "Uninstalling Posture Monitor auto-start..."

# Check if plist exists
if [ ! -f "$PLIST_DEST" ]; then
    echo "LaunchAgent not found. It may already be uninstalled."
    exit 0
fi

# Unload the LaunchAgent
echo "Unloading LaunchAgent..."
launchctl unload "$PLIST_DEST"

# Remove the plist file
echo "Removing plist file..."
rm "$PLIST_DEST"

# Check if removal was successful
if [ ! -f "$PLIST_DEST" ]; then
    echo "✓ Posture Monitor auto-start uninstalled successfully"
    echo "The app will no longer start automatically on login"
else
    echo "✗ Failed to remove plist file"
    exit 1
fi
