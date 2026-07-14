# ---- Bun-enabled Node base ----
# MYTHIC uses Bun as its package manager, but the application itself must run
# under Node because better-sqlite3 is not supported by the Bun runtime.
FROM node:24-slim AS bun-base

WORKDIR /app

ENV BUN_INSTALL=/root/.bun
ENV PATH="/root/.bun/bin:${PATH}"

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        unzip \
    && curl -fsSL https://bun.sh/install | bash \
    && bun --version \
    && node --version \
    && rm -rf /var/lib/apt/lists/*

# ---- dependencies ----
FROM bun-base AS deps

# better-sqlite3 falls back to node-gyp when no matching prebuilt binary exists.
# Build it against the same Node major and Debian base used by the runtime.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
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
FROM node:24-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Nixpacks is a standalone Rust CLI. It shells out to the Docker client for
# image builds, while the daemon is reached through the mounted host socket.
# Debian Bookworm publishes the client through docker.io; docker-cli is not a
# package in the base image's configured repositories.
ARG NIXPACKS_VERSION=1.41.0
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        tar \
        docker.io \
        libstdc++6 \
    && curl -sSL https://nixpacks.com/install.sh \
        | NIXPACKS_VERSION="${NIXPACKS_VERSION}" bash -s -- --yes \
    && nixpacks --version \
    && docker --version \
    && node --version \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0"]
