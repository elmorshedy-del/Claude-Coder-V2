#!/bin/bash
# Start dev server + auto-sync

echo "🚀 Starting dev server and auto-sync..."

# Start auto-sync in background
./auto-sync.sh &
SYNC_PID=$!

# Start dev server on port 3000
PORT=3000 npm run dev

# Kill auto-sync when dev server stops
kill $SYNC_PID
