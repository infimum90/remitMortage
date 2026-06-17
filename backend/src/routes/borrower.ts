import { Router } from "express";

export const borrowerRouter = Router();

/**
 * GET /api/borrower/:address/status
 *
 * Returns the on-chain status summary for a borrower:
 * escrow balance, loan status, repayment progress, etc.
 * (Placeholder — will integrate with Soroban contract queries)
 */
borrowerRouter.get("/:address/status", async (req, res) => {
  try {
    const { address } = req.params;

    // TODO: Query escrow contract for borrower balance
    // TODO: Query lending pool contract for active loans

    res.json({
      address,
      escrow: {
        deposited: "0",
        target: "0",
        progress: 0,
      },
      loan: {
        status: "none",
        principal: "0",
        disbursed: "0",
        repaid: "0",
      },
    });
  } catch (error) {
    console.error("Borrower status error:", error);
    res.status(500).json({ error: "Failed to fetch borrower status" });
  }
});
