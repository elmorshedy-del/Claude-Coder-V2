#!/bin/bash
# Auto-pull from GitHub every 30 seconds

while true; do
  git fetch origin main
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse origin/main)
  
  if [ $LOCAL != $REMOTE ]; then
    echo "🔄 New changes detected, pulling..."
    git pull
    echo "✅ Synced at $(date)"
  fi
  
  sleep 30
done
