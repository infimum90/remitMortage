/** Environment configuration with validation. */

export interface Config {
  port: number;
  stellarNetwork: "testnet" | "mainnet";
  horizonUrl: string;
  escrowContractId: string;
  lendingPoolContractId: string;
  usdcTokenId: string;
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env.PORT || "4000", 10),
    stellarNetwork: (process.env.STELLAR_NETWORK as "testnet" | "mainnet") || "testnet",
    horizonUrl:
      process.env.HORIZON_URL || "https://horizon-testnet.stellar.org",
    escrowContractId: process.env.ESCROW_CONTRACT_ID || "",
    lendingPoolContractId: process.env.LENDING_POOL_CONTRACT_ID || "",
    usdcTokenId: process.env.USDC_TOKEN_ID || "",
  };
}
