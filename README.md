# DSA Editor

A local, browser-based code editor for practising DSA in C++, Java and Python.

## Run it

```sh
# 1. Start the code runner (Docker), once per boot — it restarts automatically after that
docker compose up -d

# 2. First time only: install the C++, Java and Python runtimes into it
./scripts/piston-install.sh

# 3. Start the editor
cd app
npm install   # first time only
npm run dev   # then open the printed localhost URL
```

Code runs on [Piston](https://github.com/engineer-man/piston) in a local Docker
container (free, no API key). The dev server forwards `/piston` to it at
`127.0.0.1:2000`.

You can switch to Judge0 on RapidAPI (paid, needs an API key) in Settings (⚙️ in
the left bar).

## Shortcuts

| Keys | Action |
|---|---|
| ⌘/Ctrl + Enter | Run the current file |
| ⌘/Ctrl + K | Search files and commands |

## Develop

```sh
cd app
npm test        # unit tests
npm run build   # type-check and production build
```
