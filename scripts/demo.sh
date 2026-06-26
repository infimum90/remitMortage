#!/bin/bash
set -e

# Change directory to workspace root
cd "$(dirname "$0")/.."

NETWORK="testnet"

# Load deployed contract IDs
if [ ! -f ".env.deployed" ]; then
    echo "⚠️  .env.deployed not found! Please run scripts/deploy-testnet.sh and initialize.sh first."
    exit 1
fi

source .env.deployed

# Config USDC token or fallback
USDC_TOKEN_ID="${USDC_TOKEN_ID:-CCW65FM7TA24VK724JE5SJLPT4SCA7F647E6S5JJKMJT2E2E6S5SJL36}"
ADMIN_IDENTITY="${DEPLOYER_IDENTITY:-deployer}"

echo "=========================================="
echo "🎬 Running RemitMortgage Demo Simulator..."
echo "Network: $NETWORK"
echo "USDC Token: $USDC_TOKEN_ID"
echo "Escrow ID: $ESCROW_CONTRACT_ID"
echo "Lending Pool ID: $LENDING_POOL_CONTRACT_ID"
echo "Milestone ID: $MILESTONE_CONTRACT_ID"
echo "=========================================="

# 1. Setup/fund Demo identities: borrower and investor
echo "Setting up demo identities..."
if command -v stellar &> /dev/null; then
    if ! stellar keys address borrower &> /dev/null; then
        echo "Generating and funding borrower account..."
        stellar keys generate --network "$NETWORK" borrower
    fi

    if ! stellar keys address investor &> /dev/null; then
        echo "Generating and funding investor account..."
        stellar keys generate --network "$NETWORK" investor
    fi

    BORROWER_ADDRESS=$(stellar keys address borrower)
    INVESTOR_ADDRESS=$(stellar keys address investor)
else
    echo "⚠️  Stellar CLI not found. Please install it."
    exit 1
fi

echo "Borrower Address: $BORROWER_ADDRESS"
echo "Investor Address: $INVESTOR_ADDRESS"

echo "------------------------------------------"
echo "Step 1: Borrower deposits 10,000 USDC into Escrow"
echo "------------------------------------------"
# Approve Escrow to transfer USDC (10,000 USDC = 100,000,000,000 stroops)
AMOUNT_ESCROW="100000000000"
echo "Approving Escrow contract to spend $AMOUNT_ESCROW stroops..."
stellar contract invoke \
  --id "$USDC_TOKEN_ID" \
  --source-account borrower \
  --network "$NETWORK" \
  -- approve \
  --from "$BORROWER_ADDRESS" \
  --spender "$ESCROW_CONTRACT_ID" \
  --amount "$AMOUNT_ESCROW" \
  --expiration_ledger 10000000

echo "Depositing into Escrow..."
stellar contract invoke \
  --id "$ESCROW_CONTRACT_ID" \
  --source-account borrower \
  --network "$NETWORK" \
  -- deposit \
  --borrower "$BORROWER_ADDRESS" \
  --amount "$AMOUNT_ESCROW"

echo "Escrow deposit complete!"

echo "------------------------------------------"
echo "Step 2: Investor deposits 100,000 USDC into Lending Pool"
echo "------------------------------------------"
# Approve Lending Pool to transfer USDC (100,000 USDC = 1,000,000,000,000 stroops)
AMOUNT_POOL="1000000000000"
echo "Approving Lending Pool contract to spend $AMOUNT_POOL stroops..."
stellar contract invoke \
  --id "$USDC_TOKEN_ID" \
  --source-account investor \
  --network "$NETWORK" \
  -- approve \
  --from "$INVESTOR_ADDRESS" \
  --spender "$LENDING_POOL_CONTRACT_ID" \
  --amount "$AMOUNT_POOL" \
  --expiration_ledger 10000000

echo "Depositing into Lending Pool..."
stellar contract invoke \
  --id "$LENDING_POOL_CONTRACT_ID" \
  --source-account investor \
  --network "$NETWORK" \
  -- deposit \
  --investor "$INVESTOR_ADDRESS" \
  --amount "$AMOUNT_POOL"

echo "Lending Pool deposit complete!"

echo "------------------------------------------"
echo "Step 3: Borrower requests a 70,000 USDC Loan"
echo "------------------------------------------"
# Generate a unique random 32-byte hex string for the loan_id
LOAN_ID=$(openssl rand -hex 32 2>/dev/null || echo "0101010101010101010101010101010101010101010101010101010101010101")
PRINCIPAL="700000000000" # 70,000 USDC

echo "Requesting Loan (ID: $LOAN_ID) for $PRINCIPAL stroops..."
stellar contract invoke \
  --id "$LENDING_POOL_CONTRACT_ID" \
  --source-account borrower \
  --network "$NETWORK" \
  -- request_loan \
  --borrower "$BORROWER_ADDRESS" \
  --loan_id "$LOAN_ID" \
  --principal "$PRINCIPAL"

echo "Loan requested successfully!"

echo "------------------------------------------"
echo "Step 4: Admin approves the loan request"
echo "------------------------------------------"
echo "Admin approving loan $LOAN_ID..."
stellar contract invoke \
  --id "$LENDING_POOL_CONTRACT_ID" \
  --source-account "$ADMIN_IDENTITY" \
  --network "$NETWORK" \
  -- approve_loan \
  --loan_id "$LOAN_ID"

echo "Loan approved successfully!"
echo "=========================================="
echo "🎉 RemitMortgage Demo Simulator Complete!"
echo "=========================================="
