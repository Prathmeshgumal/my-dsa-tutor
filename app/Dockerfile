# The editor as a real app: the built page and its API on one small Node server (packages/server/src/main.ts).
# Code changes need a rebuild: ./start.sh --build
FROM node:24-bookworm-slim

WORKDIR /workspace/app
RUN chown node:node /workspace/app
USER node
# Made here so the claude-home volume mounted on it belongs to node, not root.
RUN mkdir -p /home/node/.claude

# Every package's package.json first, so npm ci installs them all and the install is reused until they change.
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node packages/core/package.json packages/core/
COPY --chown=node:node packages/server/package.json packages/server/
COPY --chown=node:node packages/web/package.json packages/web/
RUN npm ci --no-audit --no-fund

COPY --chown=node:node . .
RUN npm run build

# Inside the container it must listen on every address; docker-compose.yml only publishes it to this computer.
ENV HOST=0.0.0.0
CMD ["node", "packages/server/src/main.ts"]
