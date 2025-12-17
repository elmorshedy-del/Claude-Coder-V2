#!/bin/bash
# Auto-pull from GitHub every 30 seconds

while true; do
  if ! git fetch origin main 2>/dev/null; then
    echo "❌ Failed to fetch from origin" >&2
    sleep 30
    continue
  fi
  
  LOCAL=$(git rev-parse HEAD 2>/dev/null) || { echo "❌ Failed to get local HEAD" >&2; sleep 30; continue; }
  REMOTE=$(git rev-parse origin/main 2>/dev/null) || { echo "❌ Failed to get remote HEAD" >&2; sleep 30; continue; }
  
  if [ "$LOCAL" != "$REMOTE" ]; then
    echo "🔄 New changes detected, pulling..."
    if git pull 2>/dev/null; then
      echo "✅ Synced at $(date)"
    else
      echo "❌ Failed to pull changes" >&2
    fi
  fi
  
  sleep 30
done
