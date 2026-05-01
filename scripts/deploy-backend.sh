#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/astralmarket}"
SERVICE_NAME="${SERVICE_NAME:-astralmarket-backend}"

cd "$APP_DIR"

corepack enable
pnpm install --frozen-lockfile
pnpm --filter backend build
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl is-active --quiet "$SERVICE_NAME"
