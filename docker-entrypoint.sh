#!/bin/sh
# Container entrypoint (docs/infrastructure/docker-compose.md#entrypoint), run by tini.
set -eu

# A command (e.g. `docker compose run --rm app node dist/cli.js …`) runs instead of the server.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

# Wait for the external database, check its version, and apply pending migrations.
node dist/cli.js migrate

exec node dist/main.js
