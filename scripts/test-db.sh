#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
container="mukmuk-tests-$$"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
docker run --detach --rm --name "$container" -p 127.0.0.1::5432 --env POSTGRES_HOST_AUTH_METHOD=trust postgres:17 >/dev/null
for attempt in {1..30}; do
  if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
for file in supabase/tests/bootstrap.sql supabase/migrations/20261014000002_mukmuk_foundation.sql supabase/tests/mukmuk_foundation.sql; do
  docker exec -i "$container" psql -X -U postgres -v ON_ERROR_STOP=1 < "$file" >/dev/null
done
port=$(docker inspect -f '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}' "$container")
docker exec "$container" psql -X -U postgres -v ON_ERROR_STOP=1 -c 'ALTER ROLE mukmuk_worker LOGIN; ALTER ROLE anon LOGIN;' >/dev/null
python3 - <<'PY' | docker exec -i "$container" psql -X -U postgres -v ON_ERROR_STOP=1 >/dev/null
from pathlib import Path
source=Path('supabase/migrations/20261014000004_mukmuk_signed_cleanup.sql').read_text()
start=source.index('SET LOCAL ROLE mukmuk_owner;')
end=source.index('RESET ROLE;')+len('RESET ROLE;')
print('BEGIN;\n'+source[start:end]+'\nCOMMIT;')
PY
docker exec -i "$container" psql -X -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261014000005_mukmuk_channel_secrets.sql >/dev/null
docker exec -i "$container" psql -X -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261014000007_mukmuk_weekly_code_worker_access.sql >/dev/null
docker exec -i "$container" psql -X -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261016000002_mukmuk_photo_metadata.sql >/dev/null
docker exec -i "$container" psql -X -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261017000001_mukmuk_workout_refresh.sql >/dev/null
TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:$port/postgres" uv run pytest
TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:$port/postgres" deno test --allow-env --allow-net=127.0.0.1 supabase/tests/cleanup_queue_test.ts
TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:$port/postgres" deno test --allow-env --allow-net=127.0.0.1 supabase/tests/secrets_rpc_test.ts
docker exec -i "$container" psql -X -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261015000001_mukmuk_dashboard_paging.sql >/dev/null
TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:$port/postgres" deno test --allow-env --allow-net=127.0.0.1 supabase/tests/dashboard_rpc_test.ts
