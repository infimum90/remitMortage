#!/bin/bash
set -e

# Change directory to workspace root if running from elsewhere
cd "$(dirname "$0")/.."

echo "=========================================="
echo "🔨 Building Soroban Contracts in Release..."
echo "=========================================="
cargo build --target wasm32-unknown-unknown --release

echo "=========================================="
echo "✨ Optimizing WASM Binaries..."
echo "=========================================="

# Ensure output directory exists
mkdir -p target/wasm32-unknown-unknown/release

# Check if Stellar CLI is installed
if ! command -v stellar &> /dev/null; then
    echo "⚠️  Stellar CLI not found. Please install the Stellar CLI to run optimization."
    exit 1
fi

# Optimize Escrow
echo "Optimizing escrow..."
stellar contract optimize \
  --wasm target/wasm32-unknown-unknown/release/escrow.wasm \
  --output-dir target/wasm32-unknown-unknown/release/

# Optimize Lending Pool
echo "Optimizing lending pool..."
stellar contract optimize \
  --wasm target/wasm32-unknown-unknown/release/lending_pool.wasm \
  --output-dir target/wasm32-unknown-unknown/release/

# Optimize Milestone
echo "Optimizing milestone..."
stellar contract optimize \
  --wasm target/wasm32-unknown-unknown/release/milestone.wasm \
  --output-dir target/wasm32-unknown-unknown/release/

echo "=========================================="
echo "✅ Soroban Build and Optimization Complete!"
echo "=========================================="
