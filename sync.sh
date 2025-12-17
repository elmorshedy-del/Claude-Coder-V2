#!/bin/bash
# Auto-sync with GitHub

echo "📥 Pulling latest changes from GitHub..."
if git pull; then
  echo "✅ Done! Your Mac is synced with GitHub."
else
  echo "❌ Error: Failed to sync with GitHub. Check your connection and try again."
  exit 1
fi
