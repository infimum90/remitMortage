# Testnet Deployment Guide

This guide explains how to deploy the RemitMortgage contracts to the Stellar testnet, initialize them, and store deployed addresses for local testing.

Prerequisites
- Rust toolchain (stable)
- cargo-contract / soroban CLI (per Soroban docs)
- Stellar CLI (`stellar-core` / `soroban` tooling) or `soroban` CLI
- Freighter wallet browser extension (for interacting with testnet wallets)
- `jq` and `envsubst` (optional helpers)

Build WASM binaries
1. From the repository root, build the contracts:

   ```bash
   cd contracts
   cargo build --target wasm32-unknown-unknown --release
   ```

2. The compiled WASM files will be under `contracts/target/wasm32-unknown-unknown/release/` (or `target/wasm32-unknown-unknown/release/` in each contract workspace).

Deploy contracts to Testnet
1. Set environment variables for your deployer account (use Friendbot to fund):

   ```bash
   export DEPLOYER_KEYPAIR=<YOUR_SECRET>
   export NETWORK=TESTNET
   ```

2. Deploy a contract (example for lending-pool):

   ```bash
   soroban contract deploy --wasm target/wasm32-unknown-unknown/release/lending-pool.wasm --network testnet
   ```

3. Note the returned contract ID/address. Save it to your local `.env` or a `deployed.json` file for later use.

Initialize contracts
1. Use the deployed contract IDs when calling `initialize` entrypoints. Example (pseudocode):

   ```bash
   # Using soroban CLI to invoke initialize
   soroban invoke --id <LENDING_POOL_ID> --fn initialize --args <ADMIN_ADDRESS> <TOKEN_ADDRESS> 800 --network testnet
   ```

2. Repeat for escrow and other contracts, ensuring cross-references (e.g., token address) are correct.

Storing contract IDs
- Create a `.env.testnet` file at the repo root (do NOT commit secrets):

  ```ini
  LENDING_POOL_ID=G...\nESCROW_ID=G...\nTOKEN_ID=G...
  ```

Notes
- Replace `soroban` CLI commands above with the specific CLI you use; the invocation formats may vary.
- For interactive operations, using Freighter in combination with the Soroban web UI may be easier for quick testing.

References
- Soroban docs: https://soroban.stellar.org/docs
- Stellar testnet friendbot: https://developers.stellar.org/docs/testnet/friendbot/
