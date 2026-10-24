# The editor as a real app: the built page and its API on one small Node server (server/main.ts).
# Code changes need a rebuild: ./start.sh --build
FROM node:24-bookworm-slim

WORKDIR /workspace/app
RUN chown node:node /workspace/app
USER node
# Made here so the claude-home volume mounted on it belongs to node, not root.
RUN mkdir -p /home/node/.claude

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY --chown=node:node . .
RUN npm run build

# Inside the container it must listen on every address; docker-compose.yml only publishes it to this computer.
ENV HOST=0.0.0.0
CMD ["node", "server/main.ts"]
