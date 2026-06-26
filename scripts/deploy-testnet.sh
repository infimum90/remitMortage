#!/bin/bash
set -e

# Change directory to workspace root
cd "$(dirname "$0")/.."

# Set deployment identity or fallback to default
IDENTITY="${1:-${DEPLOYER_IDENTITY:-"deployer"}}"
NETWORK="testnet"

echo "=========================================="
echo "🚀 Deploying Contracts to Stellar Testnet..."
echo "Using Identity: $IDENTITY"
echo "=========================================="

# Check for optimized WASM files
if [ ! -f "target/wasm32-unknown-unknown/release/escrow.optimized.wasm" ] || \
   [ ! -f "target/wasm32-unknown-unknown/release/lending_pool.optimized.wasm" ] || \
   [ ! -f "target/wasm32-unknown-unknown/release/milestone.optimized.wasm" ]; then
    echo "WASM files not optimized. Running build.sh first..."
    ./scripts/build.sh
fi

# Ensure identity is funded / generated if it does not exist
if command -v stellar &> /dev/null; then
    echo "Checking identity/key..."
    # Attempt to read address, generate if missing
    if ! stellar keys address "$IDENTITY" &> /dev/null; then
        echo "Identity '$IDENTITY' not found. Generating and funding key..."
        stellar keys generate --network "$NETWORK" "$IDENTITY"
    fi
else
    echo "⚠️  Stellar CLI not found. Please install it."
    exit 1
fi

echo "Deploying Escrow..."
ESCROW_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/escrow.optimized.wasm \
  --source-account "$IDENTITY" \
  --network "$NETWORK")
echo "Escrow deployed! ID: $ESCROW_ID"

echo "Deploying Lending Pool..."
LENDING_POOL_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/lending_pool.optimized.wasm \
  --source-account "$IDENTITY" \
  --network "$NETWORK")
echo "Lending Pool deployed! ID: $LENDING_POOL_ID"

echo "Deploying Milestone..."
MILESTONE_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/milestone.optimized.wasm \
  --source-account "$IDENTITY" \
  --network "$NETWORK")
echo "Milestone deployed! ID: $MILESTONE_ID"

# Save contract IDs to .env.deployed file in root
DEPLOYED_ENV=".env.deployed"
echo "# RemitMortgage Deployed Contracts" > "$DEPLOYED_ENV"
echo "ESCROW_CONTRACT_ID=$ESCROW_ID" >> "$DEPLOYED_ENV"
echo "LENDING_POOL_CONTRACT_ID=$LENDING_POOL_ID" >> "$DEPLOYED_ENV"
echo "MILESTONE_CONTRACT_ID=$MILESTONE_ID" >> "$DEPLOYED_ENV"
echo "DEPLOYER_IDENTITY=$IDENTITY" >> "$DEPLOYED_ENV"

echo "=========================================="
echo "✅ Deployment Succeeded!"
echo "IDs saved to $DEPLOYED_ENV"
echo "=========================================="
