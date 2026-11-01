# The notes site, built once and served as plain files. Content changes need a rebuild: ./start.sh --build

FROM node:24-bookworm-slim AS build
WORKDIR /notes
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Caddy serves dist/; the Caddyfile sends unknown paths to index.html so links like /day-1/ledger work.
FROM caddy:2.11.6-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /notes/dist /srv
