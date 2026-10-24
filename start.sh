#!/usr/bin/env sh
# Starts everything (docker compose up -d) and prints where to open the editor.
set -e
cd "$(dirname "$0")"
PORT="${EDITOR_PORT:-5199}"
URL="http://localhost:$PORT"

# Create the data folders first, so Docker doesn't make them owned by root.
mkdir -p solutions notes playground problems logs

# The Claude panel signs in with a long-lived token from `claude setup-token`, kept in .env (never committed).
if ! grep -qs '^CLAUDE_CODE_OAUTH_TOKEN=.' .env; then
  echo "The Claude panel needs a login token (once). In another terminal run:"
  echo
  echo "    claude setup-token"
  echo
  if [ -t 0 ]; then
    printf 'Then paste the token here (it stays hidden; press Enter to skip): '
    stty -echo 2>/dev/null || true
    read -r token || token=''
    stty echo 2>/dev/null || true
    echo
    if [ -n "$token" ]; then
      touch .env && chmod 600 .env
      printf 'CLAUDE_CODE_OAUTH_TOKEN=%s\n' "$token" >> .env
      echo "Saved to .env."
    else
      echo "Skipped: everything else works, and the Claude panel will say it isn't signed in."
    fi
  else
    echo "Then add CLAUDE_CODE_OAUTH_TOKEN=<token> to .env and run ./start.sh again."
  fi
  echo
fi

docker compose up -d "$@"

printf 'Waiting for the editor'
i=0
until curl -fs -o /dev/null "$URL"; do
  i=$((i + 1))
  if [ "$i" -ge 120 ]; then
    echo; echo "The editor didn't start. See: docker compose logs editor"
    exit 1
  fi
  printf '.'
  sleep 1
done
echo

if [ "$(docker inspect -f '{{.State.Running}}' "$(docker compose ps -aq piston-setup)" 2>/dev/null)" = "true" ]; then
  echo "Installing C++, Java and Python (first time only, a few minutes)."
  echo "Running code works once it's done: docker compose logs -f piston-setup"
fi

printf '\n  ➜  Editor ready at \033[1;35m%s\033[0m\n\n' "$URL"
