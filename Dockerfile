# ---- dependencies ----
FROM oven/bun:1 AS deps

WORKDIR /app

# better-sqlite3 falls back to node-gyp when no matching prebuilt binary exists.
# Keep the compiler toolchain in the build stage only.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        make \
        g++ \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHON=/usr/bin/python3

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---- application build ----
FROM deps AS builder

WORKDIR /app
COPY . .
RUN bun run build

# ---- runtime ----
# Use Bun consistently across build and runtime so native dependencies and the
# package runner do not cross incompatible runtimes.
FROM oven/bun:1 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV BUN_INSTALL=/root/.bun
ENV PATH="/root/.bun/bin:${PATH}"

# nixpacks is used by the MYTHIC deployment engine to detect and build user repos.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
    && bun install -g nixpacks \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000
CMD ["bun", "run", "start"]
