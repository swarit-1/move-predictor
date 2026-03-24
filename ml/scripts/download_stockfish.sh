#!/bin/bash
# Download and install Stockfish binary for the current platform.

set -e

STOCKFISH_VERSION="17"
INSTALL_DIR="${1:-data/stockfish}"
mkdir -p "$INSTALL_DIR"

OS=$(uname -s)
ARCH=$(uname -m)

case "$OS" in
    Linux)
        if [ "$ARCH" = "x86_64" ]; then
            URL="https://github.com/official-stockfish/Stockfish/releases/download/sf_${STOCKFISH_VERSION}/stockfish-ubuntu-x86-64-avx2.tar"
        else
            URL="https://github.com/official-stockfish/Stockfish/releases/download/sf_${STOCKFISH_VERSION}/stockfish-ubuntu-x86-64.tar"
        fi
        ;;
    Darwin)
        URL="https://github.com/official-stockfish/Stockfish/releases/download/sf_${STOCKFISH_VERSION}/stockfish-macos-m1-apple-silicon.tar"
        if [ "$ARCH" = "x86_64" ]; then
            URL="https://github.com/official-stockfish/Stockfish/releases/download/sf_${STOCKFISH_VERSION}/stockfish-macos-x86-64-avx2.tar"
        fi
        ;;
    *)
        echo "Unsupported OS: $OS"
        exit 1
        ;;
esac

echo "Downloading Stockfish ${STOCKFISH_VERSION} for ${OS} ${ARCH}..."
curl -L "$URL" -o "$INSTALL_DIR/stockfish.tar"
cd "$INSTALL_DIR"
tar xf stockfish.tar
rm stockfish.tar

# Find the binary
BINARY=$(find . -name "stockfish" -type f | head -1)
if [ -n "$BINARY" ]; then
    chmod +x "$BINARY"
    echo "Stockfish installed at: $(pwd)/$BINARY"
    echo ""
    echo "Set STOCKFISH_PATH=$(pwd)/$BINARY in your .env file"
else
    echo "Warning: Could not find stockfish binary after extraction"
    ls -la
fi
