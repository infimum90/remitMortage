# Testnet Setup and USDC Funding

This guide shows how to create testnet accounts and obtain test USDC for end-to-end testing.

1. Create a Stellar testnet account
- Visit the Friendbot endpoint or use the CLI:

  ```bash
  # Generate a new keypair
  soroban keypair generate
  # Fund via friendbot (web):
  curl "https://friendbot.stellar.org?addr=<PUBLIC_KEY>"
  ```

2. Configure Freighter for Testnet
- Install Freighter extension and switch network to Testnet.
- Import the secret key or connect via your hardware wallet.

3. Obtaining test USDC
- For local test tokens, deploy a Stellar asset contract (see Soroban docs) and mint to your test account.

  ```bash
  # Example: deploy a test USDC contract via soroban CLI, then mint
  soroban contract invoke --wasm target/wasm32-unknown-unknown/release/test-token.wasm --fn initialize
  soroban contract invoke --id <TOKEN_ID> --fn mint --args <RECIPIENT> 100000000
  ```

- Alternatively, ask the repo maintainers for a Testnet USDC contract address already seeded for tests.

4. Verify balance

```bash
soroban account balance --account <PUBLIC_KEY> --asset <TOKEN_ID> --network testnet
```

Notes
- Testnet tokens are not real value—only use testnet for development and testing.
- Keep secret keys out of version control.
