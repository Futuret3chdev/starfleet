#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
NODE_DIR="/tmp/node-v22.16.0-darwin-x64"
NODE="$NODE_DIR/bin/node"
ARCH="$(uname -m)"
TARBALL="node-v22.16.0-darwin-x64.tar.gz"
if [ "$ARCH" = "arm64" ]; then
  NODE_DIR="/tmp/node-v22.16.0-darwin-arm64"
  NODE="$NODE_DIR/bin/node"
  TARBALL="node-v22.16.0-darwin-arm64.tar.gz"
fi
if [ ! -x "$NODE" ]; then
  echo "Node.js not found — downloading portable v22.16.0..."
  curl -fsSL "https://nodejs.org/dist/v22.16.0/$TARBALL" -o "/tmp/$TARBALL"
  tar -xzf "/tmp/$TARBALL" -C /tmp
  rm -f "/tmp/$TARBALL"
fi
export PATH="$NODE_DIR/bin:${PATH:-/usr/bin:/bin}"
exec "$NODE" "$ROOT/sync.js" "${1:-Update Starfeet}"