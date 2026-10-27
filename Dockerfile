# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
RUN npm run prisma:generate
COPY src ./src
RUN npm run build

FROM node:22-alpine AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=peer && npm cache clean --force

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Runtime starts with node directly; keep npm and its dependency tree in build stages only.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
  && addgroup -S app && adduser -S -G app app
COPY --from=production-dependencies --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=app:app /app/dist ./dist
COPY --chown=app:app package.json ./package.json

USER app
EXPOSE 3000 9100
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health/live >/dev/null || exit 1

CMD ["node", "--import", "./dist/instrumentation.js", "dist/server.js"]

