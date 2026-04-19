#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "${SCRIPT_DIR}/.env" ]; then
  export $(grep -v '^#' "${SCRIPT_DIR}/.env" | xargs)
fi

if [ -z "${ACTIONS_API_KEY:-}" ]; then
  echo "ACTIONS_API_KEY is not set. Cannot run full sync."
  exit 1
fi

curl -sS -X POST "http://localhost:3000/v1/assistant/sync" \
  -H "Content-Type: application/json" \
  -H "x-corpus-key: ${ACTIONS_API_KEY}" \
  -d '{"days":90}'
