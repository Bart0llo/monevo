# Monevo application image (docs/infrastructure/docker-compose.md#1-image).
# One container: static web app, REST API, realtime, and jobs. PostgreSQL is external (DATABASE_URL).

ARG NODE_IMAGE=node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
ARG PNPM_VERSION=12.21.0

# --- deps: download every package from the lockfile (cached until the lockfile changes) ---
FROM ${NODE_IMAGE} AS deps
ARG PNPM_VERSION
# Prisma picks its schema engine by the OpenSSL it detects at install time; the runtime has OpenSSL 3.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/* \
 && npm install --global --no-fund --no-audit "pnpm@${PNPM_VERSION}"
WORKDIR /src
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

# --- build: install offline, generate Prisma, build web and server, deploy the server ---
FROM deps AS build
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter @monevo/web build \
 && pnpm --filter @monevo/server build \
 && pnpm --filter @monevo/server deploy --prod --legacy /out

# --- runtime ---
FROM ${NODE_IMAGE} AS runtime
# PostgreSQL client tools of the newest supported major from PGDG, for pg_dump/pg_restore
# (docs/infrastructure/postgresql.md#backup-client-tools).
ADD --checksum=sha256:0144068502a1eddd2a0280ede10ef607d1ec592ce819940991203941564e8e76 \
    https://www.postgresql.org/media/keys/ACCC4CF8.asc /usr/share/keyrings/pgdg.asc
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tini \
 && chmod 0644 /usr/share/keyrings/pgdg.asc \
 && echo "deb [signed-by=/usr/share/keyrings/pgdg.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-18 \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data/attachments /data/backups \
 && chown -R 1000:1000 /data

# Release metadata (docs/development/releasing.md#docker-images). Declared after the apt layer so
# a new version or build date does not invalidate it.
ARG APP_VERSION=dev
ARG GIT_COMMIT=unknown
ARG BUILD_DATE=unknown
ARG SOURCE_URL=""

LABEL org.opencontainers.image.title="Monevo" \
      org.opencontainers.image.description="Self-hosted, offline-first personal finance PWA" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.source="${SOURCE_URL}" \
      org.opencontainers.image.url="${SOURCE_URL}"
# org.opencontainers.image.licenses is added once the license is chosen (OQ-17).

ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    GIT_COMMIT=${GIT_COMMIT} \
    BUILD_DATE=${BUILD_DATE} \
    CHECKPOINT_DISABLE=1

WORKDIR /app
COPY --from=build /out ./
COPY --from=build /src/apps/web/dist ./public
COPY docker-entrypoint.sh ./docker-entrypoint.sh

USER 1000:1000
EXPOSE 3000
VOLUME ["/data/attachments", "/data/backups"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --start-interval=5s --retries=3 \
  CMD ["node", "dist/healthcheck.js"]
ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker-entrypoint.sh"]
