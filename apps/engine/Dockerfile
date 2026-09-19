# Imagen para el engine. Railway tambien puede construir sin Dockerfile
# (Nixpacks detecta Node), pero esto deja el build reproducible.
FROM node:20-slim

WORKDIR /app

# Dependencias del monorepo (se aprovecha la cache de capas)
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/engine/package.json ./apps/engine/package.json
RUN npm install --omit=dev --workspaces --include-workspace-root || npm install

# Codigo
COPY packages/shared ./packages/shared
COPY apps/engine ./apps/engine

ENV NODE_ENV=production
WORKDIR /app/apps/engine
CMD ["npm", "start"]
