#!/bin/sh
set -e

# Run necessary Django setup tasks before starting the server
python manage.py collectstatic --noinput
python manage.py migrate --noinput

exec "$@"
