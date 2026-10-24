# The editor: Vite dev server, which also serves the file-saving and Claude chat endpoints.
FROM node:24-bookworm-slim

WORKDIR /workspace/app
RUN chown node:node /workspace/app
USER node
# Made here so the claude-home volume mounted on it belongs to node, not root.
RUN mkdir -p /home/node/.claude

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# The source is mounted from the repo at runtime (see docker-compose.yml), so edits show up live.
# `npm install` on start picks up dependency changes without rebuilding the image.
CMD ["sh", "-c", "npm install --no-audit --no-fund --loglevel=error && exec npm run dev -- --host 0.0.0.0"]
