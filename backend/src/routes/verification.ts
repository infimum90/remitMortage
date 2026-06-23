import { Router } from "express";
import { analyzeRemittanceHistory } from "../services/stellar.js";
import { validateVerificationBody } from "../middleware/validate.js";

export const verificationRouter = Router();

/**
 * POST /api/verification/check
 *
 * Accepts a Stellar wallet address and a recipient address, then
 * queries Horizon for the sender's outgoing USDC payment history
 * to the recipient. Returns a verification summary.
 *
 * Body: { senderAddress: string, recipientAddress: string }
 */
verificationRouter.post("/check", validateVerificationBody, async (req, res) => {
  try {
    const { senderAddress, recipientAddress } = req.body;

    // Validation middleware ensures inputs are present and valid

    const result = await analyzeRemittanceHistory(
      senderAddress,
      recipientAddress
    );

    res.json(result);
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({ error: "Verification service failed" });
  }
});
