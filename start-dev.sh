#!/bin/bash
cd /home/z/my-project

# Ensure the database exists before starting the server.
# If db/custom.db is missing, create it with prisma db push + seed.
if [ ! -f db/custom.db ]; then
  echo "Database file not found — creating..."
  mkdir -p db
  export DATABASE_URL="file:/home/z/my-project/db/custom.db"
  bun run db:push 2>/dev/null
  bun run db:seed 2>/dev/null
  echo "Database created and seeded."
fi

export DATABASE_URL="file:/home/z/my-project/db/custom.db"
exec ./node_modules/.bin/next dev -p 3000 > /home/z/my-project/dev.log 2>&1
