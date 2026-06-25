# End-to-End Testing Walkthrough (Testnet)

This walkthrough demonstrates the borrower lifecycle on testnet using the deployed contracts.

Prerequisites
- Contracts deployed and initialized (see DEPLOYMENT.md)
- Test accounts funded with XLM and test USDC
- Deployed contract IDs in `.env.testnet`

Steps
1. Fund wallet (Friendbot)

   ```bash
   curl "https://friendbot.stellar.org?addr=${BORROWER_PUBLIC}"
   ```

2. Deposit into escrow (example CLI)

   ```bash
   # Using soroban CLI to call escrow deposit; replace ESCROW_ID and BORROWER_KEY
   soroban invoke --id ${ESCROW_ID} --fn deposit --args ${BORROWER_PUBLIC} 1000 --network testnet
   ```

3. Reach target
- Repeat deposits until the escrow reports target reached.

4. Request loan

   ```bash
   # Generate a unique loan ID (example via openssl)
   LOAN_ID=$(openssl rand -hex 32)
   soroban invoke --id ${LENDING_POOL_ID} --fn request_loan --args ${BORROWER_PUBLIC} ${LOAN_ID} 700 --network testnet
   ```

5. Admin approves

   ```bash
   soroban invoke --id ${LENDING_POOL_ID} --fn approve_loan --args ${LOAN_ID} --network testnet --signer ${ADMIN_KEY}
   ```

6. Disburse

   ```bash
   soroban invoke --id ${LENDING_POOL_ID} --fn disburse --args ${LOAN_ID} ${RECIPIENT_PUBLIC} 700 --network testnet
   ```

7. Repay

   ```bash
   soroban invoke --id ${LENDING_POOL_ID} --fn repay --args ${BORROWER_PUBLIC} ${LOAN_ID} 700 --network testnet
   ```

Verification
- Query loan info and repayment schedule:

  ```bash
  soroban invoke --id ${LENDING_POOL_ID} --fn get_loan_info --args ${LOAN_ID} --network testnet
  soroban invoke --id ${LENDING_POOL_ID} --fn get_repayment_schedule --args ${LOAN_ID} --network testnet
  ```

Notes
- Replace `soroban invoke` with your CLI's invocation pattern if different.
- Some CLIs use JSON argument formatting; consult your CLI docs.
