#!/usr/bin/env sh
# Starts everything (docker compose up -d) and prints where to open the editor.
set -e
cd "$(dirname "$0")"
PORT="${EDITOR_PORT:-5199}"
URL="http://localhost:$PORT"

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
