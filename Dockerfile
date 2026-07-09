# ---- deps ----
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---- build ----
FROM deps AS builder
WORKDIR /app
COPY . .
RUN bun run build

# ---- runtime ----
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# nixpacks is used by the deployment engine to detect & build user repos.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git && \
    curl -fsSL https://bun.sh/install | bash && \
    export PATH="$HOME/.bun/bin:$PATH" && \
    bun install -g nixpacks && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000
CMD ["bun", "run", "start"]
