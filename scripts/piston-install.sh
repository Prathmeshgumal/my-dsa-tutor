#!/usr/bin/env sh
# Installs the C++, Java and Python runtimes into Piston. Safe to run again: installed ones are skipped.
# Runs automatically with `docker compose up`; by hand: ./scripts/piston-install.sh
PISTON="${PISTON_URL:-http://127.0.0.1:2000}"

echo "Waiting for Piston at $PISTON…"
i=0
until packages=$(curl -fsS "$PISTON/api/v2/packages" 2>/dev/null); do
  i=$((i + 1))
  [ "$i" -ge 60 ] && echo "Piston didn't answer after 60s." && exit 1
  sleep 1
done

for pkg in 'gcc 10.2.0' 'java 15.0.2' 'python 3.12.0'; do
  set -- $pkg
  if echo "$packages" | tr '}' '\n' | grep -F "\"language\":\"$1\",\"language_version\":\"$2\",\"installed\":true" >/dev/null; then
    echo "$1 $2 already installed"
    continue
  fi
  echo "Installing $1 $2 (first time only, can take a few minutes)…"
  curl -fsS -X POST "$PISTON/api/v2/packages" -H 'Content-Type: application/json' \
    -d "{\"language\":\"$1\",\"version\":\"$2\"}" >/dev/null && echo "  done" || echo "  failed"
done
