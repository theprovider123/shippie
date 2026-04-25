# Shippie Hub — local-mesh + model-cache container.
#
# Two stages:
#   1. builder — installs deps with bun, copies sources.
#   2. runtime — minimal alpine + bun binary, only what's needed to run.
#
# Build:  docker build -t shippie/hub -f services/hub/Dockerfile .
# Run:    docker run --rm -p 80:80 -v shippie-hub-data:/var/lib/shippie-hub \
#                  --name shippie-hub shippie/hub
#
# The container is internal-network only by design. Only outbound:
#   - the model cache fetching from ai.shippie.app on miss.

FROM oven/bun:1.3-alpine AS builder
WORKDIR /app

# Workspace manifests first — keeps layer caching tight.
COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY services/hub/package.json services/hub/
COPY packages/ packages/

RUN bun install --frozen-lockfile

# Sources
COPY services/hub/ services/hub/

FROM oven/bun:1.3-alpine AS runtime
WORKDIR /app

# Pull only the bits we need to run.
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/services/hub /app/services/hub
COPY --from=builder /app/packages /app/packages
COPY --from=builder /app/package.json /app/bun.lock /app/tsconfig.base.json /app/

ENV HUB_PORT=80
ENV HUB_HOST=0.0.0.0
ENV HUB_CACHE_ROOT=/var/lib/shippie-hub

VOLUME ["/var/lib/shippie-hub"]
EXPOSE 80

# bun runs the .ts entry point directly — no bundling step required.
CMD ["bun", "run", "services/hub/src/index.ts"]
