#!/bin/bash
# Generate and send Expo QR code to Nick via Telegram
# Usage: ./scripts/send-qr.sh [expo_url]
# If no URL provided, tries to extract from running expo process

URL="${1:-}"

if [ -z "$URL" ]; then
  # Try to find the tunnel URL from expo output
  URL=$(ps aux | grep "exp://" | grep -v grep | head -1 | grep -oE 'exp://[^ ]+')
fi

if [ -z "$URL" ]; then
  echo "No Expo URL found. Pass it as argument or start expo first."
  exit 1
fi

echo "Generating QR for: $URL"

python3 -c "
import qrcode
img = qrcode.make('$URL')
img.save('/tmp/expo-qr.png')
print('QR saved to /tmp/expo-qr.png')
"

echo "Done. Send /tmp/expo-qr.png to Nick via Telegram."
