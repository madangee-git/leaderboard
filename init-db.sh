#!/bin/sh
set -e

echo "Initializing database..."

# Wait for PostgreSQL to be ready
until PGPASSWORD=$(cat /run/secrets/db_password) pg_isready -h db -U user; do
    echo "Waiting for PostgreSQL to start..."
    sleep 2
done

# Connect and create schema
#PGPASSWORD=$(cat /run/secrets/db_password) psql -U user -d leaderboard -f /docker-entrypoint-initdb.d/schema.sql

echo "Database initialized!"