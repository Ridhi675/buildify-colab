#!/bin/sh
# Production start: sync the DB schema, seed the demo once, start Next.js.
set -e
if [ -z "$AUTH_SECRET" ]; then
  echo "WARNING: AUTH_SECRET is not set; demo session tokens use an insecure default." >&2
fi
npx prisma db push --skip-generate
npx tsx scripts/seed-if-empty.ts
exec npx next start -p "${PORT:-3000}"
