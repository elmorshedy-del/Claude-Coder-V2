#!/bin/bash
# Start dev server + auto-sync

set -e  # Exit on error

echo "🚀 Starting dev server and auto-sync..."

# Cleanup function
cleanup() {
  echo "\n🛑 Shutting down..."
  if [ ! -z "$SYNC_PID" ] && kill -0 "$SYNC_PID" 2>/dev/null; then
    kill "$SYNC_PID" 2>/dev/null || true
  fi
  exit 0
}

# Set trap for cleanup
trap cleanup INT TERM EXIT

# Start auto-sync in background
if [ -x "./auto-sync.sh" ]; then
  ./auto-sync.sh &
  SYNC_PID=$!
else
  echo "⚠️ auto-sync.sh not found or not executable"
fi

# Start dev server on port 3000
if ! PORT=3000 npm run dev; then
  echo "❌ Failed to start dev server" >&2
  exit 1
fi
