#!/usr/bin/env sh
# One-time setup: installs the C++, Java and Python runtimes into the local Piston container.
set -e
PISTON="${PISTON_URL:-http://127.0.0.1:2000}"

for pkg in 'gcc 10.2.0' 'java 15.0.2' 'python 3.12.0'; do
  set -- $pkg
  echo "Installing $1 $2…"
  curl -fsS -X POST "$PISTON/api/v2/packages" -H 'Content-Type: application/json' \
    -d "{\"language\":\"$1\",\"version\":\"$2\"}" || echo "  (already installed or failed — check: curl $PISTON/api/v2/runtimes)"
  echo
done
