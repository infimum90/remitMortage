# Local Stellar Quickstart Docker Sandbox Guide

This guide explains how to spin up a local mock Stellar network using the Stellar Quickstart Docker container, configure your local development tools, fund local test accounts, and deploy the RemitMortgage contracts offline.

---

## 1. Prerequisites

Before starting, make sure you have the following installed:
- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli) (v20+ recommended) or [Soroban CLI](https://soroban.stellar.org/docs/getting-started/setup#install-the-soroban-cli)
- Rust toolchain (with target `wasm32-unknown-unknown`)
- `curl` (for interacting with local APIs)

---

## 2. Running the Sandbox

We run the official `stellar/quickstart` image in standalone (local) sandbox mode. This spins up Stellar Core, Horizon, a Soroban RPC server, and an instance of Friendbot locally.

Start the sandbox using Docker Compose from the root directory:

```bash
docker compose up -d
```

Verify that the container is running and healthy:

```bash
docker compose ps
```

### Network Endpoints & Ports

All services are multiplexed and exposed through port `8000`:

| Service | Protocol / URL | Description |
|:---|:---|:---|
| **Horizon API** | `http://localhost:8000/` | Queries ledgers, transactions, and account details |
| **Soroban RPC** | `http://localhost:8000/soroban/rpc` | Standard JSON-RPC endpoint for contract interactions |
| **Friendbot API**| `http://localhost:8000/friendbot` | Faucet service to fund local accounts |

---

## 3. Configuring the CLI & Creating Accounts

To deploy and invoke contracts locally, you need to register the local network in your Stellar CLI configuration and generate a deployer identity.

### A. Register the Local Network

Add the local network parameters to your CLI config:

```bash
stellar network add \
  --rpc-url "http://localhost:8000/soroban/rpc" \
  --network-passphrase "Standalone Network ; Introduction to Horizon" \
  local
```

*(If you are using the older `soroban` CLI, replace `stellar` with `soroban` in all commands)*

### B. Generate a Deployer Identity

Generate a local keypair named `alice` to deploy the contracts:

```bash
stellar keys generate --network local alice
```

To view the public key of the generated identity:

```bash
stellar keys address alice
```

### C. Fund the Account

Fund your newly created local identity using the local Friendbot endpoint:

```bash
curl "http://localhost:8000/friendbot?addr=$(stellar keys address alice)"
```

Confirm that the account is active and has a balance of 10,000 native test tokens (XLM):

```bash
stellar keys balance alice --network local
```

---

## 4. Contract Compiling & Deployment

### A. Build WASM Binaries

From the repository root, compile all smart contracts to WebAssembly:

```bash
cd contracts
cargo build --target wasm32-unknown-unknown --release
```

This compiles your contracts and stores the `.wasm` files under:
`contracts/target/wasm32-unknown-unknown/release/`

### B. Deploy Contracts

Use your funded local identity to deploy the escrow and lending pool contracts to the local sandbox:

```bash
# Deploy Escrow Contract
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/escrow.wasm \
  --source alice \
  --network local

# Deploy Lending Pool Contract
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/lending_pool.wasm \
  --source alice \
  --network local
```

> [!NOTE]
> Save the contract IDs (e.g. `C...`) returned by these commands. You will need to input them in your frontend and backend configuration.

### C. Initialize the Contracts

Invoke the `initialize` function on the deployed contracts. For example, to initialize the escrow contract:

```bash
stellar contract invoke \
  --id <DEPLOYED_ESCROW_CONTRACT_ID> \
  --source alice \
  --network local \
  --fn initialize \
  -- \
  --admin $(stellar keys address alice) \
  --token <USDC_TOKEN_CONTRACT_ID> \
  --target_amount 10000000000 \
  --max_duration_ledgers 518400 \
  --tier1_penalty 500 \
  --tier2_penalty 300 \
  --tier3_penalty 150 \
  --tier4_penalty 50
```

---

## 5. Environment Variables Configuration

To connect the frontend application and backend orchestration services to the local sandbox, update the environment files:

### Backend Configuration (`backend/.env`)

```ini
STELLAR_RPC_URL=http://localhost:8000/soroban/rpc
STELLAR_HORIZON_URL=http://localhost:8000
STELLAR_NETWORK_PASSPHRASE="Standalone Network ; Introduction to Horizon"
ESCROW_CONTRACT_ID="<DEPLOYED_ESCROW_CONTRACT_ID>"
USDC_TOKEN_ID="<DEPLOYED_USDC_TOKEN_ID>"
```

### Frontend Configuration (`frontend/.env.local`)

```ini
NEXT_PUBLIC_HORIZON_URL=http://localhost:8000
NEXT_PUBLIC_NETWORK_PASSPHRASE="Standalone Network ; Introduction to Horizon"
NEXT_PUBLIC_ESCROW_CONTRACT_ID="<DEPLOYED_ESCROW_CONTRACT_ID>"
NEXT_PUBLIC_USDC_TOKEN_ID="<DEPLOYED_USDC_TOKEN_ID>"
```

---

## 6. Tear Down

When you are done testing offline, you can stop the sandbox and remove the associated container data volumes:

```bash
docker compose down -v
```
