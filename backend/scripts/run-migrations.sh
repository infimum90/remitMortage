#!/bin/sh
set -e

echo "Waiting for postgres..."
until pg_isready -h postgres -p 5432 -U remituser; do
  echo "Postgres is unavailable - sleeping"
  sleep 2
done

echo "Postgres is up - executing migrations"
npx prisma migrate deploy

echo "Running database seed..."
if npm run | grep -q "db:seed"; then
  npm run db:seed
else
  echo "No db:seed script found, skipping."
fi

echo "Database preparation completed."
