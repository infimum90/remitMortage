#!/bin/bash
set -e

# Change directory to workspace root
cd "$(dirname "$0")/.."

NETWORK="testnet"

# Load deployed contract IDs
if [ ! -f ".env.deployed" ]; then
    echo "⚠️  .env.deployed not found! Please run scripts/deploy-testnet.sh first."
    exit 1
fi

source .env.deployed

# The testnet USDC token address can be provided via environment variable, or fallback to a standard mock one
USDC_TOKEN_ID="${USDC_TOKEN_ID:-CCW65FM7TA24VK724JE5SJLPT4SCA7F647E6S5JJKMJT2E2E6S5SJL36}"
IDENTITY="${DEPLOYER_IDENTITY:-deployer}"

echo "=========================================="
echo "⚙️  Initializing Contracts on Testnet..."
echo "Network: $NETWORK"
echo "USDC Token: $USDC_TOKEN_ID"
echo "Admin/Deployer Identity: $IDENTITY"
echo "=========================================="

# Fetch the admin's public key address
if command -v stellar &> /dev/null; then
    ADMIN_ADDRESS=$(stellar keys address "$IDENTITY" 2>/dev/null || echo "$IDENTITY")
else
    echo "⚠️  Stellar CLI not found. Please install it."
    exit 1
fi
echo "Admin Address: $ADMIN_ADDRESS"

# 1. Initialize Escrow Contract
echo "Initializing Escrow..."
# savings_target = 10,000 USDC (in stroops: 10,000 * 10,000,000 = 100,000,000,000)
# max_duration_ledgers = 518400 ledgers
# penalties: tier1=5%, tier2=3%, tier3=1.5%, tier4=0.5% (in bps: 500, 300, 150, 50)
stellar contract invoke \
  --id "$ESCROW_CONTRACT_ID" \
  --source-account "$IDENTITY" \
  --network "$NETWORK" \
  -- initialize \
  --admin "$ADMIN_ADDRESS" \
  --token "$USDC_TOKEN_ID" \
  --savings_target 100000000000 \
  --max_duration_ledgers 518400 \
  --penalty_bps_tier1 500 \
  --penalty_bps_tier2 300 \
  --penalty_bps_tier3 150 \
  --penalty_bps_tier4 50

# 2. Initialize Lending Pool Contract
echo "Initializing Lending Pool..."
# interest_rate_bps = 800 (8.00% annual interest)
stellar contract invoke \
  --id "$LENDING_POOL_CONTRACT_ID" \
  --source-account "$IDENTITY" \
  --network "$NETWORK" \
  -- initialize \
  --admin "$ADMIN_ADDRESS" \
  --token "$USDC_TOKEN_ID" \
  --interest_rate_bps 800

# 3. Initialize Milestone Contract
echo "Initializing Milestone..."
# Configures admin, USDC token, and the linked lending pool
stellar contract invoke \
  --id "$MILESTONE_CONTRACT_ID" \
  --source-account "$IDENTITY" \
  --network "$NETWORK" \
  -- initialize \
  --admin "$ADMIN_ADDRESS" \
  --token "$USDC_TOKEN_ID" \
  --lending_pool "$LENDING_POOL_CONTRACT_ID"

echo "=========================================="
echo "✅ All Contracts Successfully Initialized!"
echo "=========================================="
