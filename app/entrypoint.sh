#!/bin/sh
set -e

echo "Running database migrations..."
./node_modules/.bin/prisma migrate deploy

echo "Seeding admin account..."
./node_modules/.bin/tsx prisma/seed.ts

echo "Starting Next.js server..."
exec node server.js
