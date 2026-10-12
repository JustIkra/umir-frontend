#!/bin/sh
# Starts nginx.conf in the pinned Nginx image with a gateway stand-in and checks the API proxy.
set -eu
cd "$(dirname "$0")"
image() { awk -v prefix="$1" '$1 == "FROM" { for (i = 2; i <= NF; i++) if (index($i, prefix) == 1) print $i }' ../../Dockerfile; }
NGINX_IMAGE=$(image nginxinc/)
NODE_IMAGE=$(image node:)
export NGINX_IMAGE NODE_IMAGE
compose() { docker compose -f compose.yaml "$@"; }
trap 'compose down --volumes --remove-orphans >/dev/null 2>&1' EXIT
compose up -d --quiet-pull
if ! node check.mjs; then
  compose logs
  exit 1
fi
