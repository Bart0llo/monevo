// Docker HEALTHCHECK: exits 0 when readiness answers 200 (docker-compose.md#runtime-properties).
// Reads only PORT so it works without the full configuration.

const port = process.env['PORT'] ?? '3000';

try {
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/health/ready`, {
    signal: AbortSignal.timeout(4_000),
  });
  process.exit(response.ok ? 0 : 1);
} catch {
  process.exit(1);
}
