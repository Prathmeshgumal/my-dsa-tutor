#!/usr/bin/env sh
# Starts everything (docker compose up -d) and prints where to open the editor and the notes.
set -e
cd "$(dirname "$0")"
PORT="${EDITOR_PORT:-5199}"
URL="http://localhost:$PORT"
NOTES_URL="http://localhost:${NOTES_PORT:-5200}"

# Create the data folders first, so Docker doesn't make them owned by root.
mkdir -p solutions notes playground problems logs state

# The Claude panel signs in from the editor (⚙️ Setup → Sign in to Claude); an old setup-token login isn't used.
if grep -qs '^CLAUDE_CODE_OAUTH_TOKEN=.' .env; then
  echo "Note: CLAUDE_CODE_OAUTH_TOKEN in .env isn't used any more. Sign in from ⚙️ Setup in the editor instead,"
  echo "and delete that line from .env."
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

printf '\n  ➜  Editor ready at \033[1;35m%s\033[0m\n' "$URL"
if curl -fs -o /dev/null "$NOTES_URL"; then
  printf '  ➜  Notes ready at  \033[1;35m%s\033[0m\n\n' "$NOTES_URL"
else
  printf "  ➜  Notes not up yet: docker compose logs pocketpay-notes\n\n"
fi
