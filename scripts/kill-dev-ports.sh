#!/usr/bin/env bash
# Free ports used by Metro / Expo so a fresh `expo start` can bind.
set -euo pipefail
PORTS=(8081 8082 19000 19001 19002)
for p in "${PORTS[@]}"; do
  pids=$(lsof -ti ":$p" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "Killing PID(s) on port $p: $pids"
    kill -9 $pids 2>/dev/null || true
  else
    echo "Port $p: free"
  fi
done
echo "Done."
